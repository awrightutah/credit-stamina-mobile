import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { accountsAPI, notesAPI, actionsAPI } from '../services/api';

const ACCOUNT_TYPES = ['Credit Card', 'Collection', 'Auto Loan', 'Medical', 'Student Loan', 'Mortgage', 'Personal Loan', 'Charge-Off', 'Other'];
const BUREAUS_LIST = ['Equifax', 'Experian', 'TransUnion'];
const LANE_LIST = ['Active Damage', 'Removable', 'Aging/Monitor'];
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#F97316',
  errorRed: '#DC2626',
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

const DISPUTE_OUTCOMES = [
  { key: 'removed', label: '✅ Removed / Fixed', color: '#059669' },
  { key: 'partial', label: '⚠️ Partial Win',     color: '#F97316' },
  { key: 'denied',  label: '❌ Denied',           color: '#DC2626' },
  { key: 'pending', label: '⏳ Still Pending',    color: '#6B7280' },
];

// ─── Account Detail Modal ──────────────────────────────────────────────────────
const AccountDetailModal = ({ account, visible, onClose, onNavigateActions, onDelete, onEdit }) => {
  const [notes, setNotes]             = useState([]);
  const [noteText, setNoteText]       = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [savingNote, setSavingNote]   = useState(false);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [loggedOutcome, setLoggedOutcome]   = useState(null);

  useEffect(() => {
    if (visible && account?.id) {
      loadNotes();
    } else {
      setNotes([]);
      setNoteText('');
      setLoggedOutcome(null);
    }
  }, [visible, account?.id]);

  const loadNotes = async () => {
    setNotesLoading(true);
    try {
      const res = await notesAPI.getForAccount(account.id);
      const data = res?.data ?? res ?? [];
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[AccountModal] notes load error:', e?.response?.data || e.message);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await notesAPI.create(account.id, noteText.trim());
      setNoteText('');
      await loadNotes();
    } catch (e) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await notesAPI.delete(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const handleLogOutcome = async (outcome) => {
    setOutcomeLoading(true);
    try {
      await actionsAPI.create({
        title: `Dispute Outcome: ${outcome.label.replace(/^[^\w]+/, '')} — ${account.creditor || account.account_name}`,
        lane: account.lane,
        priority: outcome.key === 'removed' ? 'low' : 'high',
        status: 'complete',
        notes: `Bureau: ${account.bureau || 'N/A'}`,
      });
      setLoggedOutcome(outcome.key);
      Alert.alert('Outcome Logged', `Dispute outcome "${outcome.label}" has been recorded in your action history.`);
    } catch (e) {
      Alert.alert('Error', 'Failed to log outcome');
    } finally {
      setOutcomeLoading(false);
    }
  };

  if (!account) return null;
  const laneColor = getLaneColor(account.lane);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            {/* Dispute Outcome Tracker */}
            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>LOG DISPUTE OUTCOME</Text>
              <Text style={styles.outcomeHint}>Did you hear back on a dispute for this account?</Text>
              <View style={styles.outcomeGrid}>
                {DISPUTE_OUTCOMES.map(outcome => (
                  <TouchableOpacity
                    key={outcome.key}
                    style={[
                      styles.outcomeBtn,
                      { borderColor: outcome.color + '60' },
                      loggedOutcome === outcome.key && { backgroundColor: outcome.color + '20', borderColor: outcome.color },
                    ]}
                    onPress={() => handleLogOutcome(outcome)}
                    disabled={outcomeLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.outcomeBtnText, { color: outcome.color }]}>{outcome.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              {notesLoading ? (
                <Text style={styles.notesLoading}>Loading notes...</Text>
              ) : (
                <>
                  {notes.map(note => (
                    <View key={note.id} style={styles.noteItem}>
                      <Text style={styles.noteText}>{note.content}</Text>
                      <TouchableOpacity onPress={() => handleDeleteNote(note.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.noteDelete}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={styles.noteInputRow}>
                    <TextInput
                      style={styles.noteInput}
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder="Add a note..."
                      placeholderTextColor={COLORS.textSecondary}
                      multiline
                      maxLength={500}
                    />
                    <TouchableOpacity
                      style={[styles.noteAddBtn, (!noteText.trim() || savingNote) && { opacity: 0.5 }]}
                      onPress={handleAddNote}
                      disabled={!noteText.trim() || savingNote}
                    >
                      <Text style={styles.noteAddBtnText}>{savingNote ? '...' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity style={styles.takeActionButton} onPress={onNavigateActions}>
              <Text style={styles.takeActionButtonText}>View in Action Plan</Text>
            </TouchableOpacity>

            {/* Edit / Delete */}
            <View style={styles.modalDangerRow}>
              <TouchableOpacity style={styles.editAccountBtn} onPress={onEdit} activeOpacity={0.7}>
                <Text style={styles.editAccountBtnText}>✏️ Edit Account</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteAccountBtn} onPress={onDelete} activeOpacity={0.7}>
                <Text style={styles.deleteAccountBtnText}>🗑 Delete</Text>
              </TouchableOpacity>
            </View>
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
  const [expandedSections, setExpandedSections] = useState({
    'Active Damage': true,
    'Removable': true,
    'Aging/Monitor': true,
  });
  const [showBureauInfo, setShowBureauInfo] = useState(false);

  // Create / Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null); // null = create mode
  const [accountForm, setAccountForm] = useState({
    creditor: '', account_type: 'Credit Card', current_balance: '',
    past_due_amount: '', credit_limit: '', bureau: 'Equifax', lane: 'Active Damage',
    open_date: '', notes: '',
  });
  const [savingAccount, setSavingAccount] = useState(false);

  const PREVIEW_COUNT = 3;

  const toggleSection = (lane) => {
    setExpandedSections(prev => ({ ...prev, [lane]: !prev[lane] }));
  };

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

  // Reload accounts every time the screen gains focus so background-processed
  // uploads, push-notification deep links, and tab switches always show fresh
  // data without the user pulling to refresh.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) fetchAccounts();
    }, [user?.id])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAccounts();
  }, []);

  const matchesSearch = (a) =>
    !search || (a.creditor || a.account_name || '').toLowerCase().includes(search.toLowerCase());

  // Lane order — most urgent first
  const LANE_ORDER = ['Active Damage', 'Removable', 'Aging/Monitor'];

  // For "All" view: build sections grouped by lane in priority order
  const sections = LANE_ORDER.map(lane => {
    const all = accounts.filter(a => a.lane === lane && matchesSearch(a));
    const isExpanded = !!expandedSections[lane];
    return {
      lane,
      title: lane,
      color: getLaneColor(lane),
      totalCount: all.length,
      data: isExpanded ? all : all.slice(0, PREVIEW_COUNT),
    };
  }).filter(s => s.totalCount > 0);

  // Add unknown lane as a catch-all
  const unknownAll = accounts.filter(a => !LANE_ORDER.includes(a.lane) && matchesSearch(a));
  if (unknownAll.length > 0) {
    const isExpanded = !!expandedSections['Other'];
    sections.push({
      lane: 'Other', title: 'Other', color: COLORS.textSecondary,
      totalCount: unknownAll.length,
      data: isExpanded ? unknownAll : unknownAll.slice(0, PREVIEW_COUNT),
    });
  }

  // For single-lane filter: flat list
  const filteredAccounts = accounts.filter(a => a.lane === filter && matchesSearch(a));

  const handleAccountPress = (account) => {
    setSelectedAccount(account);
    setModalVisible(true);
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setAccountForm({ creditor: '', account_type: 'Credit Card', current_balance: '', past_due_amount: '', credit_limit: '', bureau: 'Equifax', lane: 'Active Damage', open_date: '', notes: '' });
    setEditModalVisible(true);
  };

  const openEditModal = (account) => {
    setModalVisible(false);
    setEditingAccount(account);
    setAccountForm({
      creditor: account.creditor || account.account_name || '',
      account_type: account.account_type || 'Credit Card',
      current_balance: String(account.current_balance ?? account.balance ?? ''),
      past_due_amount: String(account.past_due_amount ?? ''),
      credit_limit: String(account.credit_limit ?? ''),
      bureau: account.bureau || 'Equifax',
      lane: account.lane || 'Active Damage',
      open_date: account.open_date || '',
      notes: account.notes || '',
    });
    setEditModalVisible(true);
  };

  const handleSaveAccount = async () => {
    if (!accountForm.creditor.trim()) {
      Alert.alert('Required', 'Creditor name is required.');
      return;
    }
    setSavingAccount(true);
    try {
      const payload = {
        creditor:         accountForm.creditor.trim(),
        account_name:     accountForm.creditor.trim(),
        account_type:     accountForm.account_type,
        current_balance:  parseFloat(accountForm.current_balance) || 0,
        past_due_amount:  parseFloat(accountForm.past_due_amount) || 0,
        credit_limit:     parseFloat(accountForm.credit_limit) || 0,
        bureau:           accountForm.bureau,
        lane:             accountForm.lane,
        open_date:        accountForm.open_date || null,
      };
      if (editingAccount) {
        await accountsAPI.update(editingAccount.id, payload);
        setAccounts(prev => prev.map(a => a.id === editingAccount.id ? { ...a, ...payload } : a));
      } else {
        const res = await accountsAPI.create(payload);
        const created = res?.data ?? payload;
        setAccounts(prev => [...prev, created]);
      }
      setEditModalVisible(false);
    } catch (err) {
      Alert.alert('Error', editingAccount ? 'Failed to update account.' : 'Failed to create account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = (account) => {
    Alert.alert(
      'Delete Account',
      `Remove "${account.creditor || account.account_name}" from your credit profile? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await accountsAPI.delete(account.id);
              setAccounts(prev => prev.filter(a => a.id !== account.id));
              setModalVisible(false);
            } catch {
              Alert.alert('Error', 'Failed to delete account.');
            }
          },
        },
      ]
    );
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
          <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>{accounts.length} accounts tracked</Text>
              <TouchableOpacity
                onPress={() => setShowBureauInfo(v => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Text style={[styles.infoIcon, showBureauInfo && styles.infoIconActive]}>  ⓘ</Text>
              </TouchableOpacity>
            </View>
        </View>
        <TouchableOpacity style={styles.addAccountBtn} onPress={openCreateModal} activeOpacity={0.7}>
          <Text style={styles.addAccountBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Bureau Info Banner */}
      {showBureauInfo && (
        <View style={styles.infoBanner}>
          <View style={styles.infoBannerHeader}>
            <Text style={styles.infoBannerTitle}>Why am I seeing multiple accounts?</Text>
            <TouchableOpacity
              onPress={() => setShowBureauInfo(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Text style={styles.infoBannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.infoBannerText}>
            It is common to see the same account listed multiple times. This happens because creditors report your accounts to multiple credit bureaus (TransUnion, Equifax, and Experian) separately. For example, one credit card may appear three times — once for each bureau that has it on record. This is completely normal and helps you track how each bureau is reporting your accounts.
          </Text>
        </View>
      )}

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
      {filter === 'all' ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id?.toString() ?? `${item.creditor}-${Math.random()}`}
          renderItem={({ item }) => <AccountCard item={item} onPress={handleAccountPress} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { borderLeftColor: section.color }]}>
              <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
              <Text style={[styles.sectionHeaderText, { color: section.color }]}>
                {section.title}
              </Text>
              <View style={[styles.sectionCount, { backgroundColor: section.color + '22' }]}>
                <Text style={[styles.sectionCountText, { color: section.color }]}>
                  {section.totalCount}
                </Text>
              </View>
            </View>
          )}
          renderSectionFooter={({ section }) => {
            if (section.totalCount <= PREVIEW_COUNT) return null;
            const isExpanded = !!expandedSections[section.lane];
            const hidden = section.totalCount - PREVIEW_COUNT;
            return (
              <TouchableOpacity
                style={[styles.expandBtn, { borderColor: section.color + '40' }]}
                onPress={() => toggleSection(section.lane)}
                activeOpacity={0.7}
              >
                <Text style={[styles.expandBtnText, { color: section.color }]}>
                  {isExpanded
                    ? '▲  Show less'
                    : `▼  Show ${hidden} more`}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
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
                    {search ? 'Try a different search term' : 'Upload a credit report to see your accounts'}
                  </Text>
                  {!search && (
                    <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Upload')}>
                      <Text style={styles.primaryButtonText}>Upload Credit Report</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
      ) : (
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
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={styles.emptyTitle}>No Accounts</Text>
              <Text style={styles.emptySubtext}>No accounts in this lane</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <AccountDetailModal
        account={selectedAccount}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onNavigateActions={() => { setModalVisible(false); navigation.navigate('Actions'); }}
        onDelete={() => handleDeleteAccount(selectedAccount)}
        onEdit={() => openEditModal(selectedAccount)}
      />

      {/* Create / Edit Account Modal */}
      <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.handleBar} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingAccount ? 'Edit Account' : 'Add Account'}</Text>
                <TouchableOpacity style={styles.closeButton} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Creditor */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>CREDITOR NAME *</Text>
                <TextInput
                  style={styles.formInput}
                  value={accountForm.creditor}
                  onChangeText={v => setAccountForm(f => ({ ...f, creditor: v }))}
                  placeholder="e.g. Capital One"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              {/* Account Type */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>ACCOUNT TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {ACCOUNT_TYPES.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chipBtn, accountForm.account_type === t && styles.chipBtnActive]}
                        onPress={() => setAccountForm(f => ({ ...f, account_type: t }))}
                      >
                        <Text style={[styles.chipBtnText, accountForm.account_type === t && styles.chipBtnTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Lane */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>LANE</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {LANE_LIST.map(l => {
                    const lc = getLaneColor(l);
                    const active = accountForm.lane === l;
                    return (
                      <TouchableOpacity
                        key={l}
                        style={[styles.chipBtn, active && { backgroundColor: lc + '25', borderColor: lc }]}
                        onPress={() => setAccountForm(f => ({ ...f, lane: l }))}
                      >
                        <Text style={[styles.chipBtnText, active && { color: lc }]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Bureau */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>BUREAU</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {BUREAUS_LIST.map(b => (
                    <TouchableOpacity
                      key={b}
                      style={[styles.chipBtn, accountForm.bureau === b && styles.chipBtnActive]}
                      onPress={() => setAccountForm(f => ({ ...f, bureau: b }))}
                    >
                      <Text style={[styles.chipBtnText, accountForm.bureau === b && styles.chipBtnTextActive]}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Amounts */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>AMOUNTS</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formFieldLabel}>Balance</Text>
                    <TextInput style={styles.formInput} value={accountForm.current_balance} onChangeText={v => setAccountForm(f => ({ ...f, current_balance: v }))} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formFieldLabel}>Past Due</Text>
                    <TextInput style={styles.formInput} value={accountForm.past_due_amount} onChangeText={v => setAccountForm(f => ({ ...f, past_due_amount: v }))} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
                  </View>
                </View>
                <Text style={[styles.formFieldLabel, { marginTop: 10 }]}>Credit Limit</Text>
                <TextInput style={styles.formInput} value={accountForm.credit_limit} onChangeText={v => setAccountForm(f => ({ ...f, credit_limit: v }))} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
              </View>

              {/* Open Date */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>OPEN DATE (optional)</Text>
                <TextInput style={styles.formInput} value={accountForm.open_date} onChangeText={v => setAccountForm(f => ({ ...f, open_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textSecondary} />
              </View>

              <TouchableOpacity
                style={[styles.takeActionButton, savingAccount && { opacity: 0.6 }]}
                onPress={handleSaveAccount}
                disabled={savingAccount}
              >
                <Text style={styles.takeActionButtonText}>{savingAccount ? 'Saving...' : editingAccount ? 'Save Changes' : 'Add Account'}</Text>
              </TouchableOpacity>
            </ScrollView>
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
    paddingVertical: 10,
    gap: 10,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 42,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: '#4B5563',
    gap: 8,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
    letterSpacing: 0.2,
  },
  filterCount: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    paddingLeft: 10,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  expandBtn: {
    marginHorizontal: 0,
    marginBottom: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  expandBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
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
    marginBottom: 8,
  },
  takeActionButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  // Dispute outcome
  outcomeHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  outcomeGrid: {
    gap: 8,
  },
  outcomeBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  outcomeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Notes
  notesLoading: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  noteDelete: {
    fontSize: 13,
    color: COLORS.danger,
    marginLeft: 8,
    paddingTop: 2,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  noteInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    color: COLORS.text,
    fontSize: 14,
    maxHeight: 80,
  },
  noteAddBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  noteAddBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  // Add account button
  addAccountBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addAccountBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  // Edit / Delete row in detail modal
  modalDangerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  editAccountBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  editAccountBtnText: {
    color: COLORS.text,
    fontWeight: '500',
    fontSize: 14,
  },
  deleteAccountBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.danger + '15',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    alignItems: 'center',
  },
  deleteAccountBtnText: {
    color: COLORS.danger,
    fontWeight: '500',
    fontSize: 14,
  },
  // Bureau info banner
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  infoIcon: {
    fontSize: 15,
    color: '#38BDF8',
    lineHeight: 20,
  },
  infoIconActive: {
    color: '#7DD3FC',
  },
  infoBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#0C1F3D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
    padding: 14,
  },
  infoBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 9,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38BDF8',
    flex: 1,
    marginRight: 10,
    lineHeight: 18,
  },
  infoBannerClose: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '600',
    lineHeight: 18,
  },
  infoBannerText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 20,
  },
  // Form inputs for create/edit modal
  formInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontSize: 15,
    marginTop: 6,
  },
  formFieldLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipBtnActive: {
    backgroundColor: COLORS.purple + '25',
    borderColor: COLORS.purple,
  },
  chipBtnText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chipBtnTextActive: {
    color: COLORS.purple,
    fontWeight: '600',
  },
});

export default AccountsScreen;
