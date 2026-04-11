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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { actionsAPI } from '../services/api';
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

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'complete', label: 'Completed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
];

const PRIORITY_CONFIG = {
  1: { label: 'P1', color: COLORS.danger, bg: COLORS.danger + '20', text: 'HIGH' },
  2: { label: 'P2', color: COLORS.warning, bg: COLORS.warning + '20', text: 'MED' },
  3: { label: 'P3', color: COLORS.success, bg: COLORS.success + '20', text: 'LOW' },
};

const getPriority = (priority) => PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[3];

const formatDueDate = (dateStr) => {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: COLORS.danger };
  if (diffDays === 0) return { label: 'Due today', color: COLORS.warning };
  if (diffDays <= 7) return { label: `${diffDays}d left`, color: COLORS.warning };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: COLORS.textSecondary };
};

// ─── Action Card ───────────────────────────────────────────────────────────────
const ActionCard = ({ item, onMarkDone, onDismiss }) => {
  const priority = getPriority(item.priority);
  const due = formatDueDate(item.due_date);
  const isDone = item.status === 'complete';

  return (
    <View style={[styles.actionCard, isDone && styles.actionCardDone]}>
      <View style={styles.cardTop}>
        {/* Priority badge */}
        <View style={[styles.priorityBadge, { backgroundColor: priority.bg, borderColor: priority.color + '40' }]}>
          <Text style={[styles.priorityBadgeText, { color: priority.color }]}>{priority.label}</Text>
        </View>

        {/* Due date */}
        {due && (
          <View style={styles.dueChip}>
            <Text style={[styles.dueDateText, { color: due.color }]}>{due.label}</Text>
          </View>
        )}

        {/* Status */}
        {isDone && (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>✓ Done</Text>
          </View>
        )}
      </View>

      {/* Action text */}
      <Text style={[styles.actionTitle, isDone && styles.actionTitleDone]} numberOfLines={3}>
        {item.next_action || item.description || 'Action required'}
      </Text>

      {/* Account name */}
      {(item.account_name || item.creditor) && (
        <Text style={styles.accountName} numberOfLines={1}>
          {item.account_name || item.creditor}
        </Text>
      )}

      {/* Category */}
      {item.category && (
        <View style={styles.categoryChip}>
          <Text style={styles.categoryText}>{item.category.toUpperCase()}</Text>
        </View>
      )}

      {/* Actions */}
      {!isDone && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.markDoneBtn}
            onPress={() => onMarkDone(item.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.markDoneBtnText}>✓ Mark Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => onDismiss(item.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────
const ActionsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchActions = async () => {
    try {
      setError(null);
      const response = await actionsAPI.getAll(filter === 'all' ? undefined : filter);
      setActions(response.data || []);
    } catch (err) {
      console.error('[Actions] fetch error:', err);
      setError('Failed to load actions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchActions();
  }, [user?.id, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActions();
  }, [filter]);

  const handleMarkDone = async (id) => {
    setUpdatingId(id);
    try {
      await actionsAPI.updateStatus(id, 'complete');
      setActions(prev =>
        prev.map(a => a.id === id ? { ...a, status: 'complete' } : a)
      );
    } catch (err) {
      console.error('[Actions] mark done error:', err);
      Alert.alert('Error', 'Failed to update action. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDismiss = (id) => {
    Alert.alert('Dismiss Action', 'Remove this action from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          try {
            await actionsAPI.updateStatus(id, 'dismissed');
            setActions(prev =>
              filter === 'all'
                ? prev.map(a => a.id === id ? { ...a, status: 'dismissed' } : a)
                : prev.filter(a => a.id !== id)
            );
          } catch {
            Alert.alert('Error', 'Failed to dismiss action.');
          }
        },
      },
    ]);
  };

  const filteredActions = filter === 'all'
    ? actions
    : actions.filter(a => a.status === filter);

  const pendingCount = actions.filter(a => a.status === 'pending').length;
  const completedCount = actions.filter(a => a.status === 'complete').length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading actions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Action Queue</Text>
          <Text style={styles.subtitle}>
            {pendingCount} pending · {completedCount} completed
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      {actions.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((completedCount / actions.length) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {Math.round((completedCount / actions.length) * 100)}% complete
          </Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filtersContainer}>
        {STATUS_FILTERS.map(f => {
          const active = filter === f.key;
          const count = f.key === 'all'
            ? actions.length
            : actions.filter(a => a.status === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                {f.label}
              </Text>
              {count > 0 && (
                <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={filteredActions}
        keyExtractor={(item) => item.id?.toString() ?? Math.random().toString()}
        renderItem={({ item }) => (
          <ActionCard
            item={item}
            onMarkDone={handleMarkDone}
            onDismiss={handleDismiss}
            updating={updatingId === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {error ? (
              <>
                <Text style={styles.emptyIcon}>⚠️</Text>
                <Text style={styles.emptyTitle}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchActions}>
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              </>
            ) : filter === 'pending' ? (
              <>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptySubtext}>
                  No pending actions. Upload a credit report to generate new recommendations.
                </Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => navigation.navigate('Upload')}
                >
                  <Text style={styles.uploadBtnText}>Upload Report</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No Actions Here</Text>
                <Text style={styles.emptySubtext}>
                  Switch to "Pending" to see what needs to be done.
                </Text>
              </>
            )}
          </View>
        }
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    minWidth: 70,
    textAlign: 'right',
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  filterBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterBadgeText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterBadgeTextActive: {
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Action card
  actionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionCardDone: {
    opacity: 0.65,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dueChip: {
    flex: 1,
  },
  dueDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  doneBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  doneBadgeText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 6,
  },
  actionTitleDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textSecondary,
  },
  accountName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.purple + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 10,
    color: COLORS.purple,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  markDoneBtn: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  markDoneBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  dismissBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '500',
    fontSize: 14,
  },
  // Empty state
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
  uploadBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  uploadBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
});

export default ActionsScreen;
