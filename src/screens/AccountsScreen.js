import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { accountsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#D97706',
  errorRed: '#DC2626',
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#059669',
  purple: '#7C3AED',
};

const LANES = [
  { key: 'all', label: 'All', color: COLORS.primary },
  { key: 'Active Damage', label: 'Active Damage', color: COLORS.danger },
  { key: 'Removable', label: 'Removable', color: COLORS.warning },
  { key: 'Aging/Monitor', label: 'Monitor', color: COLORS.success },
];

const getLaneColor = (lane) => {
  switch (lane) {
    case 'Active Damage': return COLORS.danger;
    case 'Removable': return COLORS.warning;
    case 'Aging/Monitor': return COLORS.success;
    default: return COLORS.textSecondary;
  }
};

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// ─── Account Card ─────────────────────────────────────────────────────────────
const AccountCard = ({ item, onPress }) => {
  const laneColor = getLaneColor(item.lane);
  return (
    <TouchableOpacity style={[styles.accountCard, { borderLeftColor: laneColor }]} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.accountHeader}>
        <View style={styles.accountInfo}>
          <Text style={styles.creditorName} numberOfLines={1}>
            {item.creditor || item.account_name || 'Unknown Account'}
          </Text>
          <Text style={styles.accountType}>{item.account_type || 'Account'}</Text>
        </View>
        <View style={[styles.laneBadge, { backgroundColor: laneColor + '20', borderColor: laneColor + '40' }]}>
          <Text style={[styles.laneText, { color: laneColor }]}>
            {item.lane || 'Unknown'}
          </Text>
        </View>
      </View>

      <View style={styles.accountDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Balance</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.current_balance ?? item.balance)}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Past Due</Text>
          <Text style={[styles.detailValue, item.past_due_amount > 0 && { color: COLORS.danger }]}>
            {formatCurrency(item.past_due_amount)}
          </Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Bureau</Text>
          <Text style={styles.detailValue}>{item.bureau || 'N/A'}</Text>
        </View>
      </View>

      {item.next_action && (
        <View style={styles.nextActionPreview}>
          <Text style={styles.nextActionIcon}>🎯</Text>
          <Text style={styles.nextActionText} numberOfLines={2}>{item.next_action}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Account Detail Modal ──────────────────────────────────────────────────────
const AccountDetailModal = ({ account, visible, onClose, onNavigateActions }) => {
  if (!account) return null;
  const laneColor = getLaneColor(account.lane);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{account.creditor || account.account_name}</Text>
                <View style={[styles.laneBadgeLarge, { backgroundColor: laneColor + '20', borderColor: laneColor + '40' }]}>
                  <Text style={[styles.laneTextLarge, { color: laneColor }]}>{account.lane}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Account Details */}
            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>
              {[
                { label: 'Account Type', value: account.account_type || 'N/A' },
                { label: 'Balance', value: formatCurrency(account.current_balance ?? account.balance) },
                { label: 'Past Due', value: formatCurrency(account.past_due_amount), danger: account.past_due_amount > 0 },
                { label: 'Credit Limit', value: formatCurrency(account.credit_limit) },
                { label: 'Bureau', value: account.bureau || 'N/A' },
                { label: 'Open Date', value: account.open_date || 'N/A' },
                { label: 'Last Reported', value: account.last_reported || 'N/A' },
              ].map(({ label, value, danger }) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabelLeft}>{label}</Text>
                  <Text style={[styles.detailValueRight, danger && { color: COLORS.danger }]}>{value}</Text>
                </View>
              ))}
            </View>

            {/* AI Recommended Action */}
            {account.next_action && (
              <View style={styles.aiSection}>
                <Text style={styles.aiSectionTitle}>🎯 Recommended Action</Text>
                <Text style={styles.aiActionText}>{account.next_action}</Text>
              </View>
            )}

            {/* Strategy */}
            {account.strategy && (
              <View style={[styles.aiSection, { borderLeftColor: COLORS.staminaBlue }]}>
                <Text style={[styles.aiSectionTitle, { color: COLORS.staminaBlue }]}>📋 Strategy</Text>
                <Text style={styles.aiStrategyText}>{account.strategy}</Text>
              </View>
            )}

            {/* Dispute History */}
            {account.dispute_count > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>DISPUTE HISTORY</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabelLeft}>Disputes Filed</Text>
                  <Text style={styles.detailValueRight}>{account.dispute_count}</Text>
                </View>
                {account.last_dispute_date && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Last Disputed</Text>
                    <Text style={styles.detailValueRight}>{account.last_dispute_date}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.takeActionButton} onPress={onNavigateActions}>
              <Text style={styles.takeActionButtonText}>View in Action Plan</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────
const AccountsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [error, setError] = useState(null);

  const fetchAccounts = async () => {
    try {
      setError(null);
      const response = await accountsAPI.getAll();
      setAccounts(response.data || []);
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError('Failed to load accounts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchAccounts();
    }
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAccounts();
  }, []);

  const filteredAccounts = accounts.filter(a => {
    const matchesLane = filter === 'all' || a.lane === filter;
    const matchesSearch = !search || (a.creditor || a.account_name || '').toLowerCase().includes(search.toLowerCase());
    return matchesLane && matchesSearch;
  });

  const handleAccountPress = (account) => {
    setSelectedAccount(account);
    setModalVisible(true);
  };

  // Lane counts
  const counts = {
    all: accounts.length,
    'Active Damage': accounts.filter(a => a.lane === 'Active Damage').length,
    'Removable': accounts.filter(a => a.lane === 'Removable').length,
    'Aging/Monitor': accounts.filter(a => a.lane === 'Aging/Monitor').length,
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Credit Accounts</Text>
          <Text style={styles.subtitle}>{accounts.length} accounts tracked</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search creditors..."
          placeholderTextColor={COLORS.textSecondary}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Lane Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
      >
        {LANES.map(lane => {
          const active = filter === lane.key;
          const count = counts[lane.key] ?? 0;
          return (
            <TouchableOpacity
              key={lane.key}
              style={[styles.filterPill, active && { backgroundColor: lane.color, borderColor: lane.color }]}
              onPress={() => setFilter(lane.key)}
            >
              <Text style={[styles.filterPillText, active && { color: '#fff' }]}>
                {lane.label}
              </Text>
              <View style={[styles.filterCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[styles.filterCountText, active && { color: '#fff' }]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Account List */}
      <FlatList
        data={filteredAccounts}
        renderItem={({ item }) => <AccountCard item={item} onPress={handleAccountPress} />}
        keyExtractor={(item) => item.id?.toString() ?? `${item.creditor}-${Math.random()}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {error ? (
              <>
                <Text style={styles.emptyIcon}>⚠️</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={fetchAccounts}>
                  <Text style={styles.primaryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyIcon}>📄</Text>
                <Text style={styles.emptyTitle}>No Accounts Found</Text>
                <Text style={styles.emptySubtext}>
                  {search || filter !== 'all'
                    ? 'Try a different filter or search term'
                    : 'Upload a credit report to see your accounts'}
                </Text>
                {!search && filter === 'all' && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => navigation.navigate('Upload')}
                  >
                    <Text style={styles.primaryButtonText}>Upload Credit Report</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        }
      />

      {/* Detail Modal */}
      <AccountDetailModal
        account={selectedAccount}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onNavigateActions={() => {
          setModalVisible(false);
          navigation.navigate('Actions');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: COLORS.text,
    fontSize: 15,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterCount: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Account Card
  accountCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  accountInfo: {
    flex: 1,
    marginRight: 10,
  },
  creditorName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  accountType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  laneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  laneText: {
    fontSize: 11,
    fontWeight: '600',
  },
  accountDetails: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 2,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  nextActionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  nextActionIcon: {
    fontSize: 14,
  },
  nextActionText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.danger,
    marginBottom: 20,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  laneBadgeLarge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  laneTextLarge: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '60',
  },
  detailLabelLeft: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailValueRight: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  aiSection: {
    backgroundColor: COLORS.purple + '15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.purple,
  },
  aiSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purple,
    marginBottom: 8,
  },
  aiActionText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },
  aiStrategyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  takeActionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  takeActionButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AccountsScreen;
