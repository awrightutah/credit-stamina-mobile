import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { aiAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  // Credit Stamina Brand Colors (matching PWA)
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#F59E0B',
  errorRed: '#DC2626',
  background: '#0f172a',
  card: '#111827',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F59E0B',
  success: '#059669',
  purple: '#7C3AED',
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#059669',
};

const ActionPlanScreen = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState('days1-30');
  const [completedTasks, setCompletedTasks] = useState(new Set());

  const fetchPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await aiAPI.getActionPlan();
      const raw = response.data || response;
      console.log('[ActionPlan] raw response:', JSON.stringify(raw, null, 2));

      // Unwrap nested envelope if backend wraps in plan/action_plan/data
      const base = raw?.plan || raw?.action_plan || raw?.data || raw;

      // Map backend snake_case keys to UI camelCase keys
      const normalizedPlan = {
        ...base,
        days1to30: base?.days_30 || base?.days1to30 || null,
        days31to60: base?.days_60 || base?.days31to60 || null,
        days61to90: base?.days_90 || base?.days61to90 || null,
        potentialPoints: base?.potential_points || base?.potentialPoints || base?.target_score_gain || null,
      };

      console.log('[ActionPlan] normalized plan keys:', Object.keys(normalizedPlan || {}));
      setPlan(normalizedPlan);
    } catch (err) {
      console.error('[ActionPlan] error:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load action plan');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchPlan();
    }
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPlan();
  }, []);

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return COLORS.high;
      case 'medium':
        return COLORS.medium;
      case 'low':
        return COLORS.low;
      default:
        return COLORS.textSecondary;
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleMarkDone = (taskKey) => {
    setCompletedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskKey)) {
        next.delete(taskKey);
      } else {
        next.add(taskKey);
      }
      return next;
    });
  };

  const renderTask = (task, index, sectionKey) => {
    const taskKey = `${sectionKey}-${index}`;
    const isDone = completedTasks.has(taskKey);
    return (
      <View key={taskKey} style={[styles.taskCard, isDone && styles.taskCardDone]}>
        <View style={styles.taskHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) }]}>
            <Text style={styles.priorityText}>{task.priority?.toUpperCase() || 'MEDIUM'}</Text>
          </View>
          {isDone && (
            <View style={styles.doneBadge}>
              <Text style={styles.doneBadgeText}>✓ Done</Text>
            </View>
          )}
          {/* Backend returns estimated_impact, handle both formats */}
          {!isDone && (task.estimated_impact || task.points) && (
            <Text style={styles.pointsText}>{task.estimated_impact || `+${task.points} pts`}</Text>
          )}
        </View>

        <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]}>
          {task.title || task.action}
        </Text>

        {task.description && (
          <Text style={styles.taskDescription}>{task.description}</Text>
        )}

        <View style={styles.taskFooter}>
          {/* Backend returns category, handle both dispute_type and category */}
          {(task.category || task.dispute_type) && (
            <View style={styles.disputeBadge}>
              <Text style={styles.disputeText}>{(task.category || task.dispute_type).toUpperCase()}</Text>
            </View>
          )}
          {/* Backend returns due_day, handle both due_day and day */}
          {(task.due_day || task.day) && (
            <Text style={styles.dayText}>Day {task.due_day || task.day}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.markDoneButton, isDone && styles.markDoneButtonDone]}
          onPress={() => handleMarkDone(taskKey)}
        >
          <Text style={styles.markDoneText}>
            {isDone ? '↩ Undo' : '✓ Mark Done'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSection = (title, days, data, sectionKey) => {
    const isExpanded = expandedSection === sectionKey;
    const tasks = data?.tasks || data || [];
    // Backend returns score_impact, UI was looking for pointsRange
    const pointsRange = data?.score_impact || data?.pointsRange || '';
    const theme = data?.theme || days;
    
    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection(sectionKey)}
        >
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionDays}>{theme}</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            {pointsRange && (
              <Text style={styles.sectionPoints}>{pointsRange}</Text>
            )}
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.tasksContainer}>
            {tasks.length > 0 ? (
              tasks.map((task, index) => renderTask(task, index, sectionKey))
            ) : (
              <Text style={styles.emptyText}>No tasks for this period</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Generating your personalized action plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPlan}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Your 30/60/90 Day Action Plan</Text>
          {plan?.summary && (
            <Text style={styles.summary}>{plan.summary}</Text>
          )}
          {plan?.potentialPoints && (
            <View style={styles.potentialBanner}>
              <Text style={styles.potentialIcon}>⭐</Text>
              <Text style={styles.potentialText}>+{plan.potentialPoints} Potential Points</Text>
            </View>
          )}
        </View>

        {/* Plan Sections */}
        {plan?.days1to30 && renderSection('Days 1-30', 'Foundation & Quick Wins', plan.days1to30, 'days1-30')}
        {plan?.days31to60 && renderSection('Days 31-60', 'Dispute & Follow-up', plan.days31to60, 'days31-60')}
        {plan?.days61to90 && renderSection('Days 61-90', 'Build & Monitor', plan.days61to90, 'days61-90')}

        {/* Fallback if plan structure is different */}
        {!plan?.days1to30 && !plan?.days31to60 && !plan?.days61to90 && plan?.tasks && (
          <View style={styles.section}>
            {plan.tasks.map((task, index) => renderTask(task, index, 'tasks'))}
          </View>
        )}

        {/* Empty State */}
        {!plan?.days1to30 && !plan?.days31to60 && !plan?.days61to90 && !plan?.tasks && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Credit Reports Found</Text>
            <Text style={styles.emptyText}>
              Your account has no credit reports on file. Go to the Upload tab and import a PDF credit report — the AI will then generate your personalized plan.
            </Text>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            AI-generated plan. Verify before acting. Not legal/financial advice.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.danger,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  potentialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '20',
    padding: 12,
    borderRadius: 8,
  },
  potentialIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  potentialText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.success,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  sectionDays: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionPoints: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  expandIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  tasksContainer: {
    marginTop: 12,
    gap: 12,
  },
  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  taskDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  disputeBadge: {
    backgroundColor: COLORS.purple + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  disputeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.purple,
  },
  dayText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  taskCardDone: {
    opacity: 0.6,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textSecondary,
  },
  doneBadge: {
    backgroundColor: COLORS.success + '25',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  doneBadgeText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
  },
  markDoneButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  markDoneButtonDone: {
    backgroundColor: COLORS.border,
  },
  markDoneText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  disclaimer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.warning + '20',
    borderRadius: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: COLORS.warning,
    textAlign: 'center',
  },
});

export default ActionPlanScreen;