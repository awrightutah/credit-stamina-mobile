import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { creditReportsAPI, pointsAPI } from '../services/api';

const COLORS = {
  // Credit Stamina Brand Colors (matching PWA)
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#F97316',
  errorRed: '#DC2626',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
};

const BUREAUS = [
  { id: 'TU', name: 'TransUnion', color: '#3B82F6' },
  { id: 'EQ', name: 'Equifax', color: '#EF4444' },
  { id: 'EX', name: 'Experian', color: '#10B981' },
];

const UploadScreen = ({ navigation }) => {
  const [selectedBureau, setSelectedBureau] = useState('TU');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Upload history
  const [reports, setReports] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await creditReportsAPI.getAll();
      const data = res?.data || [];
      setReports(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore — history is non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteReport = (id, bureau) => {
    Alert.alert(
      'Delete Report',
      `Remove this ${bureau} credit report? The accounts extracted from it will remain.`,
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
      
      if (res && res[0]) {
        setSelectedFile({
          uri: res[0].uri,
          name: res[0].name,
          size: res[0].size,
          type: res[0].type,
        });
        setError(null);
        setResult(null);
      }
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('Document picker error:', err);
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No File Selected', 'Please select a PDF credit report to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setParsing(false);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('pdf', {
        uri: Platform.OS === 'ios' ? selectedFile.uri.replace('file://', '') : selectedFile.uri,
        type: selectedFile.type || 'application/pdf',
        name: selectedFile.name,
      });
      formData.append('bureau', BUREAUS.find(b => b.id === selectedBureau)?.name || 'TransUnion');

      setUploading(false);
      setParsing(true);

      const response = await creditReportsAPI.upload(formData, (progress) => {
        setUploadProgress(progress);
      });

      setParsing(false);
      
      if (response.data) {
        setResult({
          success: true,
          accountsFound: response.data.accounts?.length || 0,
          bureau: response.data.bureau,
          accounts: response.data.accounts || [],
        });
        
        // Award points for uploading a report (non-blocking)
        pointsAPI.award('upload_report', 'Uploaded credit report', 50).catch(() => null);

        // Refresh history list
        loadHistory();

        // Navigate to accounts after successful upload
        setTimeout(() => {
          Alert.alert(
            'Upload Complete!',
            `Found ${response.data.accounts?.length || 0} accounts. View them now?`,
            [
              { text: 'Stay Here', style: 'cancel' },
              { 
                text: 'View Accounts', 
                onPress: () => navigation.navigate('Accounts')
              },
            ]
          );
        }, 500);
      }
    } catch (err) {
      setUploading(false);
      setParsing(false);
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to upload and parse credit report');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Import Credit Report</Text>
        <Text style={styles.subtitle}>
          Upload your credit report PDF and AI will extract all accounts
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Bureau Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Bureau</Text>
          <View style={styles.bureauContainer}>
            {BUREAUS.map((bureau) => (
              <TouchableOpacity
                key={bureau.id}
                style={[
                  styles.bureauButton,
                  selectedBureau === bureau.id && { borderColor: bureau.color, backgroundColor: bureau.color + '20' },
                ]}
                onPress={() => setSelectedBureau(bureau.id)}
              >
                <Text style={[
                  styles.bureauText,
                  selectedBureau === bureau.id && { color: bureau.color },
                ]}>
                  {bureau.id}
                </Text>
                <Text style={styles.bureauName}>{bureau.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* File Upload Area */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Report PDF</Text>
          <TouchableOpacity style={styles.uploadArea} onPress={pickDocument}>
            <Text style={styles.uploadIcon}>📄</Text>
            {selectedFile ? (
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>{formatFileSize(selectedFile.size)}</Text>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Text style={styles.uploadText}>Tap to select PDF</Text>
                <Text style={styles.uploadSubtext}>
                  Supports Equifax, Experian, TransUnion PDFs
                </Text>
                <Text style={styles.uploadSubtext}>Max 20MB</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Need Report Link */}
        <View style={styles.helpSection}>
          <Text style={styles.helpText}>
            Need a report? Get your WEEKLY free report at{' '}
            <Text style={styles.linkText}>AnnualCreditReport.com</Text>
          </Text>
        </View>

        {/* Upload Button */}
        <TouchableOpacity
          style={[
            styles.uploadButton,
            (!selectedFile || uploading || parsing) && styles.uploadButtonDisabled,
          ]}
          onPress={handleUpload}
          disabled={!selectedFile || uploading || parsing}
        >
          {uploading || parsing ? (
            <View style={styles.buttonLoading}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.uploadButtonText}>
                {uploading ? `Uploading... ${uploadProgress}%` : 'AI is parsing your report...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.uploadButtonText}>Upload & Parse</Text>
          )}
        </TouchableOpacity>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Result Display */}
        {result && result.success && (
          <View style={styles.resultContainer}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>✅</Text>
              <View>
                <Text style={styles.resultTitle}>Upload Complete!</Text>
                <Text style={styles.resultText}>
                  {result.accountsFound} account{result.accountsFound !== 1 ? 's' : ''} extracted from {result.bureau}
                </Text>
              </View>
            </View>
            {result.accounts && result.accounts.length > 0 && (
              <View style={styles.resultAccounts}>
                {result.accounts.slice(0, 5).map((acct, i) => {
                  const laneColors = { Negative: COLORS.danger, Removable: COLORS.warning, Aging: COLORS.warning, Monitor: COLORS.textSecondary, Positive: COLORS.success };
                  const laneColor = laneColors[acct.lane] ?? COLORS.textSecondary;
                  return (
                    <View key={acct.id ?? `a-${i}`} style={[styles.resultAccountRow, i < Math.min(result.accounts.length, 5) - 1 && styles.resultAccountBorder]}>
                      <View style={[styles.resultLaneDot, { backgroundColor: laneColor }]} />
                      <Text style={styles.resultAccountName} numberOfLines={1}>
                        {acct.creditor || acct.account_name || 'Unknown'}
                      </Text>
                      {acct.lane && (
                        <Text style={[styles.resultLaneTag, { color: laneColor }]}>{acct.lane}</Text>
                      )}
                    </View>
                  );
                })}
                {result.accounts.length > 5 && (
                  <Text style={styles.resultMoreText}>+{result.accounts.length - 5} more — view in Accounts</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Upload History */}
        {(reports.length > 0 || historyLoading) && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Upload History</Text>
            {historyLoading ? (
              <ActivityIndicator size="small" color={COLORS.purple} style={{ paddingVertical: 12 }} />
            ) : (
              reports.map((r, i) => {
                const bureauColor = r.bureau === 'Equifax' ? '#EF4444' : r.bureau === 'Experian' ? '#10B981' : '#3B82F6';
                const date = r.created_at || r.uploaded_at
                  ? new Date(r.created_at || r.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Unknown date';
                return (
                  <View
                    key={r.id ?? `report-${i}`}
                    style={[styles.reportRow, i < reports.length - 1 && styles.reportRowBorder]}
                  >
                    <View style={[styles.reportBureauDot, { backgroundColor: bureauColor }]} />
                    <View style={styles.reportInfo}>
                      <Text style={styles.reportBureau}>{r.bureau || 'Unknown Bureau'}</Text>
                      <Text style={styles.reportDate}>{date}</Text>
                      {r.accounts_count != null && (
                        <Text style={styles.reportCount}>{r.accounts_count} accounts extracted</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.reportDeleteBtn}
                      onPress={() => handleDeleteReport(r.id, r.bureau)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.reportDeleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* AI Processing Overlay */}
      <Modal
        visible={parsing}
        transparent
        animationType="fade"
      >
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            <View style={styles.spinner}>
              <ActivityIndicator size="large" color={COLORS.purple} />
            </View>
            <Text style={styles.overlayTitle}>AI is analyzing your accounts...</Text>
            <Text style={styles.overlaySubtext}>
              This may take up to 60 seconds for large reports
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  bureauContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  bureauButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  bureauText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  bureauName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  uploadArea: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  uploadSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  fileInfo: {
    alignItems: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  helpSection: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 24,
  },
  helpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  linkText: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.danger + '20',
    borderRadius: 12,
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.danger,
  },
  resultContainer: {
    backgroundColor: COLORS.success + '15',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  resultIcon: {
    fontSize: 32,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
    marginBottom: 2,
  },
  resultText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  resultAccounts: {
    borderTopWidth: 1,
    borderTopColor: COLORS.success + '30',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 8,
  },
  resultAccountBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultLaneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  resultAccountName: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
  resultLaneTag: {
    fontSize: 11,
    fontWeight: '600',
  },
  resultMoreText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    backgroundColor: COLORS.card,
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  spinner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: COLORS.purple + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  overlaySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Upload history
  historySection: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  reportRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reportBureauDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  reportInfo: {
    flex: 1,
  },
  reportBureau: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  reportDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  reportCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  reportDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.danger + '20',
  },
  reportDeleteBtnText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '600',
  },
});

export default UploadScreen;