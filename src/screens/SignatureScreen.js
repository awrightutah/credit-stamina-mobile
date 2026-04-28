import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useESignConsent } from '../hooks/useESignConsent';
import { legalAPI, lettersAPI } from '../services/api';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  purple: '#7C3AED',
  success: '#059669',
  danger: '#DC2626',
};

const PAD_HEIGHT = 190;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAD_WIDTH = SCREEN_WIDTH - 40; // 20px margin each side

// Convert a single stroke's points to an SVG path "d" attribute string
const pointsToD = (points) => {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    // Single dot — draw a tiny line so it's visible
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} l 0.1 0.1`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    // Smooth curves between points for a natural look
    if (i < points.length - 1) {
      const cx = ((points[i].x + points[i + 1].x) / 2).toFixed(1);
      const cy = ((points[i].y + points[i + 1].y) / 2).toFixed(1);
      d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${cx} ${cy}`;
    } else {
      d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
  }
  return d;
};

// Serialize all completed strokes into a standalone SVG string for storage
const buildSVGString = (strokes, width, height) => {
  const pathTags = strokes.map(s => {
    const d = pointsToD(s.points);
    if (!d) return '';
    return `<path d="${d}" stroke="#0F172A" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).filter(Boolean);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" style="background:#ffffff">` +
    pathTags.join('') +
    '</svg>'
  );
};

const SignatureScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { consentId, consentDate } = useESignConsent();

  const { letterData } = route.params ?? {};

  const [signerName, setSignerName] = useState(
    user?.user_metadata?.full_name ?? ''
  );
  const [certified, setCertified] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [saving, setSaving] = useState(false);

  // Track the currently-being-drawn stroke separately from completed strokes
  const currentPointsRef = useRef([]);
  const isDrawingRef = useRef(false);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ─── Gesture handler ────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        isDrawingRef.current = true;
        currentPointsRef.current = [{ x: locationX, y: locationY }];
        // Add a live "current" stroke so the path renders immediately
        setStrokes(prev => [
          ...prev,
          { id: 'live', points: currentPointsRef.current, live: true },
        ]);
      },

      onPanResponderMove: (evt) => {
        if (!isDrawingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        currentPointsRef.current = [...currentPointsRef.current, { x: locationX, y: locationY }];
        setStrokes(prev => {
          const completed = prev.filter(s => !s.live);
          return [...completed, { id: 'live', points: currentPointsRef.current, live: true }];
        });
      },

      onPanResponderRelease: () => {
        isDrawingRef.current = false;
        const completedPoints = [...currentPointsRef.current];
        currentPointsRef.current = [];
        setStrokes(prev => {
          const completed = prev.filter(s => !s.live);
          if (completedPoints.length === 0) return completed;
          return [...completed, { id: Date.now(), points: completedPoints }];
        });
      },

      onPanResponderTerminate: () => {
        // Another component stole the responder (e.g. scroll) — finalize stroke
        isDrawingRef.current = false;
        const completedPoints = [...currentPointsRef.current];
        currentPointsRef.current = [];
        if (completedPoints.length > 0) {
          setStrokes(prev => {
            const completed = prev.filter(s => !s.live);
            return [...completed, { id: Date.now(), points: completedPoints }];
          });
        }
      },
    })
  ).current;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const clearSignature = useCallback(() => {
    setStrokes([]);
    currentPointsRef.current = [];
  }, []);

  const completedStrokes = strokes.filter(s => !s.live);
  const hasSignature = completedStrokes.length > 0;
  const canSign = signerName.trim().length >= 2 && certified && hasSignature;

  // ─── Sign handler ────────────────────────────────────────────────────────────
  const handleSign = async () => {
    if (!canSign) return;
    setSaving(true);
    try {
      const signedAt = new Date().toISOString();
      const svgString = buildSVGString(completedStrokes, PAD_WIDTH, PAD_HEIGHT);

      // 1. Update the letter record with the signer name via existing backend endpoint
      if (letterData?.letterId) {
        await lettersAPI.sign(letterData.letterId, signerName.trim());
      }

      // 2. Save the full signed-document record (with SVG) to Supabase
      const signedDoc = await legalAPI.saveSignedDocument({
        userId: user.id,
        letterId: letterData?.letterId ?? null,
        signerName: signerName.trim(),
        signedAt,
        esignConsentId: consentId ?? null,
        signatureSvg: svgString,
      });

      navigation.replace('SignedDocument', {
        signerName: signerName.trim(),
        signedAt,
        letterData,
        signedDocId: signedDoc?.id,
        consentDate,
      });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save signature. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sign Document</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Document Summary ─────────────────────────────────────────────── */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionLabel}>DOCUMENT DETAILS</Text>
          {[
            {
              label: 'Document Type',
              value: (letterData?.letterType ?? 'letter')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase()),
            },
            { label: 'Bureau / Creditor', value: letterData?.bureau || 'N/A' },
            { label: 'Account',           value: letterData?.accountName || 'N/A' },
            { label: 'Date',              value: today },
          ].map(({ label, value }) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryKey}>{label}</Text>
              <Text style={styles.summaryVal} numberOfLines={1}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Full Legal Name ───────────────────────────────────────────────── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.sectionLabel}>FULL LEGAL NAME</Text>
          <TextInput
            style={styles.input}
            value={signerName}
            onChangeText={setSignerName}
            placeholder="Enter your full legal name"
            placeholderTextColor="#475569"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* Date ─────────────────────────────────────────────────────────── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.sectionLabel}>DATE</Text>
          <View style={styles.dateField}>
            <Text style={styles.dateText}>{today}</Text>
            <Text style={styles.dateAuto}>(auto-filled)</Text>
          </View>
        </View>

        {/* Signature Pad ────────────────────────────────────────────────── */}
        <View style={styles.fieldGroup}>
          <View style={styles.padHeaderRow}>
            <Text style={styles.sectionLabel}>SIGNATURE PAD</Text>
            {hasSignature && (
              <TouchableOpacity
                onPress={clearSignature}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtn}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.padHint}>Draw your signature with your finger below.</Text>

          {/* The actual drawing surface — PanResponder must NOT be inside a ScrollView child */}
          <View
            style={styles.padOuter}
            {...panResponder.panHandlers}
          >
            <Svg
              width={PAD_WIDTH}
              height={PAD_HEIGHT}
              style={StyleSheet.absoluteFill}
            >
              {strokes.map((stroke, idx) => {
                const d = pointsToD(stroke.points);
                if (!d) return null;
                return (
                  <Path
                    key={stroke.id ?? idx}
                    d={d}
                    stroke="#F1F5F9"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </Svg>
            {!hasSignature && strokes.length === 0 && (
              <Text style={styles.padPlaceholder} pointerEvents="none">
                Sign here with your finger →
              </Text>
            )}
            {/* Baseline guide */}
            <View style={styles.padBaseline} />
          </View>
        </View>

        {/* Certification Checkbox ────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.certRow}
          onPress={() => setCertified(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, certified && styles.checkboxChecked]}>
            {certified && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.certText}>
            I certify this letter is accurate to the best of my knowledge.
          </Text>
        </TouchableOpacity>

        {/* Sign Button ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.signBtn, (!canSign || saving) && styles.signBtnDisabled]}
          onPress={handleSign}
          disabled={!canSign || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.signBtnText}>Sign Document</Text>
          }
        </TouchableOpacity>

        {/* Validation hints */}
        {!canSign && (
          <View style={styles.hintList}>
            {signerName.trim().length < 2 && <Text style={styles.hint}>• Enter your full legal name</Text>}
            {!hasSignature && <Text style={styles.hint}>• Draw your signature in the pad above</Text>}
            {!certified && <Text style={styles.hint}>• Check the certification box</Text>}
          </View>
        )}

        <Text style={styles.legalFooter}>
          By signing, you confirm your identity and agree that this electronic signature is legally
          binding under the ESIGN Act and UETA.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { fontSize: 17, color: COLORS.purple, fontWeight: '500', minWidth: 60 },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  headerSpacer: { minWidth: 60 },

  content: { padding: 20, paddingBottom: 48 },

  // Document summary
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border + '55',
  },
  summaryKey: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  summaryVal: { fontSize: 13, color: COLORS.text, fontWeight: '500', flex: 1, textAlign: 'right' },

  // Fields
  fieldGroup: { marginBottom: 22 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 15,
  },
  dateField: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: { color: COLORS.text, fontSize: 15 },
  dateAuto: { fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' },

  // Signature pad
  padHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clearBtn: { fontSize: 14, color: COLORS.purple, fontWeight: '500' },
  padHint: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, fontStyle: 'italic' },
  padOuter: {
    width: PAD_WIDTH,
    height: PAD_HEIGHT,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  padPlaceholder: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    position: 'absolute',
  },
  padBaseline: {
    position: 'absolute',
    bottom: 44,
    left: 16,
    right: 16,
    height: 0.5,
    backgroundColor: COLORS.border,
  },

  // Certification
  certRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  certText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },

  // Sign button
  signBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  signBtnDisabled: { backgroundColor: '#2D3748', opacity: 0.6 },
  signBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Validation hints
  hintList: { marginBottom: 16 },
  hint: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 3, paddingLeft: 4 },

  // Footer
  legalFooter: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});

export default SignatureScreen;
