import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { disputesAPI, lettersAPI } from '../services/api';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
  blue: '#1E40AF',
};

const STATUS_META = {
  draft:      { color: COLORS.textSecondary, label: 'Draft' },
  pending:    { color: COLORS.warning,       label: 'Pending' },
  sent:       { color: COLORS.blue,          label: 'Sent' },
  mailed:     { color: COLORS.blue,          label: 'Mailed' },
  delivered:  { color: COLORS.purple,        label: 'Delivered' },
  responded:  { color: COLORS.success,       label: 'Responded' },
  resolved:   { color: COLORS.success,       label: 'Resolved' },
};

const formatDate = (str) => {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Returns days remaining until FCRA response deadline, or null if no sent date
const getFCRADeadline = (letter) => {
  const sentDate = letter.sent_at || letter.mailed_at;
  if (!sentDate) return null;
  const isBureau = ['equifax','experian','transunion'].some(b =>
    (letter.bureau || '').toLowerCase().includes(b)
  );
  const days = isBureau ? 30 : 14;
  const deadline = new Date(sentDate);
  deadline.setDate(deadline.getDate() + days);
  const remaining = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
  return { remaining, deadline, days };
};

const DisputeTrackerScreen = () => {
  const navigation = useNavigation();
  const [counts, setCounts]       = useState(null);
  const [letters, setLetters]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [countsRes, lettersRes] = await Promise.all([
        disputesAPI.getCounts().catch(() => null),
        lettersAPI.getAll().catch(() => ({ data: [] })),
      ]);

      const c = countsRes?.data ?? countsRes ?? {};
      setCounts(c);

      const allLetters = lettersRes?.data ?? lettersRes ?? [];
      // Show all dispute-related letters — bureau disputes, debt validation, pay-for-delete
      const disputeLetters = (Array.isArray(allLetters) ? allLetters : []).filter(l =>
        ['bureau_dispute', 'debt_validation', 'pay_for_delete', 'goodwill', 'hardship'].includes(l.letter_type)
      );
      setLetters(disputeLetters);
    } catch (err) {
      console.error('[DisputeTracker] error:', err);
      setError('Failed to load dispute data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const totalDisputes = counts?.total ?? counts?.dispute_count ?? letters.length;
  const activeDisputes = letters.filter(l => ['sent', 'mailed', 'delivered', 'pending'].includes(l.status)).length;
  const resolvedDisputes = letters.filter(l => ['responded', 'resolved'].includes(l.status)).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Dispute Tracker</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Letters')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.newBtn}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.purple} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
        >
          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalDisputes}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={[styles.statCard, { borderColor: COLORS.warning + '40' }]}>
              <Text style={[styles.statNumber, { color: COLORS.warning }]}>{activeDisputes}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={[styles.statCard, { borderColor: COLORS.success + '40' }]}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>{resolvedDisputes}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
          </View>

          {/* How it works */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>📋 How Disputes Work</Text>
            <Text style={styles.infoText}>
              Under the Fair Credit Reporting Act (FCRA), you can dispute inaccurate or unverifiable information on your credit report. Bureaus have 30 days to investigate and respond. Letters you send via Credit Stamina are tracked here automatically.
            </Text>
          </View>

          {/* Letters list */}
          <Text style={styles.sectionTitle}>Dispute Letters</Text>

          {letters.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📨</Text>
              <Text style={styles.emptyTitle}>No Dispute Letters Yet</Text>
              <Text style={styles.emptySubtext}>
                Generate a dispute letter from the Letters screen to start tracking your disputes.
              </Text>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.navigate('Letters')}>
                <Text style={styles.ctaBtnText}>Go to Letters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              {letters.map((letter, i) => {
                const meta = STATUS_META[letter.status] ?? { color: COLORS.textSecondary, label: letter.status };
                const typeLabel = {
                  bureau_dispute:  'Bureau Dispute',
                  debt_validation: 'Debt Validation',
                  pay_for_delete:  'Pay-for-Delete',
                  goodwill:        'Goodwill',
                  hardship:        'Hardship',
                }[letter.letter_type] ?? letter.letter_type;

                const fcra = ['sent','mailed','delivered','pending'].includes(letter.status)
                  ? getFCRADeadline(letter)
                  : null;
                const deadlineColor = fcra
                  ? fcra.remaining <= 0 ? COLORS.danger
                    : fcra.remaining <= 7 ? COLORS.warning
                    : COLORS.success
                  : null;

                return (
                  <TouchableOpacity
                    key={letter.id ?? `l-${i}`}
                    style={[styles.letterRow, i < letters.length - 1 && styles.rowBorder]}
                    onPress={() => navigation.navigate('Letters', { openLetterId: letter.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.letterLeft}>
                      <View style={styles.letterTopRow}>
                        <Text style={styles.letterType}>{typeLabel}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: meta.color + '20' }]}>
                          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      </View>
                      {letter.account_name && (
                        <Text style={styles.letterAccount} numberOfLines={1}>{letter.account_name}</Text>
                      )}
                      <View style={styles.letterMeta}>
                        {letter.bureau && (
                          <Text style={styles.letterMetaText}>{letter.bureau}</Text>
                        )}
                        {letter.created_at && (
                          <Text style={styles.letterMetaText}>Created {formatDate(letter.created_at)}</Text>
                        )}
                        {letter.sent_at && (
                          <Text style={styles.letterMetaText}>Sent {formatDate(letter.sent_at)}</Text>
                        )}
                      </View>
                      {fcra && (
                        <View style={[styles.deadlineRow, { borderColor: deadlineColor + '40' }]}>
                          <Text style={[styles.deadlineText, { color: deadlineColor }]}>
                            {fcra.remaining <= 0
                              ? `FCRA deadline passed (${fcra.days}-day window)`
                              : `${fcra.remaining}d left to respond — FCRA ${fcra.days}-day window`}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowChevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 Dispute Tips</Text>
            {[
              'Send disputes via certified mail or USPS (Click2Mail) for proof of delivery.',
              'Bureaus have 30 days to investigate. Follow up at 30, 60, and 90 days.',
              'If a dispute is denied, escalate with a debt validation letter to the original creditor.',
              'Keep copies of all letters and responses in a folder for your records.',
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBullet}>•</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
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
  backBtn: { fontSize: 17, color: COLORS.purple, fontWeight: '500', minWidth: 50 },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  newBtn: { fontSize: 15, color: COLORS.purple, fontWeight: '600', minWidth: 50, textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  errorText: { color: COLORS.danger, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: COLORS.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: COLORS.text, fontWeight: '600' },
  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
  // Info
  infoCard: {
    backgroundColor: COLORS.blue + '15',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.blue + '40',
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  // Section
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  letterRow: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  letterLeft: { flex: 1 },
  rowChevron: { color: COLORS.textSecondary, fontSize: 18, paddingLeft: 8 },
  deadlineRow: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  deadlineText: { fontSize: 11, fontWeight: '600' },
  letterTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  letterType: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1, marginRight: 8 },
  letterAccount: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
  letterMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  letterMetaText: { fontSize: 11, color: COLORS.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  // Empty
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  ctaBtn: { backgroundColor: COLORS.purple, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  ctaBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  // Tips
  tipsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tipsTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  tipRow: { flexDirection: 'row', marginBottom: 8 },
  tipBullet: { color: COLORS.purple, fontSize: 14, marginRight: 8, lineHeight: 20 },
  tipText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});

export default DisputeTrackerScreen;
