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
} from 'react-native';
import { accountsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  // Credit Stamina Brand Colors (matching PWA)
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#D97706',
  errorRed: '#DC2626',
  background: '#0f172a',
  card: '#111827',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#059669',
  purple: '#7C3AED',
};

const AccountsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter] = useState('all'); // all, damage, removable, monitor
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getAll();
      setAccounts(response.data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
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

  const getFilteredAccounts = () => {
    if (filter === 'all') return accounts;
    if (filter === 'damage') return accounts.filter(a => a.lane === 'Active Damage');
    if (filter === 'removable') return accounts.filter(a => a.lane === 'Removable');
    if (filter === 'monitor') return accounts.filter(a => a.lane === 'Aging/Monitor');
    return accounts;
  };

  const getLaneColor = (lane) => {
    switch (lane) {
      case 'Active Damage': return COLORS.danger;
      case 'Removable': return COLORS.warning;
      case 'Aging/Monitor': return COLORS.success;
      default: return COLORS.textSecondary;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return COLORS.danger;
      case 2: return COLORS.warning;
      case 3: return COLORS.success;
      default: return COLORS.textSecondary;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const handleAccountPress = (account) => {
    setSelectedAccount(account);
    setModalVisible(true);
  };

  const renderAccount = ({ item }) => (
    <TouchableOpacity 
      style={styles.accountCard}
      onPress={() => handleAccountPress(item)}
    >
      <View style={styles.accountHeader}>
        <View style={styles.accountInfo}>
          <Text style={styles.creditorName}>{item.creditor || item.account_name}</Text>
          <Text style={styles.accountType}>{item.account_type}</Text>
        </View>
        <View style={[styles.laneBadge, { backgroundColor: getLaneColor(item.lane) + '20' }]}>
          <Text style={[styles.laneText, { color: getLaneColor(item.lane) }]}>
            {item.lane}
          </Text>
        </View>
      </View>
      
      <View style={styles.accountDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Balance</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.current_balance || item.balance)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Past Due</Text>
          <Text style={[styles.detailValue, item.past_due_amount > 0 && styles.pastDue]}>
            {formatCurrency(item.past_due_amount)}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Bureau</Text>
          <Text style={styles.detailValue}>{item.bureau || 'N/A'}</Text>
        </View>
      </View>

      {/* AI-powered next action preview */}
      {item.next_action && (
        <View style={styles.nextActionPreview}>
          <Text style={styles.nextActionIcon}>🎯</Text>
          <Text style={styles.nextActionText} numberOfLines={1}>
            {item.next_action}
          </Text>
          <Text style={styles.viewDetails}>→</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const filteredAccounts = getFilteredAccounts();
  
  // Stats
  const damageCount = accounts.filter(a => a.lane === 'Active Damage').length;
  const removableCount = accounts.filter(a => a.lane === 'Removable').length;
  const monitorCount = accounts.filter(a => a.lane === 'Aging/Monitor').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Accounts</Text>
        <Text style={styles.subtitle}>{filteredAccounts.length} accounts</Text>
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <TouchableOpacity 
          style={[styles.statItem, filter === 'damage' && styles.statItemActive]}
          onPress={() => setFilter('damage')}
        >
          <View style={[styles.statDot, { backgroundColor: COLORS.danger }]} />
          <Text style={styles.statNumber}>{damageCount}</Text>
          <Text style={styles.statLabel}>Damage</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statItem, filter === 'removable' && styles.statItemActive]}
          onPress={() => setFilter('removable')}
        >
          <View style={[styles.statDot, { backgroundColor: COLORS.warning }]} />
          <Text style={styles.statNumber}>{removableCount}</Text>
          <Text style={styles.statLabel}>Removable</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statItem, filter === 'monitor' && styles.statItemActive]}
          onPress={() => setFilter('monitor')}
        >
          <View style={[styles.statDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.statNumber}>{monitorCount}</Text>
          <Text style={styles.statLabel}>Monitor</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statItem, filter === 'all' && styles.statItemActive]}
          onPress={() => setFilter('all')}
        >
          <View style={[styles.statDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.statNumber}>{accounts.length}</Text>
          <Text style={styles.statLabel}>All</Text>
        </TouchableOpacity>
      </View>

      {/* Account List */}
      <FlatList
        data={filteredAccounts}
        renderItem={renderAccount}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyText}>No accounts found</Text>
            <Text style={styles.emptySubtext}>
              Upload a credit report to see your accounts
            </Text>
            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={() => navigation.navigate('Upload')}
            >
              <Text style={styles.uploadButtonText}>Upload Credit Report</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Account Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedAccount && (
              <ScrollView>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedAccount.creditor || selectedAccount.account_name}</Text>
                  <View style={[styles.laneBadgeLarge, { backgroundColor: getLaneColor(selectedAccount.lane) + '20' }]}>
                    <Text style={[styles.laneTextLarge, { color: getLaneColor(selectedAccount.lane) }]}>
                      {selectedAccount.lane}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.sectionLabel}>Account Details</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Account Type</Text>
                    <Text style={styles.detailValueRight}>{selectedAccount.account_type || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Balance</Text>
                    <Text style={styles.detailValueRight}>{formatCurrency(selectedAccount.current_balance || selectedAccount.balance)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Past Due</Text>
                    <Text style={[styles.detailValueRight, selectedAccount.past_due_amount > 0 && styles.pastDue]}>
                      {formatCurrency(selectedAccount.past_due_amount)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Credit Limit</Text>
                    <Text style={styles.detailValueRight}>{formatCurrency(selectedAccount.credit_limit)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabelLeft}>Bureau</Text>
                    <Text style={styles.detailValueRight}>{selectedAccount.bureau || 'N/A'}</Text>
                  </View>
                </View>

                {/* AI-powered insights */}
                {selectedAccount.next_action && (
                  <View style={styles.aiSection}>
                    <Text style={styles.aiSectionTitle}>🎯 Recommended Action</Text>
                    <Text style={styles.aiActionText}>{selectedAccount.next_action}</Text>
                  </View>
                )}

                {selectedAccount.strategy && (
                  <View style={styles.aiSection}>
                    <Text style={styles.aiSectionTitle}>📋 Strategy</Text>
                    <Text style={styles.aiStrategyText}>{selectedAccount.strategy}</Text>
                  </View>
                )}

                {selectedAccount.priority && (
                  <View style={styles.prioritySection}>
                    <Text style={styles.priorityLabel}>Priority</Text>
                    <View style={styles.priorityBars}>
                      {[1, 2, 3].map((p) => (
                        <View 
                          key={p}
                          style={[
                            styles.priorityBar,
                            { backgroundColor: p <= selectedAccount.priority ? getPriorityColor(selectedAccount.priority) : COLORS.border }
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.priorityText}>
                      {selectedAccount.priority === 1 ? 'High' : selectedAccount.priority === 2 ? 'Medium' : 'Low'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity 
                  style={styles.takeActionButton}
                  onPress={() => {
                    setModalVisible(false);
                    navigation.navigate('Actions');
                  }}
                >
                  <Text style={styles.takeActionButtonText}>View in Actions</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
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
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statItemActive: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  accountCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  accountInfo: {
    flex: 1,
  },
  creditorName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  accountType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  laneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  laneText: {
    fontSize: 12,
    fontWeight: '600',
  },
  accountDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pastDue: {
    color: COLORS.danger,
  },
  nextActionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  nextActionIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  nextActionText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  viewDetails: {
    fontSize: 14,
    color: COLORS.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 18,
  },
  modalHeader: {
    marginTop: 16,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  laneBadgeLarge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  laneTextLarge: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    backgroundColor: COLORS.purple + '20',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.purple,
  },
  aiSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purple,
    marginBottom: 8,
  },
  aiActionText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  aiStrategyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  prioritySection: {
    marginBottom: 16,
  },
  priorityLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  priorityBars: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  priorityBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  priorityText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  takeActionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  takeActionButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AccountsScreen;