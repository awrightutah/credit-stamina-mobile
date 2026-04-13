import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { activityAPI } from '../services/api';

const FILTER_STORAGE_KEY = '@activity_filter';

const COLORS = {
  // Credit Stamina Brand Colors (matching PWA)
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#F97316',
  errorRed: '#DC2626',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
};

const ActivityScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('all');
  const filterInitialised = useRef(false);

  // Restore persisted filter on mount
  useEffect(() => {
    AsyncStorage.getItem(FILTER_STORAGE_KEY)
      .then(val => { if (val) setFilter(val); })
      .catch(() => null)
      .finally(() => { filterInitialised.current = true; });
  }, []);

  // Persist filter whenever it changes (skip the initial mount value)
  useEffect(() => {
    if (!filterInitialised.current) return;
    AsyncStorage.setItem(FILTER_STORAGE_KEY, filter).catch(() => null);
  }, [filter]);

  const fetchActivities = async () => {
    try {
      const response = await activityAPI.getAll();
      setActivities(response.data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchActivities();
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActivities();
  }, []);

  const getActivityIcon = (type) => {
    switch (type) {
      case 'score_logged':          return '📊';
      case 'account_added':         return '🏦';
      case 'action_completed':      return '✅';
      case 'action_dismissed':      return '🚫';
      case 'letter_generated':      return '✍️';
      case 'letter_sent':           return '✉️';
      case 'letter_delivered':      return '📬';
      case 'letter_responded':      return '📩';
      case 'letter_escalated':      return '⚡';
      case 'upload':                return '📄';
      case 'report_uploaded':       return '📄';
      case 'dispute':               return '📝';
      case 'quick_win':             return '🎯';
      case 'quick_wins_generated':  return '🎯';
      case 'budget_update':         return '💰';
      case 'family_invited':        return '👨‍👩‍👧';
      case 'subscription_changed':  return '💎';
      case 'ai_analysis_run':       return '🤖';
      case 'score_prediction_run':  return '🔮';
      default:                      return '📌';
    }
  };

  const getActivityColor = (type) => {
    switch (type) {
      case 'score_logged':          return COLORS.primary;
      case 'score_prediction_run':  return COLORS.primary;
      case 'account_added':         return COLORS.secondary;
      case 'action_completed':      return COLORS.success;
      case 'quick_win':
      case 'quick_wins_generated':  return COLORS.success;
      case 'budget_update':         return COLORS.success;
      case 'action_dismissed':      return COLORS.textSecondary;
      case 'letter_generated':      return COLORS.warning;
      case 'letter_sent':           return COLORS.warning;
      case 'letter_delivered':      return COLORS.purple;
      case 'letter_responded':      return COLORS.primary;
      case 'letter_escalated':      return COLORS.danger;
      case 'upload':
      case 'report_uploaded':       return COLORS.purple;
      case 'dispute':               return COLORS.danger;
      case 'family_invited':        return '#EC4899';
      case 'subscription_changed':  return '#F59E0B';
      case 'ai_analysis_run':       return COLORS.purple;
      default:                      return COLORS.textSecondary;
    }
  };

  const handleActivityPress = (activity) => {
    const letterTypes  = ['letter_generated','letter_sent','letter_delivered','letter_responded','letter_escalated','dispute'];
    const scoreTypes   = ['score_logged','score_prediction_run'];
    const accountTypes = ['account_added','ai_analysis_run','report_uploaded','upload'];
    const budgetTypes  = ['budget_update'];
    const actionTypes  = ['action_completed','action_dismissed','quick_win','quick_wins_generated'];
    if (letterTypes.includes(activity.type)) {
      const letterId = activity.metadata?.letter_id;
      navigation.navigate('Letters', letterId ? { openLetterId: letterId } : undefined);
    } else if (scoreTypes.includes(activity.type)) {
      navigation.navigate('Score');
    } else if (accountTypes.includes(activity.type)) {
      navigation.navigate('Accounts');
    } else if (budgetTypes.includes(activity.type)) {
      navigation.navigate('Budget');
    } else if (actionTypes.includes(activity.type)) {
      navigation.navigate('Actions');
    }
  };

  const isNavigable = (type) => {
    return [
      'letter_generated','letter_sent','letter_delivered','letter_responded','letter_escalated','dispute',
      'score_logged','score_prediction_run',
      'account_added','ai_analysis_run','report_uploaded','upload',
      'budget_update',
      'action_completed','action_dismissed','quick_win','quick_wins_generated',
    ].includes(type);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filterOptions = [
    { key: 'all',     label: 'All'     },
    { key: 'letters', label: 'Letters' },
    { key: 'scores',  label: 'Scores'  },
    { key: 'reports', label: 'Reports' },
    { key: 'actions', label: 'Actions' },
    { key: 'family',  label: 'Family'  },
    { key: 'ai',      label: 'AI'      },
  ];

  const LETTER_TYPES  = ['letter_generated','letter_sent','letter_delivered','letter_responded','letter_escalated','dispute'];
  const SCORE_TYPES   = ['score_logged','score_prediction_run'];
  const REPORT_TYPES  = ['upload','report_uploaded','account_added','ai_analysis_run'];
  const ACTION_TYPES  = ['action_completed','action_dismissed','quick_win','quick_wins_generated','budget_update'];
  const FAMILY_TYPES  = ['family_invited','subscription_changed'];
  const AI_TYPES      = ['ai_analysis_run','ai_advisor_used','score_prediction_run','quick_wins_generated'];

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all')     return true;
    if (filter === 'letters') return LETTER_TYPES.includes(activity.type);
    if (filter === 'scores')  return SCORE_TYPES.includes(activity.type);
    if (filter === 'reports') return REPORT_TYPES.includes(activity.type);
    if (filter === 'actions') return ACTION_TYPES.includes(activity.type);
    if (filter === 'family')  return FAMILY_TYPES.includes(activity.type);
    if (filter === 'ai')      return AI_TYPES.includes(activity.type);
    return true;
  });

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const date = new Date(activity.created_at).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedActivities).sort((a, b) => 
    new Date(b) - new Date(a)
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Activity History</Text>
        <Text style={styles.subtitle}>Track your credit journey</Text>
      </View>

      {/* Filter Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {filterOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterTab, filter === option.key && styles.filterTabActive]}
            onPress={() => setFilter(option.key)}
          >
            <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activity List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {sortedDates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Activity Yet</Text>
            <Text style={styles.emptyText}>
              Your credit improvement activities will appear here
            </Text>
          </View>
        ) : (
          sortedDates.map((date) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>
                {date === new Date().toDateString() ? 'Today' : 
                 date === new Date(Date.now() - 86400000).toDateString() ? 'Yesterday' : 
                 new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              
              {groupedActivities[date].map((activity, index) => {
                const navigable = isNavigable(activity.type);
                const color = getActivityColor(activity.type);
                return (
                  <TouchableOpacity
                    key={activity.id || index}
                    style={styles.activityCard}
                    onPress={() => handleActivityPress(activity)}
                    activeOpacity={navigable ? 0.7 : 1}
                  >
                    <View style={[styles.activityIcon, { backgroundColor: color + '20' }]}>
                      <Text style={styles.activityIconText}>{getActivityIcon(activity.type)}</Text>
                    </View>

                    <View style={styles.activityContent}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      {activity.description && (
                        <Text style={styles.activityDescription}>{activity.description}</Text>
                      )}
                      <Text style={styles.activityTime}>{formatDate(activity.created_at)}</Text>
                    </View>

                    {activity.points ? (
                      <View style={styles.pointsBadge}>
                        <Text style={styles.pointsText}>+{activity.points}</Text>
                      </View>
                    ) : navigable ? (
                      <Text style={{ color: COLORS.textSecondary, fontSize: 16 }}>›</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  filterContainer: {
    maxHeight: 50,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.text,
  },
  listContainer: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityIconText: {
    fontSize: 20,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  activityDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  pointsBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pointsText: {
    color: COLORS.success,
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ActivityScreen;