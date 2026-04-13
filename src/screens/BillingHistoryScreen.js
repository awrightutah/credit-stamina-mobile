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
import { billingAPI } from '../services/api';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  success: '#059669',
  danger: '#DC2626',
  warning: '#F97316',
  purple: '#7C3AED',
};

const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatAmount = (amount) => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const STATUS_COLORS = {
  succeeded: COLORS.success,
  paid:      COLORS.success,
  failed:    COLORS.danger,
  pending:   COLORS.warning,
  refunded:  COLORS.textSecondary,
};

const BillingHistoryScreen = () => {
  const navigation = useNavigation();
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setError(null);
      const res  = await billingAPI.getHistory();
      const data = res?.data ?? res ?? [];
      setHistory(Array.isArray(data) ? data : (data.history ?? data.transactions ?? []));
    } catch (err) {
      console.error('[BillingHistory] error:', err);
      setError('Failed to load billing history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadHistory(); };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Billing History</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.purple} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadHistory}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
        >
          {history.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyTitle}>No Billing History</Text>
              <Text style={styles.emptySubtext}>Charges and subscription payments will appear here.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {history.map((item, i) => {
                const statusColor = STATUS_COLORS[item.status?.toLowerCase()] ?? COLORS.textSecondary;
                return (
                  <View key={item.id ?? `tx-${i}`} style={[styles.row, i < history.length - 1 && styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowDesc} numberOfLines={2}>
                        {item.description || item.memo || 'Payment'}
                      </Text>
                      <Text style={styles.rowDate}>{formatDate(item.date || item.created_at || item.transaction_date)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {(item.status || 'unknown').charAt(0).toUpperCase() + (item.status || '').slice(1)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.amount, { color: item.status === 'refunded' ? COLORS.textSecondary : COLORS.text }]}>
                      {formatAmount(item.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
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
  backBtn: { fontSize: 17, color: COLORS.purple, fontWeight: '500', minWidth: 60 },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  errorText: { color: COLORS.danger, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: COLORS.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: COLORS.text, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLeft: { flex: 1, marginRight: 12 },
  rowDesc: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  rowDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '700' },
});

export default BillingHistoryScreen;
