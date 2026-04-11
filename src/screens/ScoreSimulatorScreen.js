import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { aiAPI, accountsAPI } from '../services/api';

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
};

const ScoreSimulatorScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedImprovements, setSelectedImprovements] = useState([]);
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getAll();
      setAccounts(response.data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const toggleImprovement = (improvement) => {
    setSelectedImprovements(prev => {
      const exists = prev.find(i => i.id === improvement.id);
      if (exists) {
        return prev.filter(i => i.id !== improvement.id);
      }
      return [...prev, improvement];
    });
  };

  const simulateScore = async () => {
    if (selectedImprovements.length === 0) {
      Alert.alert('Select Improvements', 'Please select at least one improvement to simulate.');
      return;
    }

    setLoading(true);
    try {
      const response = await aiAPI.predictScore(selectedImprovements);
      setPrediction(response.data);
    } catch (error) {
      console.error('Error predicting score:', error);
      Alert.alert('Error', 'Failed to simulate score. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Generate improvement options from accounts
  const improvementOptions = accounts.map(account => [
    {
      id: `${account.id}-payoff`,
      account_id: account.id,
      account_name: account.account_name,
      type: 'pay_off',
      description: `Pay off ${account.account_name}`,
      details: account.balance ? `Balance: $${account.balance}` : '',
    },
    {
      id: `${account.id}-dispute`,
      account_id: account.id,
      account_name: account.account_name,
      type: 'dispute',
      description: `Dispute ${account.account_name}`,
      details: account.lane || 'Removable item',
    },
  ]).flat();

  const getImprovementIcon = (type) => {
    switch (type) {
      case 'pay_off': return '💳';
      case 'dispute': return '📝';
      case 'lower_utilization': return '📊';
      default: return '✨';
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Score Simulator</Text>
        <Text style={styles.subtitle}>See how improvements affect your score</Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsIcon}>🔮</Text>
        <Text style={styles.instructionsText}>
          Select the improvements you're planning to make, and our AI will predict 
          how they might impact your credit score.
        </Text>
      </View>

      {/* Improvement Options */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Improvements</Text>
        <Text style={styles.sectionSubtitle}>
          Choose actions you plan to take
        </Text>

        {improvementOptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Upload a credit report to see improvement options
            </Text>
            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={() => navigation.navigate('Upload')}
            >
              <Text style={styles.uploadButtonText}>Upload Report</Text>
            </TouchableOpacity>
          </View>
        ) : (
          improvementOptions.map((option) => {
            const isSelected = selectedImprovements.find(i => i.id === option.id);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.improvementCard, isSelected && styles.improvementCardSelected]}
                onPress={() => toggleImprovement(option)}
              >
                <View style={styles.improvementHeader}>
                  <Text style={styles.improvementIcon}>
                    {getImprovementIcon(option.type)}
                  </Text>
                  <View style={styles.improvementInfo}>
                    <Text style={styles.improvementName}>{option.account_name}</Text>
                    <Text style={styles.improvementDesc}>{option.description}</Text>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </View>
                {option.details && (
                  <Text style={styles.improvementDetails}>{option.details}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Simulate Button */}
      <TouchableOpacity
        style={[styles.simulateButton, selectedImprovements.length === 0 && styles.simulateButtonDisabled]}
        onPress={simulateScore}
        disabled={loading || selectedImprovements.length === 0}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.text} />
        ) : (
          <>
            <Text style={styles.simulateButtonIcon}>🚀</Text>
            <Text style={styles.simulateButtonText}>Simulate Score Impact</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Prediction Results */}
      {prediction && (
        <View style={styles.predictionCard}>
          <Text style={styles.predictionTitle}>🎯 Predicted Impact</Text>
          
          <View style={styles.scoreComparison}>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>Current</Text>
              <Text style={styles.scoreValue}>{prediction.current_score || '---'}</Text>
            </View>
            <Text style={styles.arrowText}>→</Text>
            <View style={[styles.scoreBox, styles.scoreBoxPredicted]}>
              <Text style={styles.scoreLabel}>Predicted</Text>
              <Text style={[styles.scoreValue, styles.scoreValuePredicted]}>
                {prediction.predicted_score || '---'}
              </Text>
            </View>
          </View>

          <View style={styles.changeIndicator}>
            <Text style={[
              styles.changeText,
              { color: prediction.points_change >= 0 ? COLORS.success : COLORS.danger }
            ]}>
              {prediction.points_change >= 0 ? '+' : ''}{prediction.points_change} points
            </Text>
          </View>

          {prediction.explanation && (
            <View style={styles.explanationBox}>
              <Text style={styles.explanationTitle}>Why this change?</Text>
              <Text style={styles.explanationText}>{prediction.explanation}</Text>
            </View>
          )}

          {prediction.timeline && (
            <View style={styles.timelineBox}>
              <Text style={styles.timelineTitle}>📅 Expected Timeline</Text>
              <Text style={styles.timelineText}>{prediction.timeline}</Text>
            </View>
          )}
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Tips for Score Improvement</Text>
        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>Pay down credit card balances to under 30% utilization</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>Dispute inaccurate negative items on your report</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>Keep old accounts open to maintain credit history length</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>Avoid opening multiple new accounts at once</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    fontSize: 16,
    color: COLORS.primary,
    marginBottom: 16,
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
  instructionsCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionsIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  improvementCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  improvementCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  improvementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  improvementIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  improvementInfo: {
    flex: 1,
  },
  improvementName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  improvementDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  improvementDetails: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 8,
    marginLeft: 36,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  simulateButton: {
    backgroundColor: COLORS.purple,
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulateButtonDisabled: {
    opacity: 0.5,
  },
  simulateButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  simulateButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  predictionCard: {
    backgroundColor: COLORS.card,
    margin: 20,
    marginTop: 0,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  scoreComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scoreBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
  },
  scoreBoxPredicted: {
    backgroundColor: COLORS.success,
  },
  scoreLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scoreValuePredicted: {
    color: COLORS.background,
  },
  arrowText: {
    fontSize: 24,
    color: COLORS.textSecondary,
    marginHorizontal: 16,
  },
  changeIndicator: {
    alignItems: 'center',
    marginBottom: 16,
  },
  changeText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  explanationBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  timelineBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purple,
    marginBottom: 4,
  },
  timelineText: {
    fontSize: 14,
    color: COLORS.text,
  },
  tipsCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  tipBullet: {
    color: COLORS.primary,
    marginRight: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});

export default ScoreSimulatorScreen;