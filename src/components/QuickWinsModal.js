import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { aiAPI, aiCacheAPI } from '../services/api';

const COLORS = {
  // Credit Stamina Brand Colors (matching PWA)
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  secondary: '#059669',
  growthGreen: '#059669',
  alertAmber: '#EA580C',
  errorRed: '#DC2626',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#EA580C',
  success: '#059669',
  purple: '#7C3AED',
};

const QuickWinsModal = ({ visible, onClose, onComplete }) => {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      fetchQuickWins();
    }
  }, [visible]);

  const fetchQuickWins = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first unless forcing a refresh
      if (!forceRefresh) {
        const cached = await aiCacheAPI.get('quick_wins').catch(() => null);
        if (cached) {
          const parsed = aiCacheAPI.parse(cached);
          const cachedSteps = parsed?.steps || parsed || [];
          if (Array.isArray(cachedSteps) && cachedSteps.length > 0) {
            setSteps(cachedSteps);
            setLoading(false);
            return;
          }
        }
      }

      const response = await aiAPI.getQuickWins();
      const freshSteps = response.data?.steps || response.data || [];
      setSteps(freshSteps);
      // Save to cache
      aiCacheAPI.set('quick_wins', { steps: freshSteps }, null).catch(() => null);
    } catch (err) {
      console.error('Error fetching quick wins:', err);
      setError('Failed to load quick wins');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDone = async (step, index) => {
    // If the step has no id, just remove it locally — no API call needed
    if (!step.id) {
      setSteps(prev => prev.filter((_, i) => i !== index));
      Alert.alert('✅ Completed!', 'Great job! Keep up the momentum!');
      onComplete?.();
      return;
    }
    try {
      await aiAPI.completeAction(step.id);
      setSteps(steps.filter(s => s.id !== step.id));
      Alert.alert('✅ Completed!', 'Great job! Keep up the momentum!');
      onComplete?.(); // refresh dashboard stats
    } catch (err) {
      console.error('Error completing action:', err);
      Alert.alert('Error', 'Failed to mark as done');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return COLORS.danger;
      case 'medium':
        return COLORS.warning;
      case 'low':
        return COLORS.success;
      default:
        return COLORS.textSecondary;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>⭐ Your Next Steps</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerIcon}>⚡</Text>
            <Text style={styles.disclaimerText}>
              Quick wins based on your credit report — cached to reduce AI costs
            </Text>
          </View>
          <Text style={styles.aiDisclaimer}>
            AI-generated. Verify before acting. Not legal/financial advice.
          </Text>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.purple} />
              <Text style={styles.loadingText}>AI is analyzing your accounts...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchQuickWins}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.stepsList} contentContainerStyle={styles.stepsContent}>
              {steps.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🎉</Text>
                  <Text style={styles.emptyTitle}>All caught up!</Text>
                  <Text style={styles.emptyText}>
                    Check back later for more personalized recommendations
                  </Text>
                </View>
              ) : (
                steps.map((step, index) => (
                  <View key={step.id || index} style={styles.stepCard}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>{step.title || step.action}</Text>
                      {step.description && (
                        <Text style={styles.stepDescription}>{step.description}</Text>
                      )}
                      
                      <View style={styles.stepFooter}>
                        {step.account && (
                          <Text style={styles.stepAccount}>📍 {step.account}</Text>
                        )}
                        {step.priority && (
                          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(step.priority) }]}>
                            <Text style={styles.priorityText}>{step.priority.toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.doneButton}
                      onPress={() => handleMarkDone(step, index)}
                    >
                      <Text style={styles.doneButtonText}>Mark Done</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '20',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
  },
  disclaimerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.warning,
  },
  aiDisclaimer: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: COLORS.danger,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  stepsList: {
    flex: 1,
  },
  stepsContent: {
    padding: 20,
    paddingTop: 8,
  },
  stepCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.purple,
  },
  stepNumber: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  stepContent: {
    marginRight: 40,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  stepDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  stepFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepAccount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  doneButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  doneButtonText: {
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
});

export default QuickWinsModal;