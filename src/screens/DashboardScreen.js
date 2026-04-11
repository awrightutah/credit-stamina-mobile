import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { accountsAPI, actionsAPI, scoresAPI, pointsAPI, budgetAPI } from '../services/api';
import QuickWinsModal from '../components/QuickWinsModal';
import COLORS from '../theme/colors';

const { width } = Dimensions.get('window');

// ── Helpers ──────────────────────────────────────────────────────────────────

const getScoreColor = (score) => {
  if (!score) return COLORS.textSecondary;
  if (score >= 750) return COLORS.growthGreen;
  if (score >= 700) return COLORS.staminaBlue;
  if (score >= 650) return COLORS.powerPurple;
  if (score >= 600) return COLORS.alertAmber;
  return '#B45309';
};

const getScoreTier = (score) => {
  if (!score) return '—';
  if (score >= 750) return 'Excellent';
  if (score >= 700) return 'Good';
  if (score >= 650) return 'Fair';
  if (score >= 600) return 'Poor';
  return 'Very Poor';
};

const getPriorityLabel = (priority) => {
  if (priority === 1 || priority === 'high') return 'P1';
  if (priority === 2 || priority === 'medium') return 'P2';
  return 'P3';
};

const getPriorityColor = (priority) => {
  if (priority === 1 || priority === 'high') return COLORS.errorRed;
  if (priority === 2 || priority === 'medium') return COLORS.alertAmber;
  return COLORS.growthGreen;
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader = ({ title, onSeeAll }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onSeeAll && (
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={styles.seeAll}>See All →</Text>
      </TouchableOpacity>
    )}
  </View>
);

const StatCard = ({ value, label, color, bg }) => (
  <View style={[styles.statCard, { backgroundColor: bg }]}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const QuickActionTile = ({ emoji, label, color, onPress }) => (
  <TouchableOpacity style={styles.qaTile} onPress={onPress}>
    <View style={[styles.qaIcon, { backgroundColor: color + '22' }]}>
      <Text style={styles.qaEmoji}>{emoji}</Text>
    </View>
    <Text style={styles.qaLabel}>{label}</Text>
  </TouchableOpacity>
);

// ── Screen ────────────────────────────────────────────────────────────────────

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts]     = useState([]);
  const [actions, setActions]       = useState([]);
  const [scores, setScores]         = useState([]);
  const [points, setPoints]         = useState(0);
  const [budget, setBudget]         = useState(null);
  const [quickWinsVisible, setQuickWinsVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [accountsRes, actionsRes, scoresRes, pointsRes, budgetRes] = await Promise.all([
        accountsAPI.getAll(),
        actionsAPI.getAll('Pending'),
        scoresAPI.getAll(),
        pointsAPI.get(),
        budgetAPI.get().catch(() => ({ data: null })),
      ]);
      setAccounts(accountsRes.data || []);
      setActions(actionsRes.data || []);
      const sortedScores = (scoresRes.data || []).sort(
        (a, b) => new Date(b.recorded_date || b.reported_at) - new Date(a.recorded_date || a.reported_at)
      );
      setScores(sortedScores);
      setPoints(pointsRes.data?.points || 0);
      setBudget(budgetRes.data || null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) fetchData();
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const latestScore    = scores[0]?.score ?? null;
  const previousScore  = scores[1]?.score ?? null;
  const scoreChange    = latestScore && previousScore ? latestScore - previousScore : null;
  const scoreBarPct    = latestScore ? ((latestScore - 300) / 550) * 100 : 0;
  const scoreColor     = getScoreColor(latestScore);

  const totalAccounts    = accounts.length;
  const damageAccounts   = accounts.filter(a => a.lane === 'Active Damage').length;
  const removableAccounts = accounts.filter(a => a.lane === 'Removable').length;
  const monitorAccounts  = accounts.filter(a => a.lane === 'Aging/Monitor').length;
  const pendingCount     = actions.length;

  const monthlyIncome   = budget?.monthly_income   || 0;
  const monthlyExpenses = budget?.monthly_expenses  || 0;
  const forDebt         = monthlyIncome - monthlyExpenses;

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.powerPurple} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.powerPurple} />}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Credit Stamina</Text>
          <Text style={styles.greeting}>
            Welcome back, <Text style={styles.greetingEmail}>{user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}</Text>
          </Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsStar}>⭐</Text>
          <View>
            <Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
            <Text style={styles.pointsLabel}>points</Text>
          </View>
        </View>
      </View>

      {/* ── Credit Score Card ────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.scoreCard} onPress={() => navigation.navigate('Score')} activeOpacity={0.85}>
        <View style={styles.scoreCardTop}>
          <View>
            <Text style={styles.scoreCardLabel}>Credit Score</Text>
            <Text style={[styles.scoreNumber, { color: latestScore ? scoreColor : COLORS.textSecondary }]}>
              {latestScore ?? '—'}
            </Text>
          </View>
          <View style={styles.scoreRight}>
            {latestScore ? (
              <View style={[styles.tierBadge, { backgroundColor: scoreColor + '22', borderColor: scoreColor + '55' }]}>
                <Text style={[styles.tierText, { color: scoreColor }]}>{getScoreTier(latestScore)}</Text>
              </View>
            ) : null}
            {scoreChange !== null && (
              <View style={[styles.changeBadge, { backgroundColor: scoreChange >= 0 ? COLORS.growthGreen + '22' : COLORS.errorRed + '22' }]}>
                <Text style={[styles.changeText, { color: scoreChange >= 0 ? COLORS.growthGreen : COLORS.errorRed }]}>
                  {scoreChange >= 0 ? '+' : ''}{scoreChange} pts
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Score bar */}
        <View style={styles.scoreBarTrack}>
          <View style={[styles.scoreBarFill, { width: `${scoreBarPct}%`, backgroundColor: scoreColor }]} />
          {latestScore && (
            <View style={[styles.scoreBarDot, { left: `${scoreBarPct}%`, backgroundColor: scoreColor }]} />
          )}
        </View>
        <View style={styles.scoreBarLabels}>
          <Text style={styles.scoreBarLabel}>300</Text>
          <Text style={styles.scoreBarLabel}>Poor</Text>
          <Text style={styles.scoreBarLabel}>Fair</Text>
          <Text style={styles.scoreBarLabel}>Good</Text>
          <Text style={styles.scoreBarLabel}>850</Text>
        </View>

        {!latestScore && (
          <Text style={styles.scoreEmpty}>Tap to log your first credit score →</Text>
        )}
      </TouchableOpacity>

      {/* ── Account Health Grid ──────────────────────────────────────────── */}
      <View style={styles.sectionPad}>
        <SectionHeader title="Account Health" onSeeAll={() => navigation.navigate('Accounts')} />
        <View style={styles.statsGrid}>
          <StatCard
            value={totalAccounts}
            label="Total Accounts"
            color={COLORS.staminaBlue}
            bg={COLORS.staminaBlue + '18'}
          />
          <StatCard
            value={damageAccounts}
            label="Active Damage"
            color={COLORS.errorRed}
            bg={COLORS.errorRed + '18'}
          />
          <StatCard
            value={removableAccounts}
            label="Removable"
            color={COLORS.alertAmber}
            bg={COLORS.alertAmber + '18'}
          />
          <StatCard
            value={monitorAccounts}
            label="Aging / Monitor"
            color={COLORS.growthGreen}
            bg={COLORS.growthGreen + '18'}
          />
        </View>
      </View>

      {/* ── AI Quick Wins ────────────────────────────────────────────────── */}
      <View style={styles.sectionPad}>
        <TouchableOpacity style={styles.quickWinsBanner} onPress={() => setQuickWinsVisible(true)}>
          <View style={styles.quickWinsLeft}>
            <Text style={styles.quickWinsIcon}>⚡</Text>
            <View>
              <Text style={styles.quickWinsTitle}>AI Quick Wins</Text>
              <Text style={styles.quickWinsSubtitle}>Personalized next steps based on your accounts</Text>
            </View>
          </View>
          <Text style={styles.quickWinsArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* ── 30/60/90 Plan ────────────────────────────────────────────────── */}
      <View style={styles.sectionPad}>
        <TouchableOpacity style={styles.planBanner} onPress={() => navigation.navigate('ActionPlan')}>
          <View style={styles.quickWinsLeft}>
            <Text style={styles.quickWinsIcon}>📋</Text>
            <View>
              <Text style={styles.planTitle}>30 / 60 / 90 Day Plan</Text>
              <Text style={styles.planSubtitle}>AI-generated credit recovery roadmap</Text>
            </View>
          </View>
          <Text style={styles.quickWinsArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pending Actions ──────────────────────────────────────────────── */}
      <View style={styles.sectionPad}>
        <SectionHeader
          title={`Pending Actions${pendingCount ? ` (${pendingCount})` : ''}`}
          onSeeAll={() => navigation.navigate('Actions')}
        />
        {actions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No pending actions — you're all caught up 🎉</Text>
          </View>
        ) : (
          actions.slice(0, 3).map((action, index) => {
            const pColor = getPriorityColor(action.priority);
            const pLabel = getPriorityLabel(action.priority);
            return (
              <View key={action.id || index} style={styles.actionCard}>
                <View style={[styles.priorityBadge, { backgroundColor: pColor + '22', borderColor: pColor + '55' }]}>
                  <Text style={[styles.priorityText, { color: pColor }]}>{pLabel}</Text>
                </View>
                <View style={styles.actionBody}>
                  <Text style={styles.actionText} numberOfLines={2}>{action.next_action}</Text>
                  <Text style={styles.actionMeta}>{action.account_name}</Text>
                </View>
                <View style={[styles.laneBadge, { backgroundColor: COLORS.border }]}>
                  <Text style={styles.laneText} numberOfLines={1}>
                    {action.lane?.replace('Active ', '') || '—'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <View style={styles.sectionPad}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.qaGrid}>
          <QuickActionTile emoji="📤" label="Upload"    color={COLORS.powerPurple} onPress={() => navigation.navigate('Upload')} />
          <QuickActionTile emoji="✉️" label="Letters"   color={COLORS.staminaBlue} onPress={() => navigation.navigate('Letters')} />
          <QuickActionTile emoji="🤖" label="AI Advisor" color={COLORS.growthGreen} onPress={() => navigation.navigate('AIAdvisor')} />
          <QuickActionTile emoji="📊" label="Scores"    color={COLORS.alertAmber}  onPress={() => navigation.navigate('Score')} />
          <QuickActionTile emoji="💰" label="Budget"    color={COLORS.growthGreen} onPress={() => navigation.navigate('Budget')} />
          <QuickActionTile emoji="📈" label="Activity"  color={COLORS.staminaBlue} onPress={() => navigation.navigate('Activity')} />
        </View>
      </View>

      {/* ── Budget Snapshot ──────────────────────────────────────────────── */}
      {budget && (
        <View style={styles.sectionPad}>
          <SectionHeader title="Budget Snapshot" onSeeAll={() => navigation.navigate('Budget')} />
          <TouchableOpacity style={styles.budgetCard} onPress={() => navigation.navigate('Budget')}>
            <View style={styles.budgetRow}>
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemLabel}>Income</Text>
                <Text style={[styles.budgetItemValue, { color: COLORS.growthGreen }]}>
                  ${monthlyIncome.toLocaleString()}
                </Text>
              </View>
              <View style={styles.budgetDivider} />
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemLabel}>Expenses</Text>
                <Text style={[styles.budgetItemValue, { color: COLORS.errorRed }]}>
                  ${monthlyExpenses.toLocaleString()}
                </Text>
              </View>
              <View style={styles.budgetDivider} />
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemLabel}>For Debt</Text>
                <Text style={[styles.budgetItemValue, { color: forDebt >= 0 ? COLORS.staminaBlue : COLORS.errorRed }]}>
                  ${forDebt.toLocaleString()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Quick Wins Modal ─────────────────────────────────────────────── */}
      <QuickWinsModal
        visible={quickWinsVisible}
        onClose={() => setQuickWinsVisible(false)}
        onComplete={fetchData}
      />
    </ScrollView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appName: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.powerPurple,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  greeting: {
    fontSize: 18,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  greetingEmail: {
    color: COLORS.text,
    fontWeight: '600',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  pointsStar: { fontSize: 18 },
  pointsValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.alertAmber,
  },
  pointsLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },

  // Score Card
  scoreCard: {
    margin: 20,
    marginBottom: 0,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scoreCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  scoreCardLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '800',
    lineHeight: 58,
  },
  scoreRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 13,
    fontWeight: '700',
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scoreBarTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  scoreBarFill: {
    height: 8,
    borderRadius: 4,
  },
  scoreBarDot: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  scoreBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  scoreBarLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  scoreEmpty: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.powerPurple,
    textAlign: 'center',
  },

  // Section wrapper
  sectionPad: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  seeAll: {
    fontSize: 13,
    color: COLORS.powerPurple,
    fontWeight: '600',
  },

  // Account stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (width - 40 - 12) / 2,
    borderRadius: 14,
    padding: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },

  // Quick Wins / Plan banners
  quickWinsBanner: {
    backgroundColor: COLORS.powerPurple + '18',
    borderWidth: 1,
    borderColor: COLORS.powerPurple + '55',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planBanner: {
    backgroundColor: COLORS.staminaBlue + '18',
    borderWidth: 1,
    borderColor: COLORS.staminaBlue + '55',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickWinsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  quickWinsIcon: { fontSize: 28 },
  quickWinsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  quickWinsSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  quickWinsArrow: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  planSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Actions
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 34,
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBody: {
    flex: 1,
  },
  actionText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  laneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: 80,
  },
  laneText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Quick Actions grid
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  qaTile: {
    width: (width - 40 - 20) / 3,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qaIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  qaEmoji: { fontSize: 22 },
  qaLabel: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Budget
  budgetCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  budgetItem: {
    flex: 1,
    alignItems: 'center',
  },
  budgetDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  budgetItemLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  budgetItemValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default DashboardScreen;
