import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { accountsAPI, actionsAPI, scoresAPI, pointsAPI, aiAPI, budgetAPI } from '../services/api';
import QuickWinsModal from '../components/QuickWinsModal';

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
  darkCharcoal: '#111827',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  mediumGray: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#059669',
  damage: '#DC2626',
  removable: '#D97706',
  monitor: '#059669',
  purple: '#7C3AED',
};

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [actions, setActions] = useState([]);
  const [scores, setScores] = useState([]);
  const [points, setPoints] = useState(0);
  const [budget, setBudget] = useState(null);
  const [quickWinsVisible, setQuickWinsVisible] = useState(false);

  const fetchData = async () => {
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
      setScores(scoresRes.data || []);
      setPoints(pointsRes.data?.points || 0);
      setBudget(budgetRes.data || null);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  // Calculate stats
  const totalAccounts = accounts.length;
  const damageAccounts = accounts.filter(a => a.lane === 'Active Damage').length;
  const removableAccounts = accounts.filter(a => a.lane === 'Removable').length;
  const monitorAccounts = accounts.filter(a => a.lane === 'Aging/Monitor').length;
  const pendingActions = actions.length;
  const latestScore = scores.length > 0 ? scores[scores.length - 1].score : null;

  // Budget calculations
  const monthlyIncome = budget?.monthly_income || 0;
  const monthlyExpenses = budget?.monthly_expenses || 0;
  const availableForDebt = monthlyIncome - monthlyExpenses;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.email || 'User'}</Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsLabel}>Points</Text>
          <Text style={styles.pointsValue}>{points}</Text>
        </View>
      </View>

      {/* Score Card */}
      {latestScore && (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Latest Credit Score</Text>
          <Text style={styles.scoreValue}>{latestScore}</Text>
          <View style={styles.scoreBar}>
            <View style={[styles.scoreIndicator, { left: `${(latestScore - 300) / 5.5}%` }]} />
          </View>
          <View style={styles.scoreRange}>
            <Text style={styles.scoreRangeText}>300</Text>
            <Text style={styles.scoreRangeText}>850</Text>
          </View>
        </View>
      )}

      {/* AI Quick Wins Button */}
      <TouchableOpacity 
        style={styles.quickWinsButton}
        onPress={() => setQuickWinsVisible(true)}
      >
        <View style={styles.quickWinsContent}>
          <Text style={styles.quickWinsEmoji}>🤖</Text>
          <View style={styles.quickWinsText}>
            <Text style={styles.quickWinsTitle}>Quick Wins</Text>
            <Text style={styles.quickWinsSubtitle}>AI-powered next steps</Text>
          </View>
        </View>
        <Text style={styles.quickWinsArrow}>→</Text>
      </TouchableOpacity>

      {/* Budget Snapshot Widget */}
      {budget && (
        <TouchableOpacity 
          style={styles.budgetWidget}
          onPress={() => navigation.navigate('Budget')}
        >
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>💰 Budget Snapshot</Text>
            <Text style={styles.budgetSeeAll}>Details →</Text>
          </View>
          <View style={styles.budgetRow}>
            <View style={styles.budgetItem}>
              <Text style={styles.budgetLabel}>Income</Text>
              <Text style={[styles.budgetValue, { color: COLORS.success }]}>
                ${monthlyIncome.toLocaleString()}
              </Text>
            </View>
            <View style={styles.budgetDivider} />
            <View style={styles.budgetItem}>
              <Text style={styles.budgetLabel}>Expenses</Text>
              <Text style={[styles.budgetValue, { color: COLORS.danger }]}>
                ${monthlyExpenses.toLocaleString()}
              </Text>
            </View>
            <View style={styles.budgetDivider} />
            <View style={styles.budgetItem}>
              <Text style={styles.budgetLabel}>For Debt</Text>
              <Text style={[styles.budgetValue, { color: COLORS.primary }]}>
                ${availableForDebt.toLocaleString()}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: COLORS.danger }]}>
          <Text style={styles.statValue}>{damageAccounts}</Text>
          <Text style={styles.statLabel}>Active Damage</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: COLORS.warning }]}>
          <Text style={styles.statValue}>{removableAccounts}</Text>
          <Text style={styles.statLabel}>Removable</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: COLORS.success }]}>
          <Text style={styles.statValue}>{monitorAccounts}</Text>
          <Text style={styles.statLabel}>Monitoring</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: COLORS.primary }]}>
          <Text style={styles.statValue}>{pendingActions}</Text>
          <Text style={styles.statLabel}>Pending Tasks</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('Upload')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.purple }]}>
              <Text style={styles.quickActionIconText}>📄</Text>
            </View>
            <Text style={styles.quickActionText}>Upload Report</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('ActionPlan')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.success }]}>
              <Text style={styles.quickActionIconText}>📋</Text>
            </View>
            <Text style={styles.quickActionText}>30/60/90 Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('Actions')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.quickActionIconText}>✅</Text>
            </View>
            <Text style={styles.quickActionText}>View Tasks</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('Score')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.secondary }]}>
              <Text style={styles.quickActionIconText}>📊</Text>
            </View>
            <Text style={styles.quickActionText}>Log Score</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('Letters')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.warning }]}>
              <Text style={styles.quickActionIconText}>✉️</Text>
            </View>
            <Text style={styles.quickActionText}>Letters</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('AIAdvisor')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.danger }]}>
              <Text style={styles.quickActionIconText}>🤖</Text>
            </View>
            <Text style={styles.quickActionText}>AI Advisor</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Actions */}
      {actions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Actions</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Actions')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          {actions.slice(0, 3).map((action, index) => (
            <View key={action.id || index} style={styles.actionItem}>
              <View style={[styles.actionPriority, { 
                backgroundColor: action.priority === 1 ? COLORS.danger :
                                action.priority === 2 ? COLORS.warning : COLORS.success 
              }]} />
              <View style={styles.actionContent}>
                <Text style={styles.actionText}>{action.next_action}</Text>
                <Text style={styles.actionAccount}>{action.account_name}</Text>
              </View>
              <Text style={styles.actionLane}>{action.lane}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Quick Wins Modal */}
      <QuickWinsModal
        visible={quickWinsVisible}
        onClose={() => setQuickWinsVisible(false)}
        onComplete={fetchData}
      />
    </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  pointsBadge: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  pointsLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  pointsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scoreCard: {
    backgroundColor: COLORS.card,
    margin: 20,
    marginTop: 0,
    borderRadius: 16,
    padding: 20,
  },
  scoreLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  scoreBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    position: 'relative',
  },
  scoreIndicator: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  scoreRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  scoreRangeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  quickWinsButton: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.purple,
  },
  quickWinsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickWinsEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  quickWinsText: {
    flex: 1,
  },
  quickWinsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  quickWinsSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  quickWinsArrow: {
    fontSize: 24,
    color: COLORS.purple,
  },
  budgetWidget: {
    backgroundColor: COLORS.card,
    margin: 20,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  budgetSeeAll: {
    fontSize: 14,
    color: COLORS.primary,
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
  budgetLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  budgetValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.primary,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionButton: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionIconText: {
    fontSize: 24,
  },
  quickActionText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  actionPriority: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  actionAccount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionLane: {
    fontSize: 12,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
});

export default DashboardScreen;