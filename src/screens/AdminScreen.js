import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { adminAPI, statesAPI, POINTS_GOAL } from '../services/api';
import { supabase } from '../services/supabase';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  surface: '#0F172A',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  purple: '#7C3AED',
  blue: '#1E40AF',
  success: '#059669',
  danger: '#DC2626',
  warning: '#F97316',
  amber: '#F59E0B',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─── User Row ─────────────────────────────────────────────────────────────────
const UserRow = ({ user, onPress }) => {
  const isActive =
    ['paid', 'active'].includes((user.subscription_override ?? '').toLowerCase()) ||
    user.subscription_status === 'active';

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    || user.email?.split('@')[0]
    || 'Unknown';

  return (
    <TouchableOpacity style={styles.userRow} onPress={() => onPress(user)} activeOpacity={0.7}>
      <View style={[styles.userAvatar, { backgroundColor: isActive ? COLORS.purple + '30' : COLORS.card }]}>
        <Text style={styles.userAvatarText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userNameText} numberOfLines={1}>
          {displayName}{user.is_admin ? ' 👑' : ''}{user.is_test_user ? ' 🧪' : ''}
        </Text>
        <Text style={styles.userEmailText} numberOfLines={1}>{user.email}</Text>
      </View>
      <View style={styles.userMeta}>
        <View style={[styles.subBadge, { backgroundColor: isActive ? COLORS.success + '20' : COLORS.border }]}>
          <Text style={[styles.subBadgeText, { color: isActive ? COLORS.success : COLORS.textSecondary }]}>
            {isActive ? 'Pro' : 'Free'}
          </Text>
        </View>
        <Text style={styles.userPoints}>{user.stamina_points ?? 0} pts</Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Edit User Modal ──────────────────────────────────────────────────────────
const EditUserModal = ({ visible, user, onClose, onSave }) => {
  const [subOverride, setSubOverride] = useState('');
  const [points, setPoints] = useState('');
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState('');

  useEffect(() => {
    if (user) {
      setSubOverride(user.subscription_override ?? '');
      setPoints(String(user.stamina_points ?? 0));
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (subOverride !== (user.subscription_override ?? '')) {
        updates.subscription_override = subOverride.trim() || null;
      }
      const newPts = parseInt(points, 10);
      if (!isNaN(newPts) && newPts !== (user.stamina_points ?? 0)) {
        updates.stamina_points = newPts;
      }
      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }
      await adminAPI.updateUser(user.id, updates);
      onSave();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Could not update user');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAction = async (action) => {
    setQuickSaving(action);
    try {
      if (action === 'free') {
        await adminAPI.updateUser(user.id, { subscription_override: 'free' });
        Alert.alert('Done', `${user.email} has been set to Free Plan.`);
        onSave();
      } else if (action === 'promo') {
        await adminAPI.updateUser(user.id, { promo_price: 9.99, is_test_user: true });
        Alert.alert('Done', `$9.99/mo promo rate applied to ${user.email}.`);
        onSave();
      } else if (action === 'gencode') {
        // Generate a unique one-time invite code for this person
        const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
        const code = `CS-${rand}`;
        const { error } = await supabase.from('promo_codes').insert({
          code,
          price: 9.99,
          max_uses: 1,
          uses_count: 0,
          is_active: true,
        });
        if (error) throw error;
        Alert.alert(
          'Code Generated',
          `Share this one-time code with ${user.email}:\n\n${code}\n\nIt gives $9.99/mo for life and can only be used once.`,
          [{ text: 'OK' }]
        );
        // Don't call onSave — no user record changed
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Could not complete action');
    } finally {
      setQuickSaving('');
    }
  };

  if (!user) return null;

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit User</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.modalUserName}>{displayName}</Text>
          <Text style={styles.modalUserEmail}>{user.email}</Text>

          {/* Quick Actions */}
          <Text style={styles.inputLabel}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnWarning, quickSaving === 'free' && { opacity: 0.6 }]}
              onPress={() => handleQuickAction('free')}
              disabled={!!quickSaving}
            >
              {quickSaving === 'free'
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.quickBtnText}>Set Free Plan</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnPromo, quickSaving === 'promo' && { opacity: 0.6 }]}
              onPress={() => handleQuickAction('promo')}
              disabled={!!quickSaving}
            >
              {quickSaving === 'promo'
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.quickBtnText}>Apply $9.99 Promo</Text>
              }
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.quickBtn, styles.quickBtnCode, quickSaving === 'gencode' && { opacity: 0.6 }, { marginBottom: 4 }]}
            onPress={() => handleQuickAction('gencode')}
            disabled={!!quickSaving}
          >
            {quickSaving === 'gencode'
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.quickBtnText}>Generate One-Time Invite Code ($9.99)</Text>
            }
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Subscription Override</Text>
          <Text style={styles.inputHint}>Values: paid · active · free · trial (leave blank to clear)</Text>
          <TextInput
            style={styles.input}
            value={subOverride}
            onChangeText={setSubOverride}
            placeholder="e.g. paid"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
          />

          <Text style={styles.inputLabel}>Points Balance</Text>
          <TextInput
            style={styles.input}
            value={points}
            onChangeText={setPoints}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textSecondary}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const AdminScreen = () => {
  const navigation = useNavigation();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tab, setTab] = useState('overview');
  const [activity, setActivity] = useState([]);
  const [statsError, setStatsError] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [usersErrorMsg, setUsersErrorMsg] = useState('');
  const [states, setStates] = useState([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesSearch, setStatesSearch] = useState('');
  const [togglingState, setTogglingState] = useState('');
  const retryCount = useRef(0);

  // Fetch with silent auto-retry (up to 3 attempts, 1.5s apart)
  const fetchWithRetry = useCallback(async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (result !== null && result !== undefined) return result;
      } catch {}
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1500));
    }
    return null;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [statsResult, usersResult] = await Promise.allSettled([
        fetchWithRetry(() => adminAPI.getStats()),
        adminAPI.getUsers(),   // direct call so we capture the real error
      ]);

      if (statsResult.status === 'fulfilled' && statsResult.value) {
        setStats(statsResult.value);
        setStatsError(false);
      } else {
        setStatsError(true);
      }

      if (usersResult.status === 'fulfilled' && Array.isArray(usersResult.value)) {
        setUsers(usersResult.value);
        setUsersError(false);
        setUsersErrorMsg('');
        retryCount.current = 0;
      } else {
        const msg = usersResult.reason?.message || 'Could not load users';
        setUsersError(true);
        setUsersErrorMsg(msg);
        console.warn('[Admin] getUsers failed:', msg);
        if (retryCount.current === 0) {
          retryCount.current = 1;
          setTimeout(() => loadData(), 3000);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchWithRetry]);

  const loadActivity = useCallback(async () => {
    const data = await adminAPI.getRecentActivity(30).catch(() => []);
    setActivity(data);
  }, []);

  const loadStates = useCallback(async () => {
    setStatesLoading(true);
    try {
      const data = await statesAPI.getAll();
      setStates(data);
    } catch (e) {
      console.warn('[Admin] loadStates error:', e?.message);
    } finally {
      setStatesLoading(false);
    }
  }, []);

  const handleToggleState = async (stateCode, currentActive) => {
    setTogglingState(stateCode);
    try {
      await statesAPI.setActive(stateCode, !currentActive);
      setStates(prev => prev.map(s =>
        s.state_code === stateCode ? { ...s, is_active: !currentActive } : s
      ));
    } catch (err) {
      Alert.alert('Error', err?.message || 'Could not update state');
    } finally {
      setTogglingState('');
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (tab === 'activity') loadActivity();
    if (tab === 'states') loadStates();
  }, [tab, loadActivity, loadStates]);

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'activity') loadActivity();
    else if (tab === 'states') { loadStates(); setRefreshing(false); }
    else loadData();
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').toLowerCase();
    return name.includes(q) || (u.email ?? '').toLowerCase().includes(q);
  });

  const activeCount = users.filter(u =>
    ['paid', 'active'].includes((u.subscription_override ?? '').toLowerCase()) ||
    u.subscription_status === 'active'
  ).length;

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={{ minWidth: 50 }} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'users',    label: `Users (${users.length})` },
          { key: 'states',   label: 'States' },
          { key: 'activity', label: 'Activity' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.purple} />
            <Text style={styles.loadingText}>Loading admin data...</Text>
          </View>
        ) : (
          <>
            {/* ── Overview Tab ── */}
            {tab === 'overview' && (
              <>
                {statsError && (
                  <View style={styles.warningCard}>
                    <Text style={styles.warningText}>
                      ⚠️ Could not load stats. Pull down to refresh.
                    </Text>
                  </View>
                )}

                <View style={styles.statsGrid}>
                  <StatCard
                    label="Total Users"
                    value={stats?.total_users ?? users.length}
                    color={COLORS.blue}
                    icon="👥"
                  />
                  <StatCard
                    label="Pro Subscribers"
                    value={stats?.active_subscriptions ?? activeCount}
                    color={COLORS.success}
                    icon="⭐"
                  />
                  <StatCard
                    label="Letters Sent"
                    value={stats?.total_letters ?? '—'}
                    color={COLORS.purple}
                    icon="✉️"
                  />
                  <StatCard
                    label="Total Actions"
                    value={stats?.total_actions ?? '—'}
                    color={COLORS.amber}
                    icon="✅"
                  />
                </View>

                {/* Revenue estimate */}
                <View style={styles.revenueCard}>
                  <Text style={styles.revenueLabel}>EST. MONTHLY REVENUE</Text>
                  <Text style={styles.revenueValue}>
                    ${((stats?.active_subscriptions ?? activeCount) * 24.99).toFixed(2)}
                  </Text>
                  <Text style={styles.revenueSubtitle}>
                    {stats?.active_subscriptions ?? activeCount} subscribers × $24.99
                  </Text>
                </View>

                {/* Points redemptions */}
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>🎯 Points System</Text>
                  <Text style={styles.infoText}>
                    Users earn points for key actions. {POINTS_GOAL} points = 1 free month.
                    {'\n'}Upload report: 50 pts · Log score: 25 pts · Complete action: 20 pts
                    {'\n'}Generate letter: 30 pts · Add bill: 10 pts
                  </Text>
                </View>

                {/* Quick user summary */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>RECENT SIGNUPS</Text>
                </View>
                {usersError ? (
                  <TouchableOpacity style={styles.retryCard} onPress={() => { setUsersError(false); setLoading(true); loadData(); }}>
                    <Text style={styles.retryCardText}>Could not load signups</Text>
                    {!!usersErrorMsg && <Text style={styles.retryCardErr}>{usersErrorMsg}</Text>}
                    <Text style={styles.retryCardSub}>↺ Tap to retry</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.card}>
                    {users.slice(0, 5).map((u, i) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        onPress={setEditUser}
                      />
                    ))}
                    {users.length > 5 && (
                      <TouchableOpacity style={styles.seeAllBtn} onPress={() => setTab('users')}>
                        <Text style={styles.seeAllText}>See all {users.length} users →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── Users Tab ── */}
            {tab === 'users' && (
              <>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or email..."
                  placeholderTextColor={COLORS.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {usersError ? (
                  <TouchableOpacity style={styles.retryCard} onPress={() => { setUsersError(false); setLoading(true); loadData(); }}>
                    <Text style={styles.retryCardText}>Could not load users</Text>
                    {!!usersErrorMsg && <Text style={styles.retryCardErr}>{usersErrorMsg}</Text>}
                    <Text style={styles.retryCardSub}>↺ Tap to retry</Text>
                  </TouchableOpacity>
                ) : filteredUsers.length === 0 ? (
                  <View style={styles.centered}>
                    <Text style={styles.emptyText}>{search ? 'No users match your search.' : 'No users found.'}</Text>
                    <Text style={styles.emptySubtext}>Pull down to refresh.</Text>
                  </View>
                ) : (
                  <View style={styles.card}>
                    {filteredUsers.map((u) => (
                      <UserRow key={u.id} user={u} onPress={setEditUser} />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── States Tab ── */}
            {tab === 'states' && (
              <>
                <View style={styles.statesHeader}>
                  <Text style={styles.statesTitle}>Service Area</Text>
                  <Text style={styles.statesSubtitle}>
                    {states.filter(s => s.is_active).length} of {states.length} states active
                  </Text>
                </View>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search states..."
                  placeholderTextColor={COLORS.textSecondary}
                  value={statesSearch}
                  onChangeText={setStatesSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {statesLoading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color={COLORS.purple} />
                    <Text style={styles.loadingText}>Loading states...</Text>
                  </View>
                ) : (
                  <View style={styles.card}>
                    {states
                      .filter(s =>
                        !statesSearch ||
                        s.state_name.toLowerCase().includes(statesSearch.toLowerCase()) ||
                        s.state_code.toLowerCase().includes(statesSearch.toLowerCase())
                      )
                      .map((s, i, arr) => (
                        <View
                          key={s.state_code}
                          style={[styles.stateRow, i < arr.length - 1 && styles.stateRowBorder]}
                        >
                          <View style={styles.stateInfo}>
                            <Text style={styles.stateCode}>{s.state_code}</Text>
                            <Text style={styles.stateName}>{s.state_name}</Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.stateToggle,
                              s.is_active ? styles.stateToggleOn : styles.stateToggleOff,
                              togglingState === s.state_code && { opacity: 0.5 },
                            ]}
                            onPress={() => handleToggleState(s.state_code, s.is_active)}
                            disabled={togglingState === s.state_code}
                            activeOpacity={0.7}
                          >
                            {togglingState === s.state_code
                              ? <ActivityIndicator size="small" color="#FFF" />
                              : <Text style={styles.stateToggleText}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </Text>
                            }
                          </TouchableOpacity>
                        </View>
                      ))
                    }
                  </View>
                )}
              </>
            )}

            {/* ── Activity Tab ── */}
            {tab === 'activity' && (
              <>
                {activity.length === 0 ? (
                  <View style={styles.centered}>
                    <Text style={styles.emptyText}>No recent activity found.</Text>
                    <Text style={styles.emptySubtext}>Activity will appear here as users take actions.</Text>
                  </View>
                ) : (
                  <View style={styles.card}>
                    {activity.map((a, i) => (
                      <View key={a.id ?? i} style={[styles.activityRow, i < activity.length - 1 && styles.activityBorder]}>
                        <View style={styles.activityDot} />
                        <View style={styles.activityContent}>
                          <Text style={styles.activityTitle} numberOfLines={1}>{a.title || a.type}</Text>
                          {a.description ? (
                            <Text style={styles.activityDesc} numberOfLines={1}>{a.description}</Text>
                          ) : null}
                        </View>
                        <View style={styles.activityTime}>
                          <Text style={styles.activityDate}>{formatDate(a.created_at)}</Text>
                          <Text style={styles.activityTimeText}>{formatTime(a.created_at)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <EditUserModal
        visible={!!editUser}
        user={editUser}
        onClose={() => setEditUser(null)}
        onSave={() => {
          setEditUser(null);
          loadData();
          Alert.alert('Saved', 'User updated successfully.');
        }}
      />
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
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.purple,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.purple,
    fontWeight: '700',
  },
  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: COLORS.textSecondary, marginTop: 12, fontSize: 14 },
  emptyText: { color: COLORS.text, fontSize: 15, textAlign: 'center' },
  emptySubtext: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6 },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 3,
    alignItems: 'center',
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600', letterSpacing: 0.5 },
  // Revenue card
  revenueCard: {
    backgroundColor: COLORS.success + '12',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.success + '30',
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  revenueLabel: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  revenueValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 4,
  },
  revenueSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  // Info card
  infoCard: {
    backgroundColor: COLORS.blue + '12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.blue + '30',
    padding: 14,
    marginBottom: 14,
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  // Warning card
  warningCard: {
    backgroundColor: COLORS.warning + '12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    padding: 14,
    marginBottom: 14,
  },
  warningText: { fontSize: 13, color: COLORS.warning, lineHeight: 19 },
  // Section header
  sectionHeader: { marginBottom: 8, paddingHorizontal: 2 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  retryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  retryCardText: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 4 },
  retryCardErr: { color: COLORS.danger, fontSize: 11, marginBottom: 6, textAlign: 'center' },
  retryCardSub: { color: COLORS.purple, fontSize: 15, fontWeight: '600' },
  seeAllBtn: {
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  seeAllText: { color: COLORS.purple, fontSize: 14, fontWeight: '600' },
  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userAvatarText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  userInfo: { flex: 1 },
  userNameText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  userEmailText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  userMeta: { alignItems: 'flex-end', gap: 4 },
  subBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subBadgeText: { fontSize: 11, fontWeight: '600' },
  userPoints: { fontSize: 11, color: COLORS.amber },
  // Search
  searchInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 12,
  },
  // Activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.purple,
    marginRight: 12,
  },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  activityDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  activityTime: { alignItems: 'flex-end', marginLeft: 8 },
  activityDate: { fontSize: 11, color: COLORS.textSecondary },
  activityTimeText: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  // States tab
  statesHeader: {
    marginBottom: 10,
  },
  statesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  statesSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  stateRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stateInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stateCode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    width: 32,
  },
  stateName: {
    fontSize: 14,
    color: COLORS.text,
  },
  stateToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 76,
    alignItems: 'center',
  },
  stateToggleOn: {
    backgroundColor: COLORS.success,
  },
  stateToggleOff: {
    backgroundColor: COLORS.border,
  },
  stateToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalClose: { fontSize: 18, color: COLORS.textSecondary, padding: 4 },
  modalUserName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  modalUserEmail: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 12 },
  inputHint: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  quickBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  quickBtnWarning: {
    backgroundColor: COLORS.warning,
  },
  quickBtnPromo: {
    backgroundColor: COLORS.success,
  },
  quickBtnCode: {
    backgroundColor: COLORS.blue,
    flex: undefined,
    width: '100%',
  },
  quickBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

export default AdminScreen;
