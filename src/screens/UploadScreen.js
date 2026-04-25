import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Linking,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';
import { creditReportsAPI, pointsAPI, runPostUploadAnalysis } from '../services/api';
import { scheduleLocalNotification } from '../services/notifications';
import ProgressMessage from '../components/ProgressMessage';
import { useUpload } from '../context/UploadContext';

const UPLOAD_MESSAGES = [
  'Uploading your report...',
  'Reading your accounts...',
  'Detecting credit bureaus...',
  'Analyzing account statuses...',
  'Identifying negative items...',
  'AI is generating your action plan...',
  'Building your Quick Wins...',
  'Almost ready...',
];

// Messages cycled in the success card while the backend processes the report.
// First item interpolates the bureau name dynamically (see usage).
const PROCESSING_MESSAGES = (bureau) => [
  `Reading your ${bureau || 'credit'} report...`,
  'Identifying your accounts...',
  'Detecting negative items...',
  'Categorizing active damage...',
  'Finding removable collections...',
  'Analyzing account ages...',
  'Building your action plan...',
  'Calculating score impact...',
  'Almost ready...',
];

// iMessage-style three-dot pulsing indicator. Each dot loops with a staggered
// delay so the pulse travels left-to-right. useNativeDriver keeps it smooth.
const TypingDots = ({ color = '#64748B' }) => {
  const dots = [useRef(new Animated.Value(0.35)).current,
                useRef(new Animated.Value(0.35)).current,
                useRef(new Animated.Value(0.35)).current];
  useEffect(() => {
    const animations = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(v, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(v, { toValue: 0.35, duration: 400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.delay((2 - i) * 180),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            opacity: v,
            transform: [{ scale: v.interpolate({ inputRange: [0.35, 1], outputRange: [0.8, 1.1] }) }],
          }}
        />
      ))}
    </View>
  );
};

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  alertAmber: '#F97316',
  teal: '#0D9488',
  background: '#0F172A',
  card: '#1E293B',
  surface: '#243047',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
};

const ACR_URL = 'https://www.annualcreditreport.com';

const BUREAUS = [
  { id: 'TransUnion',  short: 'TU', color: '#3B82F6' },
  { id: 'Equifax',     short: 'EQ', color: '#EF4444' },
  { id: 'Experian',    short: 'EX', color: '#10B981' },
];

const WEEKLY_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const REMINDER_PREF_KEY = '@cs_report_reminder_pref';

// Keywords in filenames that strongly suggest a non-ACR source
const BAD_FILENAME_SIGNALS = [
  'creditkarma', 'credit-karma', 'myfico', 'my_fico', 'experian-app',
  'experian_app', 'equifaxapp', 'creditwise', 'discovercredit',
  'turboscore', 'mint', 'nerdwallet',
];

// Keywords in filenames that suggest an official ACR report
const GOOD_FILENAME_SIGNALS = [
  'annualcreditreport', 'annual_credit', 'annual-credit',
  'credit_report', 'credit-report', 'creditreport',
  'consumer_disclosure', 'file_disclosure',
];

// Parse error help message shown when the server fails to read the PDF
const PARSE_ERROR_HELP =
  'We had trouble reading this report. Please make sure:\n\n' +
  '• The report is downloaded as a PDF from AnnualCreditReport.com\n' +
  '• The PDF is not password protected\n' +
  '• You selected the correct bureau before uploading\n\n' +
  'If you continue to have issues please email support@creditstamina.com';

const validateFilename = (name = '') => {
  const lower = name.toLowerCase().replace(/\s/g, '');
  const isBad  = BAD_FILENAME_SIGNALS.some(s => lower.includes(s));
  const isGood = GOOD_FILENAME_SIGNALS.some(s => lower.includes(s));
  if (isBad)  return 'bad';
  if (isGood) return 'good';
  return 'unknown';
};

// Schedule a weekly local notification for the given day-of-week index (0=Sun)
const scheduleWeeklyReminder = (dayIndex) => {
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = (dayIndex - currentDay + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // push to next week if today
  const fire = new Date(now);
  fire.setDate(fire.getDate() + daysUntil);
  fire.setHours(9, 0, 0, 0);
  scheduleLocalNotification(
    'Free Credit Report Available',
    'Your weekly free credit report is available! Visit AnnualCreditReport.com to download your latest report and upload it to Credit Stamina to track your progress.',
    fire,
    { screen: 'Upload', action: 'weekly_reminder' }
  );
};

// ── Bureau status helpers ─────────────────────────────────────────────────────

const getBureauStatus = (bureauId, reports) => {
  const matches = reports.filter(r =>
    (r.bureau || '').toLowerCase() === bureauId.toLowerCase()
  );
  if (matches.length === 0) return { status: 'none', latestDate: null };
  const latest = matches.sort((a, b) =>
    new Date(b.created_at || b.uploaded_at || 0) - new Date(a.created_at || a.uploaded_at || 0)
  )[0];
  const uploadedAt = new Date(latest.created_at || latest.uploaded_at);
  const daysSince = Math.floor((Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60 * 24));
  return {
    status:     daysSince > 30 ? 'stale' : 'ok',
    latestDate: uploadedAt,
    accountsCount: latest.accounts_count,
  };
};

const BureauStatusDot = ({ status }) => {
  if (status === 'ok')    return <Text style={styles.dotGreen}>●</Text>;
  if (status === 'stale') return <Text style={styles.dotYellow}>●</Text>;
  return <Text style={styles.dotGray}>○</Text>;
};

// ── Main Screen ───────────────────────────────────────────────────────────────

const UploadScreen = ({ navigation }) => {
  const [selectedBureau, setSelectedBureau] = useState(null);
  const [selectedFile, setSelectedFile]     = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing]               = useState(false);
  const [result, setResult]                 = useState(null);
  const [error, setError]                   = useState(null);
  const [isParseError, setIsParseError]     = useState(false);
  const [analysisStep, setAnalysisStep]     = useState(''); // post-upload AI analysis progress

  // Global upload state — polling lives in UploadContext so the banner above
  // the navigation stack stays in sync regardless of which screen is visible.
  const upload = useUpload();

  const [reports, setReports]               = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [showWhyThree, setShowWhyThree]     = useState(false);

  // Weekly reminder
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay]         = useState(1); // Monday default
  const [reminderLoaded, setReminderLoaded]   = useState(false);

  useEffect(() => {
    loadHistory();
    loadReminderPref();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await creditReportsAPI.getAll();
      const data = res?.data || [];
      setReports(Array.isArray(data) ? data : []);
    } catch {
      // non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadReminderPref = async () => {
    try {
      const raw = await AsyncStorage.getItem(REMINDER_PREF_KEY);
      if (raw) {
        const pref = JSON.parse(raw);
        setReminderEnabled(!!pref.enabled);
        setReminderDay(typeof pref.day === 'number' ? pref.day : 1);
      }
    } catch {}
    setReminderLoaded(true);
  };

  const saveReminderPref = async (enabled, day) => {
    try {
      await AsyncStorage.setItem(REMINDER_PREF_KEY, JSON.stringify({ enabled, day }));
      if (enabled) scheduleWeeklyReminder(day);
    } catch {}
  };

  const handleReminderToggle = (val) => {
    setReminderEnabled(val);
    saveReminderPref(val, reminderDay);
  };

  const handleReminderDayChange = (day) => {
    setReminderDay(day);
    if (reminderEnabled) saveReminderPref(true, day);
  };

  const handleDeleteReport = (id, bureau) => {
    Alert.alert(
      'Delete Report',
      `Remove this ${bureau} report? Accounts extracted from it will remain.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await creditReportsAPI.delete(id);
              setReports(prev => prev.filter(r => r.id !== id));
            } catch {
              Alert.alert('Error', 'Failed to delete report. Please try again.');
            }
          },
        },
      ]
    );
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
        allowMultiSelection: false,
      });
      if (!res?.[0]) return;
      const file = {
        uri:  res[0].uri,
        name: res[0].name,
        size: res[0].size,
        type: res[0].type,
      };

      const signal = validateFilename(file.name);
      if (signal === 'bad') {
        Alert.alert(
          'Unexpected Report Source',
          'This file does not appear to be from AnnualCreditReport.com. Our analysis is specifically built for official reports.\n\nAre you sure you want to continue?',
          [
            { text: 'Go Get Official Report', style: 'cancel', onPress: () => openACR() },
            {
              text: 'Continue Anyway',
              onPress: () => { setSelectedFile(file); setError(null); setResult(null); },
            },
          ]
        );
        return;
      }

      setSelectedFile(file);
      setError(null);
      setResult(null);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to open file picker.');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No File Selected', 'Please select a PDF credit report.');
      return;
    }
    if (!selectedBureau) {
      Alert.alert('Select Bureau', 'Please select which bureau this report is from before uploading.');
      return;
    }

    // Warn if filename looks wrong (unknown source) — one more gate
    const signal = validateFilename(selectedFile.name);
    if (signal === 'unknown') {
      await new Promise((resolve) => {
        Alert.alert(
          'Confirm Report Source',
          'This report may not be from AnnualCreditReport.com. Our analysis works best with official reports. Are you sure you want to continue?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
            { text: 'Continue', onPress: () => resolve('ok') },
          ]
        );
      }).then((res) => {
        if (res === 'cancel') throw new Error('CANCELLED');
      }).catch((e) => {
        if (e.message === 'CANCELLED') return;
      });
      // If cancelled via alert the upload flag won't be set — guard:
      if (uploading) return;
    }

    setUploading(true);
    setUploadProgress(0);
    setParsing(false);
    setError(null);
    setIsParseError(false);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('pdf', {
        uri:  Platform.OS === 'ios' ? selectedFile.uri.replace('file://', '') : selectedFile.uri,
        type: selectedFile.type || 'application/pdf',
        name: selectedFile.name,
      });
      formData.append('bureau', selectedBureau);

      setUploading(false);
      setParsing(true);

      const response = await creditReportsAPI.upload(formData, (progress) => {
        setUploadProgress(progress);
      });

      // Backend returns 202 { uploadId, status: 'processing' } — server is
      // analyzing in the background. We do NOT poll the user's screen any
      // more; the on-focus refresh in AccountsScreen / DashboardScreen /
      // ActionsScreen / ScoreScreen + a push notification when processing
      // completes is the new mechanism. Free the UI immediately.
      const uploadId =
        response?.data?.uploadId ||
        response?.data?.id ||
        response?.data?.report_id ||
        null;

      if (!uploadId) {
        setUploading(false);
        setParsing(false);
        setError('Upload accepted but no upload ID was returned. Please try again.');
        return;
      }

      setUploading(false);
      setParsing(false);
      setAnalysisStep('');

      // Award upload points right away (idempotent on the points side).
      pointsAPI.award('upload_report', 'Uploaded credit report', 50).catch(() => null);
      loadHistory();

      // Warm the AI caches in the background so Action Plan / Quick Wins /
      // Score Tips screens load instantly on first view. Pure fire-and-forget;
      // user is no longer waiting on it. Failures are non-blocking — the
      // screens will fall back to fetching live when opened.
      runPostUploadAnalysis(uploadId, [], [], () => {})
        .catch((e) => console.warn('[Upload] post-upload analysis warmup error:', e?.message));

      // Show the success card. The actual processing state + lane counts
      // come in via UploadContext — its global poll feeds both this card and
      // the persistent ProcessingBanner above the nav stack.
      setResult({
        success: true,
        uploadId,
        bureau: selectedBureau,
      });

      upload.startProcessing(uploadId, selectedBureau);
    } catch (err) {
      setUploading(false);
      setParsing(false);
      setAnalysisStep('');
      const msg = err?.response?.data?.error || err?.message || 'Upload failed';
      // Detect parse failures
      const isParseFailure =
        msg.toLowerCase().includes('parse') ||
        msg.toLowerCase().includes('extract') ||
        msg.toLowerCase().includes('read') ||
        msg.toLowerCase().includes('format');
      setIsParseError(isParseFailure);
      setError(msg);
    }
  };

  const openACR = () =>
    Linking.openURL(ACR_URL).catch(() =>
      Alert.alert('Unable to Open', `Please visit ${ACR_URL} in your browser.`)
    );

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatShortDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Import Credit Report</Text>
        <Text style={styles.subtitle}>Upload your official AnnualCreditReport.com PDF</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Where to Get Your Report ── */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsHeading}>Where to get your free credit report</Text>
          <Text style={styles.instructionsIntro}>
            Credit Stamina is designed to work with official credit reports from{' '}
            <Text style={styles.acrHighlight}>AnnualCreditReport.com</Text> — the only
            federally authorized source for free credit reports. You are entitled to a free
            report from each bureau (TransUnion, Equifax, and Experian) every week.
          </Text>

          <View style={styles.stepsList}>
            {[
              'Visit AnnualCreditReport.com',
              'Log in or create a free account',
              'Request your free report from TransUnion, Equifax, or Experian',
              'Download the report as a PDF',
              'Come back here and upload it',
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          {/* CTA button */}
          <TouchableOpacity style={styles.acrBtn} onPress={openACR} activeOpacity={0.85}>
            <Text style={styles.acrBtnText}>Get Your Free Report at AnnualCreditReport.com →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Warning Box ── */}
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠</Text>
          <View style={styles.warningBody}>
            <Text style={styles.warningTitle}>Important</Text>
            <Text style={styles.warningText}>
              Only upload reports from AnnualCreditReport.com. Reports from other sources
              like Credit Karma, Experian app, myFICO, or other third-party services use
              different formats and may not parse correctly. Using reports from other sources
              may result in inaccurate analysis.
            </Text>
          </View>
        </View>

        {/* ── Bureau Coverage Panel ── */}
        <View style={styles.coverageCard}>
          <Text style={styles.sectionLabel}>REPORT COVERAGE</Text>
          {historyLoading ? (
            <ActivityIndicator size="small" color={COLORS.purple} style={{ paddingVertical: 8 }} />
          ) : (
            BUREAUS.map((b) => {
              const { status, latestDate, accountsCount } = getBureauStatus(b.id, reports);
              return (
                <View key={b.id} style={styles.coverageRow}>
                  <BureauStatusDot status={status} />
                  <View style={[styles.coverageBureauBadge, { backgroundColor: b.color + '20', borderColor: b.color + '40' }]}>
                    <Text style={[styles.coverageBureauText, { color: b.color }]}>{b.short}</Text>
                  </View>
                  <View style={styles.coverageInfo}>
                    <Text style={styles.coverageName}>{b.id}</Text>
                    {status === 'none' && (
                      <Text style={styles.coverageSub}>No report uploaded yet</Text>
                    )}
                    {status === 'ok' && (
                      <Text style={[styles.coverageSub, { color: COLORS.success }]}>
                        Uploaded {formatShortDate(latestDate)}
                        {accountsCount != null ? ` · ${accountsCount} accounts` : ''}
                      </Text>
                    )}
                    {status === 'stale' && (
                      <Text style={[styles.coverageSub, { color: COLORS.warning }]}>
                        Last uploaded {formatShortDate(latestDate)} · Time to refresh
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Why Upload All Three ── */}
        <TouchableOpacity
          style={styles.whyThreeRow}
          onPress={() => setShowWhyThree(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.whyThreeTitle}>Why upload all three?</Text>
          <Text style={styles.whyThreeChevron}>{showWhyThree ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showWhyThree && (
          <View style={styles.whyThreeBody}>
            <Text style={styles.whyThreeText}>
              Each credit bureau maintains its own separate file on you. Creditors do not
              always report to all three bureaus, so uploading all three reports gives you
              the most complete picture of your credit and maximizes the number of disputes
              you can file.
            </Text>
          </View>
        )}

        {/* ── Bureau Selection ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHICH BUREAU IS THIS REPORT FROM?</Text>
          <Text style={styles.sectionHint}>
            Select the correct bureau so our parser knows which format to expect.
          </Text>
          <View style={styles.bureauRow}>
            {BUREAUS.map((bureau) => {
              const { status } = getBureauStatus(bureau.id, reports);
              const isSelected = selectedBureau === bureau.id;
              return (
                <TouchableOpacity
                  key={bureau.id}
                  style={[
                    styles.bureauBtn,
                    isSelected && { borderColor: bureau.color, backgroundColor: bureau.color + '20' },
                  ]}
                  onPress={() => setSelectedBureau(bureau.id)}
                  activeOpacity={0.7}
                >
                  <BureauStatusDot status={status} />
                  <Text style={[styles.bureauShort, isSelected && { color: bureau.color }]}>
                    {bureau.short}
                  </Text>
                  <Text style={styles.bureauFull}>{bureau.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── File Picker ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SELECT PDF</Text>
          <TouchableOpacity
            style={[styles.dropZone, selectedFile && styles.dropZoneActive]}
            onPress={pickDocument}
            activeOpacity={0.75}
          >
            <Text style={styles.dropIcon}>{selectedFile ? '📎' : '📄'}</Text>
            {selectedFile ? (
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={2}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>{formatFileSize(selectedFile.size)}</Text>
                <TouchableOpacity
                  style={styles.clearFileBtn}
                  onPress={() => setSelectedFile(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearFileBtnText}>✕ Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dropPlaceholder}>
                <Text style={styles.dropTitle}>Tap to select PDF</Text>
                <Text style={styles.dropHint}>From AnnualCreditReport.com · Max 20 MB</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── AI Processing Disclosure ── */}
        <View style={styles.aiDisclosureCard}>
          <Text style={styles.aiDisclosureTitle}>How your report is processed</Text>
          <Text style={styles.aiDisclosureBody}>
            By uploading your credit report you agree that your report data will be processed by AI to extract and analyze your accounts. Your raw PDF is never stored — only structured account data is saved to your account.
          </Text>
        </View>

        {/* ── Upload Button ── */}
        <TouchableOpacity
          style={[
            styles.uploadBtn,
            (!selectedFile || !selectedBureau || uploading || parsing) && styles.uploadBtnDisabled,
          ]}
          onPress={handleUpload}
          disabled={!selectedFile || !selectedBureau || uploading || parsing}
          activeOpacity={0.85}
        >
          {uploading || parsing ? (
            <View style={styles.btnLoading}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.uploadBtnText}>
                {uploading ? `Uploading… ${uploadProgress}%` : 'AI is analyzing your report…'}
              </Text>
            </View>
          ) : (
            <Text style={styles.uploadBtnText}>Upload & Parse</Text>
          )}
        </TouchableOpacity>

        {/* ── Error ── */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>⚠ Upload Problem</Text>
            {isParseError ? (
              <Text style={styles.errorBody}>{PARSE_ERROR_HELP}</Text>
            ) : (
              <Text style={styles.errorBody}>{error}</Text>
            )}
          </View>
        )}

        {/* ── Background AI analysis progress banner ── */}
        {(uploading || parsing || !!analysisStep) && (
          <View style={styles.analysisBanner}>
            <ActivityIndicator size="small" color={COLORS.purple} style={{ marginRight: 8 }} />
            {analysisStep ? (
              <Text style={styles.analysisStepText}>{analysisStep}</Text>
            ) : (
              <ProgressMessage
                messages={UPLOAD_MESSAGES}
                style={styles.analysisProgress}
                textStyle={styles.analysisStepText}
              />
            )}
          </View>
        )}

        {/* ── Success Result ── */}
        {result?.success && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>✅</Text>
              <View style={{ flex: 1 }}>
                {/* Card display is driven by the shared UploadContext —
                    same source of truth as the global ProcessingBanner. */}
                {upload.uploadId === result.uploadId && upload.status === 'complete' ? (
                  <>
                    <Text style={styles.resultTitle}>Your analysis is ready!</Text>
                    <Text style={styles.resultSub}>
                      Found {upload.accountsFound ?? 0} account{upload.accountsFound === 1 ? '' : 's'}{result.bureau ? ` on your ${result.bureau} report` : ''}.
                    </Text>
                    <View style={styles.laneBreakdown}>
                      <View style={styles.laneRow}>
                        <View style={[styles.laneDot, { backgroundColor: COLORS.danger }]} />
                        <Text style={[styles.laneCount, { color: COLORS.danger }]}>
                          {upload.laneCounts?.activeDamage ?? 0}
                        </Text>
                        <Text style={styles.laneLabel}>need immediate attention</Text>
                      </View>
                      <View style={styles.laneRow}>
                        <View style={[styles.laneDot, { backgroundColor: COLORS.warning }]} />
                        <Text style={[styles.laneCount, { color: COLORS.warning }]}>
                          {upload.laneCounts?.removable ?? 0}
                        </Text>
                        <Text style={styles.laneLabel}>can be disputed</Text>
                      </View>
                      <View style={styles.laneRow}>
                        <View style={[styles.laneDot, { backgroundColor: COLORS.textSecondary }]} />
                        <Text style={[styles.laneCount, { color: COLORS.textSecondary }]}>
                          {upload.laneCounts?.agingMonitor ?? 0}
                        </Text>
                        <Text style={styles.laneLabel}>to monitor</Text>
                      </View>
                    </View>
                  </>
                ) : upload.uploadId === result.uploadId && upload.status === 'error' ? (
                  <>
                    <Text style={styles.resultTitle}>Report uploaded successfully!</Text>
                    <Text style={styles.resultSub}>
                      {upload.errorMessage || 'We hit a snag analyzing your report. Please try again.'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.resultTitle}>Report uploaded successfully!</Text>
                    <ProgressMessage
                      messages={PROCESSING_MESSAGES(result.bureau)}
                      interval={3000}
                      color={COLORS.textSecondary}
                      style={styles.processingMessage}
                      textStyle={styles.processingMessageText}
                    />
                    <TypingDots color={COLORS.textSecondary} />
                  </>
                )}
              </View>
            </View>
            <View style={styles.resultActions}>
              <TouchableOpacity
                style={[styles.resultBtn, styles.resultBtnPrimary]}
                onPress={() => navigation.navigate('Accounts')}
                activeOpacity={0.85}
              >
                <Text style={styles.resultBtnPrimaryText}>View Accounts</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultBtn, styles.resultBtnSecondary]}
                onPress={() => navigation.navigate('Dashboard')}
                activeOpacity={0.85}
              >
                <Text style={styles.resultBtnSecondaryText}>Continue to App</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Weekly Reminder ── */}
        {reminderLoaded && (
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderHeaderText}>
                <Text style={styles.reminderTitle}>Weekly Report Reminder</Text>
                <Text style={styles.reminderSub}>
                  Get a weekly reminder to check for updates to your credit report.
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                trackColor={{ false: COLORS.border, true: COLORS.teal }}
                thumbColor={reminderEnabled ? '#fff' : COLORS.textSecondary}
                ios_backgroundColor={COLORS.border}
              />
            </View>
            {reminderEnabled && (
              <View style={styles.dayPicker}>
                <Text style={styles.dayPickerLabel}>Remind me on:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
                  {WEEKLY_DAYS.map((day, idx) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayChip, reminderDay === idx && styles.dayChipActive]}
                      onPress={() => handleReminderDayChange(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayChipText, reminderDay === idx && styles.dayChipTextActive]}>
                        {day.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.reminderNote}>
                  You'll receive a notification every {WEEKLY_DAYS[reminderDay]} at 9 AM reminding you to refresh your reports.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Upload History ── */}
        {(reports.length > 0 || historyLoading) && (
          <View style={styles.historyCard}>
            <Text style={styles.sectionLabel}>UPLOAD HISTORY</Text>
            {historyLoading ? (
              <ActivityIndicator size="small" color={COLORS.purple} style={{ paddingVertical: 12 }} />
            ) : (
              reports.map((r, i) => {
                const bureauColor =
                  r.bureau === 'Equifax'    ? '#EF4444' :
                  r.bureau === 'Experian'   ? '#10B981' : '#3B82F6';
                const date = r.created_at || r.uploaded_at
                  ? formatShortDate(new Date(r.created_at || r.uploaded_at))
                  : 'Unknown date';
                return (
                  <View
                    key={r.id ?? `report-${i}`}
                    style={[styles.historyRow, i < reports.length - 1 && styles.historyRowBorder]}
                  >
                    <View style={[styles.historyDot, { backgroundColor: bureauColor }]} />
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyBureau}>{r.bureau || 'Unknown'}</Text>
                      <Text style={styles.historyDate}>{date}</Text>
                      {r.accounts_count != null && (
                        <Text style={styles.historyCount}>{r.accounts_count} accounts extracted</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteReport(r.id, r.bureau)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        <Text style={styles.footerNote}>
          Credit Stamina uses official AnnualCreditReport.com reports to ensure accurate
          analysis and dispute generation.
        </Text>

      </ScrollView>

      {/* ── AI Processing Overlay ── */}
      <Modal visible={parsing} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayBox}>
            <ActivityIndicator size="large" color={COLORS.purple} style={{ marginBottom: 16 }} />
            <Text style={styles.overlayTitle}>Processing your report…</Text>
            <Text style={styles.overlaySub}>Large reports may take up to 2 minutes</Text>
            <View style={styles.overlaySteps}>
              {[
                'Uploading your report…',
                'Reading your accounts…',
                'AI is analyzing your credit…',
                'Building your action plan…',
              ].map((step, i) => (
                <Text key={i} style={styles.overlayStepItem}>• {step}</Text>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title:    { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionHint: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, lineHeight: 17 },

  section: { marginBottom: 20 },

  // ── Instructions card ──
  instructionsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.teal,
    padding: 16,
    marginBottom: 16,
  },
  instructionsHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  instructionsIntro: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 14,
  },
  acrHighlight: { color: COLORS.teal, fontWeight: '600' },

  stepsList: { marginBottom: 16 },
  stepRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.teal,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stepText:      { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },

  acrBtn: {
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  acrBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  // ── Warning box ──
  warningBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.warning + '15',
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  warningIcon: { fontSize: 18, color: COLORS.warning, flexShrink: 0, marginTop: 1 },
  warningBody: { flex: 1 },
  warningTitle: { fontSize: 13, fontWeight: '700', color: COLORS.warning, marginBottom: 4 },
  warningText:  { fontSize: 12, color: '#B45309', lineHeight: 17 },

  // ── Coverage panel ──
  coverageCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  coverageBureauBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  coverageBureauText: { fontSize: 12, fontWeight: '800' },
  coverageInfo:       { flex: 1 },
  coverageName:       { fontSize: 14, fontWeight: '600', color: COLORS.text },
  coverageSub:        { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },

  dotGreen:  { fontSize: 14, color: COLORS.success },
  dotYellow: { fontSize: 14, color: COLORS.warning },
  dotGray:   { fontSize: 14, color: COLORS.textSecondary },

  // ── Why upload all three ──
  whyThreeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 4,
  },
  whyThreeTitle:   { fontSize: 13, fontWeight: '600', color: COLORS.text },
  whyThreeChevron: { fontSize: 11, color: COLORS.textSecondary },
  whyThreeBody:    {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 14,
    marginBottom: 16,
  },
  whyThreeText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  // ── Bureau selection ──
  bureauRow: { flexDirection: 'row', gap: 10 },
  bureauBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    gap: 4,
  },
  bureauShort: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  bureauFull:  { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },

  // ── Drop zone ──
  dropZone: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  dropZoneActive: { borderColor: COLORS.teal, borderStyle: 'solid' },
  dropIcon:       { fontSize: 40, marginBottom: 10 },
  dropPlaceholder: { alignItems: 'center' },
  dropTitle:       { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  dropHint:        { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  fileInfo:        { alignItems: 'center', gap: 4 },
  fileName:        { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  fileSize:        { fontSize: 12, color: COLORS.textSecondary },
  clearFileBtn:    { marginTop: 6 },
  clearFileBtnText: { fontSize: 12, color: COLORS.danger, fontWeight: '600' },

  // ── Upload button ──
  uploadBtn: {
    backgroundColor: COLORS.staminaBlue,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadBtnDisabled: { backgroundColor: COLORS.border, opacity: 0.6 },
  uploadBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnLoading:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analysisBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purple + '20',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.purple + '40',
  },
  analysisStepText: { flex: 1, fontSize: 13, color: COLORS.purple, fontWeight: '500' },
  aiDisclosureCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.purple,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  aiDisclosureTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  aiDisclosureBody: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  analysisProgress: { flex: 1, marginTop: 0, paddingHorizontal: 0, alignItems: 'flex-start' },

  // ── Error card ──
  errorCard: {
    backgroundColor: COLORS.danger + '15',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginBottom: 8 },
  errorBody:  { fontSize: 13, color: '#F87171', lineHeight: 20 },

  // ── Result card ──
  resultCard: {
    backgroundColor: COLORS.success + '12',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
    marginBottom: 16,
    overflow: 'hidden',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  resultIcon:   { fontSize: 30 },
  resultTitle:  { fontSize: 15, fontWeight: '700', color: COLORS.success },
  resultSub:    { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  resultAccounts: {
    borderTopWidth: 1,
    borderTopColor: COLORS.success + '25',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultAcctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  resultAcctBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resultDot:        { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  resultAcctName:   { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },
  resultLaneTag:    { fontSize: 11, fontWeight: '600' },
  resultMore:       { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 6 },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  resultBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  resultBtnPrimary: { backgroundColor: COLORS.success },
  resultBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resultBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.success + '60' },
  resultBtnSecondaryText: { color: COLORS.success, fontSize: 14, fontWeight: '600' },
  processingMessage: { alignItems: 'flex-start', paddingHorizontal: 0, marginTop: 6 },
  processingMessageText: { fontSize: 12, fontWeight: '500', textAlign: 'left' },
  laneBreakdown: { marginTop: 10, gap: 4 },
  laneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  laneDot: { width: 7, height: 7, borderRadius: 4 },
  laneCount: { fontSize: 14, fontWeight: '800', minWidth: 20 },
  laneLabel: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },

  // ── Weekly reminder ──
  reminderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  reminderHeader:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderHeaderText: { flex: 1 },
  reminderTitle:      { fontSize: 14, fontWeight: '600', color: COLORS.text },
  reminderSub:        { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },

  dayPicker: { marginTop: 14 },
  dayPickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dayScroll: { marginBottom: 10 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: 8,
  },
  dayChipActive:     { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  dayChipText:       { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  dayChipTextActive: { color: '#fff' },
  reminderNote:      { fontSize: 11, color: COLORS.textSecondary, lineHeight: 15, fontStyle: 'italic' },

  // ── Upload history ──
  historyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyDot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  historyInfo:      { flex: 1 },
  historyBureau:    { fontSize: 14, fontWeight: '600', color: COLORS.text },
  historyDate:      { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  historyCount:     { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  deleteBtn:        { padding: 6, borderRadius: 8, backgroundColor: COLORS.danger + '20' },
  deleteBtnText:    { fontSize: 12, color: COLORS.danger, fontWeight: '600' },

  footerNote: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },

  // ── Overlay ──
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBox: {
    backgroundColor: COLORS.card,
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  overlayTitle:    { fontSize: 17, fontWeight: '600', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  overlaySub:      { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 12 },
  overlaySteps:    { alignSelf: 'stretch', marginTop: 4 },
  overlayStepItem: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
});

export default UploadScreen;
