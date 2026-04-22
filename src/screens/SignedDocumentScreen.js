import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  surface: '#243047',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  purple: '#7C3AED',
  success: '#059669',
  successLight: '#D1FAE5',
  teal: '#0D9488',
};

const SignedDocumentScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    signerName,
    signedAt,
    consentDate,
    letterData,
    signatureSvg,
  } = route.params ?? {};

  const signedDate = signedAt ? new Date(signedAt) : new Date();
  const consentDateObj = consentDate ? new Date(consentDate) : null;

  const formatDate = (date) =>
    date
      ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';

  const formatTimestamp = (date) =>
    date
      ? date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
      : '—';

  const handleShare = async () => {
    try {
      const summary =
        `SIGNED DOCUMENT CONFIRMATION\n` +
        `──────────────────────────────\n` +
        `Document: ${letterData?.letterType ?? 'Dispute Letter'}\n` +
        `Creditor: ${letterData?.creditor ?? '—'}\n` +
        `Signer: ${signerName}\n` +
        `Signed: ${formatTimestamp(signedDate)}\n` +
        `eSign Consent Recorded: ${formatDate(consentDateObj)}\n\n` +
        `Electronically signed via Credit Stamina.\n` +
        `This document has the same legal effect as a handwritten signature\n` +
        `under the ESIGN Act and UETA.`;
      await Share.share({ message: summary, title: 'Signed Document Confirmation' });
    } catch {
      // User cancelled or share unavailable — no-op
    }
  };

  const handleDone = () => {
    // Go back to the Letters screen (pop the whole sign flow)
    navigation.popToTop();
  };

  // Parse and render the stored SVG paths
  const renderSignature = () => {
    if (!signatureSvg) return null;
    // Extract all <path> d attributes from the SVG string
    const pathRegex = /d="([^"]+)"/g;
    const paths = [];
    let match;
    while ((match = pathRegex.exec(signatureSvg)) !== null) {
      paths.push(match[1]);
    }
    if (paths.length === 0) return null;
    return (
      <Svg width="100%" height={100} viewBox="0 0 320 100" style={styles.sigSvg}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke="#F1F5F9" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Success badge */}
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Document Signed</Text>
        <Text style={styles.successSubtitle}>
          Your signature has been recorded and the document is legally executed.
        </Text>

        {/* Document details card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>DOCUMENT DETAILS</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Document Type</Text>
            <Text style={styles.detailValue}>{letterData?.letterType ?? 'Dispute Letter'}</Text>
          </View>
          {letterData?.creditor && (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Creditor</Text>
              <Text style={styles.detailValue}>{letterData.creditor}</Text>
            </View>
          )}
          {letterData?.bureau && (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Bureau</Text>
              <Text style={styles.detailValue}>{letterData.bureau}</Text>
            </View>
          )}
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.detailKey}>Reference #</Text>
            <Text style={styles.detailValue}>
              {letterData?.letterId
                ? String(letterData.letterId).slice(0, 8).toUpperCase()
                : '—'}
            </Text>
          </View>
        </View>

        {/* Signer info card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SIGNATURE RECORD</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Signed By</Text>
            <Text style={styles.detailValue}>{signerName ?? '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Date Signed</Text>
            <Text style={styles.detailValue}>{formatDate(signedDate)}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.detailKey}>Timestamp</Text>
            <Text style={[styles.detailValue, styles.detailValueSmall]}>
              {formatTimestamp(signedDate)}
            </Text>
          </View>

          {/* Signature preview */}
          <View style={styles.sigBox}>
            <Text style={styles.sigBoxLabel}>SIGNATURE</Text>
            {renderSignature() ?? (
              <Text style={styles.sigBoxEmpty}>Signature on file</Text>
            )}
            <View style={styles.sigLine} />
          </View>
        </View>

        {/* Legal note */}
        <View style={styles.legalNote}>
          <Text style={styles.legalNoteText}>
            Electronically signed via Credit Stamina.{'\n'}
            {consentDateObj
              ? `eSign consent recorded on ${formatDate(consentDateObj)}.`
              : 'eSign consent recorded.'}
            {'\n\n'}
            This electronic signature is legally binding and has the same legal effect as a
            handwritten signature under the Electronic Signatures in Global and National Commerce
            Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). An audit trail is
            retained by Credit Stamina.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Text style={styles.shareBtnText}>Share Confirmation</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 50, alignItems: 'center' },

  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  successIcon: { color: '#fff', fontSize: 34, fontWeight: '800' },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 16,
  },

  card: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  detailRowLast: { borderBottomWidth: 0, marginBottom: 4 },
  detailKey: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  detailValue: { fontSize: 13, color: COLORS.text, fontWeight: '600', textAlign: 'right', flex: 1.5 },
  detailValueSmall: { fontSize: 11, lineHeight: 16 },

  sigBox: {
    marginTop: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    minHeight: 110,
    justifyContent: 'center',
  },
  sigBoxLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  sigSvg: { alignSelf: 'stretch' },
  sigBoxEmpty: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  sigLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 8,
  },

  legalNote: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.purple,
    padding: 14,
    marginBottom: 24,
  },
  legalNoteText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  shareBtn: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  doneBtn: {
    width: '100%',
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default SignedDocumentScreen;
