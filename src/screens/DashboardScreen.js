import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { accountsAPI, actionsAPI, scoresAPI, pointsAPI } from '../services/api';

const COLORS = {
  primary: '#3B82F6',
  secondary: '#10B981',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  damage: '#EF4444',
  removable: '#F59E0B',
  monitor: '#10B981',
};

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [actions, setActions] = useState([]);
  const [scores, setScores] = useState([]);
  const [points, setPoints] = useState(0);

  const fetchData = async () => {
    try {
      const [accountsRes, actionsRes, scoresRes, pointsRes] = await Promise.all([
        accountsAPI.getAll(),
        actionsAPI.getAll('Pending'),
        scoresAPI.getAll(),
        pointsAPI.get(),
      ]);

      setAccounts(accountsRes.data || []);
      setActions(actionsRes.data || []);
      setScores(scoresRes.data || []);
      setPoints(pointsRes.data?.points || 0);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
            onPress={() => navigation.navigate('Actions')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.quickActionIconText}>📋</Text>
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