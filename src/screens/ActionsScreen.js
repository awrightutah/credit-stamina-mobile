import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { actionsAPI, accountsAPI, aiAPI, pointsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  alertAmber: '#F97316',
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

const STATUS_FILTERS = [
  { key: 'pending',   label: 'Pending'   },
  { key: 'complete',  label: 'Completed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all',       label: 'All'       },
];

const PRIORITY_CONFIG = {
  1: { label: 'P1', color: COLORS.danger,  bg: COLORS.danger  + '20', text: 'HIGH' },
  2: { label: 'P2', color: COLORS.warning, bg: COLORS.warning + '20', text: 'MED'  },
  3: { label: 'P3', color: COLORS.success, bg: COLORS.success + '20', text: 'LOW'  },
};

const getPriority = (priority) => PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[3];

const formatDueDate = (dateStr) => {
  if (!dateStr) return null;
  const due  = new Date(dateStr);
  const now  = new Date();
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: COLORS.danger };
  if (diff === 0) return { label: 'Due today',                 color: COLORS.warning };
  if (diff <= 7)  return { label: `${diff}d left`,             color: COLORS.warning };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: COLORS.textSecondary };
};

// ─── Rule-based action builder ─────────────────────────────────────────────────
// Runs locally — no network needed. Used as the primary source + fallback when AI is slow.
// Helper so every action has both `title` (backend column) and `next_action`
// (what ActionCard reads). Sending both covers whichever schema the backend uses.
const makeAction = (fields) => ({
  ...fields,
  title:       fields.next_action,  // backend may use `title` column
  next_action: fields.next_action,  // ActionCard reads this
});

const buildRuleActions = (accounts) => {
  const daysOut = (d) =>
    new Date(Date.now() + d * 86400000).toISOString().split('T')[0];

  const actions = [];

  for (const a of accounts) {
    const name    = a.creditor || a.account_name || 'Account';
    const bureau  = a.bureau   || 'the bureau';
    const pastDue = parseFloat(a.past_due_amount)                 || 0;
    const balance = parseFloat(a.current_balance ?? a.balance)    || 0;
    const limit   = parseFloat(a.credit_limit)                    || 0;
    const utilization = limit > 0 ? Math.round((balance / limit) * 100) : 0;

    if (a.lane === 'Active Damage') {
      actions.push(makeAction({
        next_action:  `Dispute ${name} with ${bureau}`,
        description:  `${name} is actively damaging your score. File a formal bureau dispute with ${bureau} challenging this negative item and requesting correction or removal under the Fair Credit Reporting Act.`,
        account_name: name,
        account_id:   a.id,
        lane:         a.lane,
        category:     'dispute',
        priority:     1,
        status:       'pending',
        due_date:     daysOut(7),
      }));

      if (pastDue > 0) {
        actions.push(makeAction({
          next_action:  `Address $${pastDue.toLocaleString()} Past Due — ${name}`,
          description:  `${name} carries a past-due balance of $${pastDue.toLocaleString()}. Contact ${bureau} immediately to negotiate a payment plan or submit a hardship letter before additional late marks are reported.`,
          account_name: name,
          account_id:   a.id,
          lane:         a.lane,
          category:     'payment',
          priority:     1,
          status:       'pending',
          due_date:     daysOut(3),
        }));
      }

      if (limit > 0 && utilization > 30) {
        actions.push(makeAction({
          next_action:  `Reduce Utilization on ${name} (${utilization}%)`,
          description:  `${name} is at ${utilization}% utilization. Paying the balance below 30% of your $${limit.toLocaleString()} limit could significantly raise your score.`,
          account_name: name,
          account_id:   a.id,
          lane:         a.lane,
          category:     'payment',
          priority:     1,
          status:       'pending',
          due_date:     daysOut(14),
        }));
      }
    } else if (a.lane === 'Removable') {
      if (balance > 0) {
        actions.push(makeAction({
          next_action:  `Send Pay-for-Delete Letter — ${name}`,
          description:  `${name} has an outstanding balance of $${balance.toLocaleString()} and is in the Removable lane. A pay-for-delete letter negotiates full deletion from your ${bureau} report in exchange for payment.`,
          account_name: name,
          account_id:   a.id,
          lane:         a.lane,
          category:     'letter',
          priority:     2,
          status:       'pending',
          due_date:     daysOut(14),
        }));
      } else {
        actions.push(makeAction({
          next_action:  `Send Debt Validation Letter — ${name}`,
          description:  `${name} is in the Removable lane with no balance. A debt validation letter demands ${bureau} provide proof the debt is legally valid — if they cannot, it must be removed from your report.`,
          account_name: name,
          account_id:   a.id,
          lane:         a.lane,
          category:     'letter',
          priority:     2,
          status:       'pending',
          due_date:     daysOut(14),
        }));
      }
    } else if (a.lane === 'Aging/Monitor') {
      actions.push(makeAction({
        next_action:  `Send Goodwill Letter — ${name}`,
        description:  `${name} is aging off your report. A goodwill letter politely requests ${bureau} remove this item early in recognition of your improved payment behavior, accelerating your score recovery.`,
        account_name: name,
        account_id:   a.id,
        lane:         a.lane,
        category:     'letter',
        priority:     3,
        status:       'pending',
        due_date:     daysOut(30),
      }));
    }
  }

  // P1 by due date, then P2, then P3
  return actions.sort((a, b) =>
    a.priority - b.priority || a.due_date.localeCompare(b.due_date)
  );
};

// ─── Parse AI action plan response into flat action objects ────────────────────
const parseAIPlanToActions = (raw) => {
  const base       = raw?.plan || raw?.action_plan || raw?.data || raw || {};
  const priorityMap = { high: 1, medium: 2, low: 3 };
  const daysOut    = (d) =>
    new Date(Date.now() + (d || 30) * 86400000).toISOString().split('T')[0];

  const phases = [
    { key: 'days_30', fallbackDay: 15  },
    { key: 'days_60', fallbackDay: 45  },
    { key: 'days_90', fallbackDay: 75  },
    // some backends use different keys
    { key: 'days1to30',  fallbackDay: 15 },
    { key: 'days31to60', fallbackDay: 45 },
    { key: 'days61to90', fallbackDay: 75 },
  ];

  const seen    = new Set();
  const actions = [];

  for (const { key, fallbackDay } of phases) {
    const phaseData = base[key];
    if (!phaseData) continue;
    const tasks = Array.isArray(phaseData) ? phaseData : (phaseData.tasks || []);

    for (const t of tasks) {
      const title = (t.title || t.action || '').trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      actions.push(makeAction({
        next_action:  title,
        description:  t.description || t.details || '',
        category:     t.category || t.dispute_type || 'general',
        priority:     priorityMap[t.priority?.toLowerCase()] ?? 2,
        status:       'pending',
        due_date:     daysOut(t.due_day || fallbackDay),
      }));
    }
  }

  return actions;
};

// ─── Action Card ───────────────────────────────────────────────────────────────
const ActionCard = ({ item, onMarkDone, onDismiss, onUndo }) => {
  const priority    = getPriority(item.priority);
  const due         = formatDueDate(item.due_date);
  const isDone      = item.status === 'complete';
  const isDismissed = item.status === 'dismissed';
  const isFinished  = isDone || isDismissed;

  return (
    <View style={[styles.actionCard, isFinished && styles.actionCardDone]}>
      <View style={styles.cardTop}>
        <View style={[styles.priorityBadge, { backgroundColor: priority.bg, borderColor: priority.color + '40' }]}>
          <Text style={[styles.priorityBadgeText, { color: priority.color }]}>{priority.label}</Text>
        </View>
        {due && !isFinished && (
          <View style={styles.dueChip}>
            <Text style={[styles.dueDateText, { color: due.color }]}>{due.label}</Text>
          </View>
        )}
        {isDone && (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>✓ Done</Text>
          </View>
        )}
        {isDismissed && (
          <View style={styles.dismissedBadge}>
            <Text style={styles.dismissedBadgeText}>Dismissed</Text>
          </View>
        )}
      </View>

      <Text style={[styles.actionTitle, isFinished && styles.actionTitleDone]} numberOfLines={3}>
        {item.next_action || item.title || item.description || 'Action required'}
      </Text>

      {(item.account_name || item.creditor) && (
        <Text style={styles.accountName} numberOfLines={1}>
          {item.account_name || item.creditor}
        </Text>
      )}

      {item.category && (
        <View style={styles.categoryChip}>
          <Text style={styles.categoryText}>{item.category.toUpperCase()}</Text>
        </View>
      )}

      {!isFinished ? (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.markDoneBtn} onPress={() => onMarkDone(item.id)} activeOpacity={0.7}>
            <Text style={styles.markDoneBtnText}>✓ Mark Done</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => onDismiss(item.id)} activeOpacity={0.7}>
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.undoBtn} onPress={() => onUndo(item.id)} activeOpacity={0.7}>
          <Text style={styles.undoBtnText}>↩ Undo — Move Back to Pending</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Generating overlay ────────────────────────────────────────────────────────
const GeneratingOverlay = ({ step }) => (
  <View style={styles.overlayContainer}>
    <View style={styles.overlayCard}>
      <ActivityIndicator size="large" color={COLORS.purple} style={{ marginBottom: 16 }} />
      <Text style={styles.overlayTitle}>Analyzing Your Credit</Text>
      <Text style={styles.overlayStep}>{step || 'Please wait...'}</Text>
      <Text style={styles.overlayNote}>
        Claude AI is reviewing your accounts and building a personalized action queue.
      </Text>
    </View>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────
const ActionsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [generatingStep, setStep]     = useState('');
  const [actions, setActions]         = useState([]);
  const [filter, setFilter]           = useState('pending');
  const [error, setError]             = useState(null);
  const [updatingId, setUpdatingId]   = useState(null);

  // Ref to guard against concurrent generation calls across renders
  const generatingRef = useRef(false);

  // AsyncStorage cache key — scoped per user
  const cacheKey = user?.id ? `@actions_cache_${user.id}` : null;

  // ── Cache helpers ──────────────────────────────────────────────────────────
  const saveToCache = useCallback(async (data) => {
    if (!cacheKey || !Array.isArray(data) || data.length === 0) return;
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      console.warn('[Actions] cache write:', e?.message);
    }
  }, [cacheKey]);

  const loadFromCache = useCallback(async () => {
    if (!cacheKey) return [];
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[Actions] cache read:', e?.message);
      return [];
    }
  }, [cacheKey]);

  // ── Initial load — Supabase first, then cache, never auto-wipe existing data ──
  const loadActions = useCallback(async () => {
    try {
      setError(null);

      // 1. Try Supabase
      const response = await actionsAPI.getAll().catch(() => null);
      const dbData   = response?.data || [];

      if (dbData.length > 0) {
        // Real data from DB — show it and warm the cache
        setActions(dbData);
        saveToCache(dbData);
        return; // done — do NOT auto-generate
      }

      // 2. DB empty — try AsyncStorage cache
      const cached = await loadFromCache();
      if (cached.length > 0) {
        setActions(cached);
        return; // cached data shown — do NOT auto-generate
      }

      // 3. Truly nothing saved anywhere — first-time user, generate automatically
      generateActions(false);

    } catch (err) {
      console.error('[Actions] loadActions error:', err);
      // On network error always try cache before showing error
      const cached = await loadFromCache();
      if (cached.length > 0) {
        setActions(cached);
      } else {
        setError('Could not load actions. Check your connection.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run once when user ID is available
  useEffect(() => {
    if (user?.id) loadActions();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActions();
  }, [loadActions]);

  // ── AI + rule-based action generation ──────────────────────────────────────
  // IMPORTANT: this function only sets state at two safe points:
  //   A) After building actions locally (instant, no network) — optimistic display
  //   B) Never again — no getAll() after createBulk to avoid overwriting state
  const generateActions = async (isManual = true) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setError(null);
    setStep('Fetching your accounts...');

    try {
      // 1. Load accounts
      const accountsRes = await accountsAPI.getAll().catch(() => null);
      const accounts    = accountsRes?.data || [];

      if (accounts.length === 0) {
        if (isManual) Alert.alert('No Accounts', 'Upload a credit report or add accounts first to generate actions.');
        return;
      }

      setStep(`Analyzing ${accounts.length} accounts with Claude AI...`);

      // 2. Rule-based actions — instant, offline-capable, includes account IDs + lane data
      const ruleActions = buildRuleActions(accounts);

      // 3. Claude AI enrichment — optional, failures don't block
      let aiActions = [];
      try {
        const planRes = await aiAPI.getActionPlan(accounts);
        aiActions = parseAIPlanToActions(planRes?.data || planRes);
      } catch (e) {
        console.log('[Actions] AI plan unavailable, using rules:', e?.message);
      }

      // 4. Merge — rule-based first (has account IDs), dedupe AI by title
      const ruleKeys  = new Set(ruleActions.map(a => a.next_action.toLowerCase().trim()));
      const allActions = [
        ...ruleActions,
        ...aiActions.filter(a => !ruleKeys.has((a.next_action || '').toLowerCase().trim())),
      ];

      // 5. ── SHOW IMMEDIATELY ────────────────────────────────────────────────
      // Assign stable local IDs, show now, write to cache.
      // We do NOT do a getAll() after saving — that's what caused the disappearing bug.
      // (createBulk can fail silently and getAll would return stale/empty data,
      //  overwriting the fresh actions the user is looking at.)
      const displayActions = allActions.map((a, i) => ({ ...a, id: `temp-${i}` }));
      setActions(displayActions);
      saveToCache(displayActions);  // cache survives navigation + backgrounding
      setGenerating(false);
      setStep('');
      generatingRef.current = false;

      // 6. Persist to Supabase in the background — fire-and-forget.
      // We intentionally do NOT await getAll() after this. State is already correct.
      if (isManual) {
        actionsAPI.deleteAllPending().catch(e =>
          console.warn('[Actions] deleteAllPending failed (non-blocking):', e?.message)
        );
      }
      actionsAPI.createBulk(allActions).catch(e =>
        console.warn('[Actions] background save failed (cache still active):', e?.message)
      );

    } catch (err) {
      console.error('[Actions] generation error:', err);
      if (actions.length === 0) {
        setError('Could not generate actions. Check your connection.');
      }
      setGenerating(false);
      setStep('');
      generatingRef.current = false;
    }
  };

  // ── Action status helpers — keep state AND cache in sync ──────────────────
  const updateActionStatus = useCallback((id, newStatus) => {
    setActions(prev => {
      const next = prev.map(a => a.id === id ? { ...a, status: newStatus } : a);
      saveToCache(next);
      return next;
    });
  }, [saveToCache]);

  const handleMarkDone = async (id) => {
    updateActionStatus(id, 'complete');
    // Award points for completing an action (non-blocking)
    pointsAPI.award('complete_action', 'Completed a credit action', 20).catch(() => null);
    if (String(id).startsWith('temp-')) return;
    try {
      await actionsAPI.updateStatus(id, 'complete');
    } catch {
      updateActionStatus(id, 'pending');
      Alert.alert('Error', 'Failed to mark action done. Please try again.');
    }
  };

  const handleDismiss = (id) => {
    Alert.alert('Dismiss Action', 'Remove this action from your queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss', style: 'destructive',
        onPress: async () => {
          updateActionStatus(id, 'dismissed');
          if (String(id).startsWith('temp-')) return;
          try {
            await actionsAPI.updateStatus(id, 'dismissed');
          } catch {
            updateActionStatus(id, 'pending');
            Alert.alert('Error', 'Failed to dismiss action.');
          }
        },
      },
    ]);
  };

  const handleUndo = async (id) => {
    updateActionStatus(id, 'pending');
    if (String(id).startsWith('temp-')) return;
    try {
      await actionsAPI.updateStatus(id, 'pending');
    } catch {
      Alert.alert('Error', 'Failed to restore action. Please try again.');
    }
  };

  // Manual regenerate — user-initiated only, never automatic
  const handleRegenerate = () => {
    Alert.alert(
      'Refresh Action Queue',
      'This will rebuild your action queue from your latest account data using Claude AI. Completed actions will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refresh',
          onPress: async () => {
            // Clear cache so stale data doesn't flash while generating
            if (cacheKey) await AsyncStorage.removeItem(cacheKey).catch(() => null);
            setActions([]);
            generateActions(true);
          },
        },
      ]
    );
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const filteredActions  = filter === 'all' ? actions : actions.filter(a => a.status === filter);
  const pendingCount     = actions.filter(a => a.status === 'pending').length;
  const completedCount   = actions.filter(a => a.status === 'complete').length;
  const progressPct      = actions.length > 0
    ? Math.round((completedCount / actions.length) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
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
      {/* Generating overlay */}
      {generating && <GeneratingOverlay step={generatingStep} />}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Action Queue</Text>
          <Text style={styles.subtitle}>
            {pendingCount} pending · {completedCount} completed
          </Text>
        </View>
        <TouchableOpacity
          style={styles.regenBtn}
          onPress={handleRegenerate}
          disabled={generating}
          activeOpacity={0.7}
        >
          <Text style={styles.regenBtnText}>↺ Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      {actions.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{progressPct}% complete</Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filtersContainer}>
        {STATUS_FILTERS.map(f => {
          const active = filter === f.key;
          const count  = f.key === 'all'
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
            onUndo={handleUndo}
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
                <TouchableOpacity style={styles.retryBtn} onPress={loadActions}>
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              </>
            ) : filter === 'pending' ? (
              <>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptySubtext}>
                  No pending actions. Tap Refresh to build a new queue from your latest accounts.
                </Text>
                <TouchableOpacity style={styles.uploadBtn} onPress={() => generateActions(true)}>
                  <Text style={styles.uploadBtnText}>Generate Actions</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>Nothing Here</Text>
                <Text style={styles.emptySubtext}>Switch to "Pending" to see what needs to be done.</Text>
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
  // Generating overlay
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  overlayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.purple + '40',
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  overlayStep: {
    fontSize: 14,
    color: COLORS.purple,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  overlayNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  regenBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  regenBtnText: {
    fontSize: 13,
    color: COLORS.purple,
    fontWeight: '600',
  },
  // Progress
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
  // Filter tabs
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
  dismissedBadge: {
    backgroundColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dismissedBadgeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
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
  undoBtn: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  undoBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '500',
    fontSize: 13,
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
    backgroundColor: COLORS.purple,
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
