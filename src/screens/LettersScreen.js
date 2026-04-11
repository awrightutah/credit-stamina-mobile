import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lettersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  alertAmber: '#D97706',
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

const LETTER_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'bureau_dispute', label: 'Bureau Dispute' },
  { key: 'goodwill', label: 'Goodwill' },
  { key: 'pay_for_delete', label: 'Pay for Delete' },
  { key: 'debt_validation', label: 'Debt Validation' },
];

const STATUS_COLORS = {
  sent: COLORS.success,
  pending: COLORS.warning,
  draft: COLORS.textSecondary,
  responded: COLORS.staminaBlue,
  delivered: COLORS.purple,
};

const getLetterTypeLabel = (type) => {
  switch (type?.toLowerCase()) {
    case 'bureau_dispute':
    case 'dispute': return 'Bureau Dispute';
    case 'goodwill': return 'Goodwill';
    case 'pay_for_delete': return 'Pay for Delete';
    case 'debt_validation':
    case 'validation': return 'Debt Validation';
    default: return type || 'Letter';
  }
};

const getStatusColor = (status) => STATUS_COLORS[status?.toLowerCase()] ?? COLORS.textSecondary;

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Letter Card ───────────────────────────────────────────────────────────────
const LetterCard = ({ letter, onPress, onDelete }) => {
  const statusColor = getStatusColor(letter.status);
  return (
    <TouchableOpacity style={styles.letterCard} onPress={() => onPress(letter)} activeOpacity={0.7}>
      <View style={styles.letterCardHeader}>
        <View style={styles.letterTypeRow}>
          <Text style={styles.letterTypeText}>{getLetterTypeLabel(letter.letter_type)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(letter.status || 'draft').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.letterBureau}>{letter.bureau || 'Credit Bureau'}</Text>
      </View>

      <Text style={styles.letterAccount} numberOfLines={1}>
        {letter.account_name || letter.account_id || 'General'}
      </Text>

      <View style={styles.letterFooter}>
        <Text style={styles.letterDate}>{formatDate(letter.created_at)}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={(e) => { e.stopPropagation(); onDelete(letter.id); }}
          >
            <Text style={styles.cardDeleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Generate Modal ────────────────────────────────────────────────────────────
const GenerateModal = ({ visible, onClose, onGenerate }) => {
  const [letterType, setLetterType] = useState('bureau_dispute');
  const [accountName, setAccountName] = useState('');
  const [reason, setReason] = useState('');
  const [bureau, setBureau] = useState('Equifax');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!accountName.trim()) {
      Alert.alert('Missing Info', 'Please enter an account name');
      return;
    }
    setLoading(true);
    try {
      await onGenerate({ letter_type: letterType, account_name: accountName, reason, bureau });
      setAccountName('');
      setReason('');
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to generate letter. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.handleBar} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Generate Letter</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>LETTER TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelectorScroll}>
              {LETTER_TYPES.filter(t => t.key !== 'all').map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeChip, letterType === t.key && styles.typeChipActive]}
                  onPress={() => setLetterType(t.key)}
                >
                  <Text style={[styles.typeChipText, letterType === t.key && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>BUREAU</Text>
            <View style={styles.bureauRow}>
              {['Equifax', 'Experian', 'TransUnion'].map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.bureauChip, bureau === b && styles.typeChipActive]}
                  onPress={() => setBureau(b)}
                >
                  <Text style={[styles.typeChipText, bureau === b && styles.typeChipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>ACCOUNT NAME</Text>
            <TextInput
              style={styles.textInput}
              value={accountName}
              onChangeText={setAccountName}
              placeholder="e.g. Capital One, Chase"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.inputLabel}>REASON / NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe the reason for this letter..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.generateBtn, loading && { opacity: 0.7 }]}
              onPress={handleGenerate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.generateBtnText}>Generate Letter</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ letter, visible, onClose }) => {
  if (!letter) return null;
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.handleBar} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{getLetterTypeLabel(letter.letter_type)}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.detailSection}>
              {[
                { label: 'Bureau', value: letter.bureau || 'N/A' },
                { label: 'Account', value: letter.account_name || letter.account_id || 'N/A' },
                { label: 'Status', value: letter.status || 'Draft', color: getStatusColor(letter.status) },
                { label: 'Created', value: formatDate(letter.created_at) },
                { label: 'Sent Date', value: formatDate(letter.sent_date) },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={[styles.detailValue, color && { color }]}>{value}</Text>
                </View>
              ))}
            </View>

            {letter.content && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>LETTER CONTENT</Text>
                <View style={styles.letterContentBox}>
                  <Text style={styles.letterContentText}>{letter.content}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => Alert.alert('Coming Soon', 'PDF download will be available in the next update.')}
            >
              <Text style={styles.copyBtnText}>Download PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────
const LettersScreen = () => {
  const { user } = useAuth();
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [generateVisible, setGenerateVisible] = useState(false);

  const fetchLetters = async () => {
    try {
      setError(null);
      const data = await lettersAPI.getAll();
      setLetters(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      console.error('[Letters] fetch error:', err);
      setError('Failed to load letters');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchLetters();
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLetters();
  }, []);

  const handleGenerate = async (params) => {
    await lettersAPI.generate(params);
    await fetchLetters();
    Alert.alert('Success', 'Letter generated successfully!');
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Letter', 'Are you sure you want to delete this letter?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await lettersAPI.delete(id);
            setLetters(prev => prev.filter(l => l.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete letter');
          }
        },
      },
    ]);
  };

  const filteredLetters = activeTab === 'all'
    ? letters
    : letters.filter(l => {
        const t = l.letter_type?.toLowerCase() ?? '';
        const tab = activeTab.toLowerCase();
        // Handle aliases
        if (tab === 'bureau_dispute') return t === 'bureau_dispute' || t === 'dispute';
        if (tab === 'debt_validation') return t === 'debt_validation' || t === 'validation';
        return t === tab;
      });

  // Counts per tab
  const tabCounts = Object.fromEntries(LETTER_TYPES.map(t => {
    if (t.key === 'all') return [t.key, letters.length];
    const count = letters.filter(l => {
      const lt = l.letter_type?.toLowerCase() ?? '';
      if (t.key === 'bureau_dispute') return lt === 'bureau_dispute' || lt === 'dispute';
      if (t.key === 'debt_validation') return lt === 'debt_validation' || lt === 'validation';
      return lt === t.key;
    }).length;
    return [t.key, count];
  }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dispute Letters</Text>
          <Text style={styles.subtitle}>{letters.length} letters total</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setGenerateVisible(true)}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Type Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {LETTER_TYPES.map(tab => {
          const active = activeTab === tab.key;
          const count = tabCounts[tab.key] ?? 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading letters...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLetters}
          keyExtractor={(item) => item.id?.toString() ?? Math.random().toString()}
          renderItem={({ item }) => (
            <LetterCard
              letter={item}
              onPress={(l) => { setSelectedLetter(l); setDetailVisible(true); }}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {error ? (
                <>
                  <Text style={styles.emptyIcon}>⚠️</Text>
                  <Text style={styles.emptyTitle}>{error}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={fetchLetters}>
                    <Text style={styles.retryBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.emptyIcon}>✉️</Text>
                  <Text style={styles.emptyTitle}>No Letters Yet</Text>
                  <Text style={styles.emptySubtext}>
                    {activeTab === 'all'
                      ? 'Generate your first dispute letter to get started.'
                      : 'No letters of this type found.'}
                  </Text>
                  {activeTab === 'all' && (
                    <TouchableOpacity style={styles.generateBtnEmpty} onPress={() => setGenerateVisible(true)}>
                      <Text style={styles.generateBtnText}>Generate First Letter</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
      )}

      {/* Modals */}
      <GenerateModal
        visible={generateVisible}
        onClose={() => setGenerateVisible(false)}
        onGenerate={handleGenerate}
      />
      <DetailModal
        letter={selectedLetter}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  addBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
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
  tabActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  tabBadgeTextActive: {
    color: COLORS.text,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Letter Card
  letterCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  letterCardHeader: {
    marginBottom: 10,
  },
  letterTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  letterTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  letterBureau: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  letterAccount: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  letterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  letterDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: COLORS.danger + '20',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
  },
  cardDeleteText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '500',
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  generateBtnEmpty: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  retryBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    paddingTop: 12,
    maxHeight: 500,
  },
  modalFooter: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  // Generate modal
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
  },
  typeSelectorScroll: {
    flexGrow: 0,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  typeChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  bureauRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bureauChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  generateBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  generateBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  // Detail modal
  detailSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '60',
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  contentSection: {
    marginBottom: 16,
  },
  letterContentBox: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  letterContentText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  copyBtn: {
    backgroundColor: COLORS.staminaBlue,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  copyBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LettersScreen;
