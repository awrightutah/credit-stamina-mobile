import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { budgetAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#059669',
  purple: '#7C3AED',
};

const EDUCATION_ITEMS = [
  {
    icon: '💳',
    title: 'Credit Utilization (30% of score)',
    description: 'Paying down credit card balances reduces your utilization ratio — one of the fastest ways to boost your score. Keeping utilization under 30% is the goal.',
  },
  {
    icon: '📅',
    title: 'On-Time Payments (35% of score)',
    description: 'Budgeting ensures you always have money for minimum payments. Even one late payment can drop your score 50-100 points. Your budget is your safety net.',
  },
  {
    icon: '🏦',
    title: 'Debt-to-Income Ratio',
    description: 'While not part of your credit score directly, lenders check this ratio when you apply for a mortgage or loan. Reducing monthly debt payments improves approval odds.',
  },
  {
    icon: '💸',
    title: 'Paying Collections',
    description: 'If you have collection accounts in your disputes, budgeting a "pay-for-delete" amount can remove negative items entirely — especially effective for older debts.',
  },
];

const BudgetScreen = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [budget, setBudget] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    monthlyIncome: '',
    monthlyExpenses: '',
    savingsGoal: '',
  });

  const fetchBudget = async () => {
    try {
      setLoading(true);
      const response = await budgetAPI.get();
      setBudget(response.data || response);
    } catch (err) {
      console.error('Error fetching budget:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchBudget();
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBudget();
  }, []);

  const handleSaveBudget = async () => {
    if (!formData.monthlyIncome) {
      Alert.alert('Error', 'Please enter your monthly income');
      return;
    }

    try {
      const data = {
        monthly_income: parseFloat(formData.monthlyIncome),
        monthly_expenses: parseFloat(formData.monthlyExpenses) || 0,
        savings_goal: parseFloat(formData.savingsGoal) || 0,
      };
      
      await budgetAPI.create(data);
      setShowForm(false);
      fetchBudget();
      Alert.alert('Success', 'Budget saved successfully!');
    } catch (err) {
      console.error('Error saving budget:', err);
      Alert.alert('Error', 'Failed to save budget');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const availableForDebt = (budget?.monthly_income || 0) - (budget?.monthly_expenses || 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
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
          <Text style={styles.title}>💰 Budget Planner</Text>
          <Text style={styles.subtitle}>
            Set up your budget to create a personalized debt payoff plan
          </Text>
        </View>

        {/* Budget Snapshot */}
        {budget && budget.monthly_income ? (
          <View style={styles.snapshotContainer}>
            <View style={styles.snapshotRow}>
              <View style={styles.snapshotItem}>
                <Text style={styles.snapshotLabel}>📈 Monthly Income</Text>
                <Text style={styles.snapshotValue}>{formatCurrency(budget.monthly_income)}</Text>
              </View>
              <View style={styles.snapshotItem}>
                <Text style={styles.snapshotLabel}>📉 Monthly Expenses</Text>
                <Text style={styles.snapshotValue}>{formatCurrency(budget.monthly_expenses)}</Text>
              </View>
            </View>
            <View style={styles.snapshotDivider} />
            <View style={styles.availableRow}>
              <Text style={styles.availableLabel}>💵 Available for Debt</Text>
              <Text style={[styles.availableValue, availableForDebt < 0 && styles.negative]}>
                {formatCurrency(availableForDebt)}
              </Text>
            </View>
            <TouchableOpacity style={styles.editButton} onPress={() => setShowForm(true)}>
              <Text style={styles.editButtonText}>Edit Budget</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noBudgetContainer}>
            <Text style={styles.noBudgetIcon}>💰</Text>
            <Text style={styles.noBudgetTitle}>No Budget Set Up Yet</Text>
            <Text style={styles.noBudgetText}>
              Create your budget to start planning your debt payoff strategy
            </Text>
            <TouchableOpacity style={styles.createButton} onPress={() => setShowForm(true)}>
              <Text style={styles.createButtonText}>Create Budget</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Budget Form */}
        {showForm && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Set Up Your Budget</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Income (after tax)</Text>
              <TextInput
                style={styles.input}
                value={formData.monthlyIncome}
                onChangeText={(text) => setFormData({ ...formData, monthlyIncome: text })}
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Expenses</Text>
              <TextInput
                style={styles.input}
                value={formData.monthlyExpenses}
                onChangeText={(text) => setFormData({ ...formData, monthlyExpenses: text })}
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Savings Goal</Text>
              <TextInput
                style={styles.input}
                value={formData.savingsGoal}
                onChangeText={(text) => setFormData({ ...formData, savingsGoal: text })}
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
                <Text style={styles.saveButtonText}>Save Budget</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Education Section */}
        <View style={styles.educationSection}>
          <Text style={styles.educationTitle}>💡 How Your Budget Affects Your Credit Score</Text>
          
          {EDUCATION_ITEMS.map((item, index) => (
            <View key={index} style={styles.educationCard}>
              <Text style={styles.educationIcon}>{item.icon}</Text>
              <View style={styles.educationContent}>
                <Text style={styles.educationItemTitle}>{item.title}</Text>
                <Text style={styles.educationDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Debt Payment Plans */}
        <View style={styles.plansSection}>
          <View style={styles.plansHeader}>
            <Text style={styles.plansTitle}>📋 Debt Payment Plans</Text>
            <TouchableOpacity style={styles.addPlanButton}>
              <Text style={styles.addPlanButtonText}>+ Create Plan</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.noPlansContainer}>
            <Text style={styles.noPlansText}>
              No Payment Plans Yet{'\n'}
              Create your first debt payment plan to get started
            </Text>
          </View>
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
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  snapshotContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  snapshotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  snapshotItem: {
    flex: 1,
  },
  snapshotLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  snapshotDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  availableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availableLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  availableValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  negative: {
    color: COLORS.danger,
  },
  editButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  editButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  noBudgetContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noBudgetIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noBudgetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  noBudgetText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: COLORS.purple,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 16,
  },
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  educationSection: {
    marginBottom: 24,
  },
  educationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  educationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  educationIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  educationContent: {
    flex: 1,
  },
  educationItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  educationDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  plansSection: {
    marginBottom: 24,
  },
  plansHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  plansTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  addPlanButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addPlanButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 13,
  },
  noPlansContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noPlansText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default BudgetScreen;