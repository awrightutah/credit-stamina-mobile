import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { budgetAPI, billsAPI, aiAPI, pointsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  staminaBlue:  '#1E40AF',
  powerPurple:  '#7C3AED',
  primary:      '#1E40AF',
  growthGreen:  '#059669',
  alertAmber:   '#F97316',
  errorRed:     '#DC2626',
  background:   '#0F172A',
  card:         '#1E293B',
  surface:      '#1E293B',
  text:         '#F1F5F9',
  textSecondary:'#64748B',
  border:       '#374151',
  danger:       '#DC2626',
  warning:      '#F97316',
  success:      '#059669',
  purple:       '#7C3AED',
};

// ─── Bill Categories ──────────────────────────────────────────────────────────
const BILL_CATEGORIES = [
  { key: 'housing',       label: 'Housing',        icon: '🏠' },
  { key: 'utilities',     label: 'Utilities',       icon: '⚡' },
  { key: 'phone',         label: 'Phone/Internet',  icon: '📱' },
  { key: 'transport',     label: 'Transportation',  icon: '🚗' },
  { key: 'subscriptions', label: 'Subscriptions',   icon: '🎬' },
  { key: 'insurance',     label: 'Insurance',       icon: '🛡️' },
  { key: 'debt',          label: 'Debt Payment',    icon: '💳' },
  { key: 'food',          label: 'Food/Groceries',  icon: '🛒' },
  { key: 'health',        label: 'Health',          icon: '💊' },
  { key: 'other',         label: 'Other',           icon: '📦' },
];

const getCategoryMeta = (key) =>
  BILL_CATEGORIES.find(c => c.key === key) ?? { label: key, icon: '📦' };

// ─── Debt Strategies ──────────────────────────────────────────────────────────
const STRATEGIES = [
  { key: 'avalanche',       label: '🧊 Avalanche',    subtitle: 'Highest interest first',   description: 'Pay minimums on all debts, then attack the highest-interest balance. Saves the most money over time.' },
  { key: 'snowball',        label: '⛄ Snowball',      subtitle: 'Lowest balance first',      description: 'Pay minimums everywhere, then knock out the smallest balance first. Builds momentum and motivation.' },
  { key: 'hybrid',          label: '⚡ Hybrid',        subtitle: 'Balances wins + savings',   description: 'Mix snowball and avalanche — knock out small wins first, then shift to the highest-interest accounts.' },
  { key: 'lowest_payment',  label: '💧 Minimum Only', subtitle: 'Minimum payments only',     description: 'Pay only minimums while building savings or waiting for disputes to resolve. Use sparingly.' },
];

const EDUCATION_ITEMS = [
  { icon: '💳', title: 'Credit Utilization (30% of score)',  description: 'Paying down credit card balances reduces your utilization ratio — one of the fastest ways to boost your score. Keeping utilization under 30% is the goal.' },
  { icon: '📅', title: 'On-Time Payments (35% of score)',    description: 'Budgeting ensures you always have money for minimum payments. Even one late payment can drop your score 50-100 points. Your budget is your safety net.' },
  { icon: '🏦', title: 'Debt-to-Income Ratio',              description: 'While not part of your credit score directly, lenders check this ratio when you apply for a mortgage or loan. Reducing monthly debt payments improves approval odds.' },
  { icon: '💸', title: 'Paying Collections',                description: 'If you have collection accounts in your disputes, budgeting a "pay-for-delete" amount can remove negative items entirely — especially effective for older debts.' },
];

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const EMPTY_BILL_FORM = { name: '', amount: '', due_day: '', category: 'other' };

// ─── Main Screen ──────────────────────────────────────────────────────────────
const BudgetScreen = () => {
  const { user } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [budget, setBudget]         = useState(null);
  const [plans, setPlans]           = useState([]);
  const [bills, setBills]           = useState([]);
  const [billsError, setBillsError] = useState(false);

  // Budget form
  const [showForm, setShowForm]         = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('avalanche');
  const [formData, setFormData]         = useState({ monthlyIncome: '', monthlyExpenses: '', savingsGoal: '' });

  // Bill modal
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill]     = useState(null);
  const [billForm, setBillForm]           = useState(EMPTY_BILL_FORM);
  const [savingBill, setSavingBill]       = useState(false);

  // Payment plan modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan]     = useState(null);
  const [planForm, setPlanForm]           = useState({ name: '', strategy: 'avalanche', targetAmount: '', monthlyPayment: '' });
  const [savingPlan, setSavingPlan]       = useState(false);

  // AI advice
  const [aiAdvice, setAiAdvice]       = useState('');
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState('');
  const aiRequestedRef = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────────
  const totalBills       = bills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
  const monthlyIncome    = budget?.monthly_income    || 0;
  // Expenses = max of saved expenses or auto-calculated bills total
  const monthlyExpenses  = Math.max(budget?.monthly_expenses || 0, totalBills);
  const availableForDebt = monthlyIncome - monthlyExpenses;
  const savingsGoal      = budget?.savings_goal || 0;

  // ── Data loading ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setBillsError(false);
      const [budgetRes, plansRes, billsRes] = await Promise.all([
        budgetAPI.get().catch(() => ({ data: null })),
        budgetAPI.getPaymentPlans().catch(() => ({ data: [] })),
        billsAPI.getAll().catch(() => null),
      ]);
      const b = budgetRes?.data ?? budgetRes;
      setBudget(b?.monthly_income ? b : null);
      setPlans(Array.isArray(plansRes?.data ?? plansRes) ? (plansRes?.data ?? plansRes) : []);

      if (billsRes === null) {
        setBillsError(true);
        setBills([]);
      } else {
        setBills(Array.isArray(billsRes?.data) ? billsRes.data : []);
      }
    } catch (err) {
      console.error('[Budget] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── Budget save ───────────────────────────────────────────────────────────
  const handleSaveBudget = async () => {
    if (!formData.monthlyIncome) { Alert.alert('Required', 'Please enter your monthly income'); return; }
    try {
      const data = {
        monthly_income:   parseFloat(formData.monthlyIncome)   || 0,
        monthly_expenses: parseFloat(formData.monthlyExpenses) || totalBills,
        savings_goal:     parseFloat(formData.savingsGoal)     || 0,
        strategy:         selectedStrategy,
      };
      await budgetAPI.create(data);
      setShowForm(false);
      fetchData();
      Alert.alert('Budget Saved', 'Your budget has been updated.');
    } catch (err) {
      Alert.alert('Error', 'Failed to save budget');
    }
  };

  // ── Bill CRUD ─────────────────────────────────────────────────────────────
  const openAddBill = () => {
    setEditingBill(null);
    setBillForm(EMPTY_BILL_FORM);
    setShowBillModal(true);
  };

  const openEditBill = (bill) => {
    setEditingBill(bill);
    setBillForm({
      name:     bill.name     || '',
      amount:   String(bill.amount || ''),
      due_day:  String(bill.due_day || ''),
      category: bill.category || 'other',
    });
    setShowBillModal(true);
  };

  const handleSaveBill = async () => {
    if (!billForm.name.trim()) { Alert.alert('Required', 'Enter a bill name'); return; }
    if (!billForm.amount || isNaN(parseFloat(billForm.amount))) { Alert.alert('Required', 'Enter a valid amount'); return; }

    setSavingBill(true);
    try {
      const payload = {
        name:     billForm.name.trim(),
        amount:   parseFloat(billForm.amount),
        due_day:  parseInt(billForm.due_day, 10) || null,
        category: billForm.category,
      };
      if (editingBill) {
        await billsAPI.update(editingBill.id, payload);
        setBills(prev => prev.map(b => b.id === editingBill.id ? { ...b, ...payload } : b));
      } else {
        const res = await billsAPI.create(payload);
        setBills(prev => [...prev, res.data]);
        // Award points for adding a bill (non-blocking)
        pointsAPI.award('add_bill', `Added bill: ${payload.name}`, 10).catch(() => null);
      }
      setShowBillModal(false);
      setEditingBill(null);

      // Auto-update budget monthly_expenses to reflect new bills total
      if (budget) {
        const newTotal = bills.reduce((s, b) => s + (b.id === editingBill?.id ? 0 : parseFloat(b.amount) || 0), 0)
          + parseFloat(billForm.amount);
        await budgetAPI.update({ ...budget, monthly_expenses: newTotal }).catch(() => null);
      }
    } catch (err) {
      Alert.alert('Error', editingBill ? 'Failed to update bill' : 'Failed to add bill. Make sure your account is set up.');
    } finally {
      setSavingBill(false);
    }
  };

  const handleDeleteBill = (bill) => {
    Alert.alert('Delete Bill', `Remove "${bill.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await billsAPI.delete(bill.id);
            setBills(prev => prev.filter(b => b.id !== bill.id));
          } catch {
            Alert.alert('Error', 'Failed to delete bill');
          }
        },
      },
    ]);
  };

  // ── Payment plans ─────────────────────────────────────────────────────────
  const handleCreatePlan = async () => {
    if (!planForm.name.trim()) { Alert.alert('Error', 'Give your plan a name'); return; }
    setSavingPlan(true);
    try {
      const payload = {
        name:            planForm.name.trim(),
        strategy:        planForm.strategy,
        target_amount:   parseFloat(planForm.targetAmount)   || 0,
        monthly_payment: parseFloat(planForm.monthlyPayment) || 0,
      };
      if (editingPlan) {
        await budgetAPI.updatePaymentPlan(editingPlan.id, payload);
        setPlans(prev => prev.map(p => p.id === editingPlan.id ? { ...p, ...payload } : p));
        Alert.alert('Plan Updated', 'Your payment plan has been saved.');
      } else {
        await budgetAPI.createPaymentPlan(payload);
        fetchData();
        Alert.alert('Plan Created', 'Your debt payment plan has been saved.');
      }
      setShowPlanModal(false);
      setEditingPlan(null);
      setPlanForm({ name: '', strategy: 'avalanche', targetAmount: '', monthlyPayment: '' });
    } catch {
      Alert.alert('Error', editingPlan ? 'Failed to update plan' : 'Failed to create plan');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name:           plan.name || '',
      strategy:       plan.strategy || 'avalanche',
      targetAmount:   String(plan.target_amount || ''),
      monthlyPayment: String(plan.monthly_payment || ''),
    });
    setShowPlanModal(true);
  };

  const handleDeletePlan = (plan) => {
    Alert.alert('Delete Plan', `Remove "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await budgetAPI.deletePaymentPlan(plan.id);
            setPlans(prev => prev.filter(p => p.id !== plan.id));
          } catch { Alert.alert('Error', 'Failed to delete plan.'); }
        },
      },
    ]);
  };

  // ── AI Budget Advice ──────────────────────────────────────────────────────
  const getAiAdvice = async () => {
    if (aiLoading) return;
    if (!monthlyIncome) {
      Alert.alert('Set Up Budget First', 'Please add your monthly income before getting AI advice.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiAdvice('');

    try {
      const billsList = bills.length > 0
        ? bills.map(b => `• ${b.name} (${getCategoryMeta(b.category).label}): ${formatCurrency(b.amount)}/mo${b.due_day ? `, due the ${b.due_day}${b.due_day === 1 ? 'st' : b.due_day === 2 ? 'nd' : b.due_day === 3 ? 'rd' : 'th'}` : ''}`).join('\n')
        : 'No bills entered yet.';

      const debtPlans = plans.length > 0
        ? plans.map(p => `• ${p.name}: ${formatCurrency(p.monthly_payment)}/mo toward ${formatCurrency(p.target_amount)} total (${p.strategy} strategy)`).join('\n')
        : 'No debt payment plans set.';

      const message = `I need personalized budget and credit improvement advice based on my financial situation:

INCOME & BUDGET:
• Monthly income (after tax): ${formatCurrency(monthlyIncome)}
• Total monthly bills: ${formatCurrency(totalBills)}
• Additional expenses: ${formatCurrency(Math.max(0, (budget?.monthly_expenses || 0) - totalBills))}
• Total monthly expenses: ${formatCurrency(monthlyExpenses)}
• Available for debt/savings: ${formatCurrency(availableForDebt)}
• Monthly savings goal: ${formatCurrency(savingsGoal)}
• Debt payoff strategy: ${STRATEGIES.find(s => s.key === budget?.strategy)?.label || 'Not set'}

MY MONTHLY BILLS:
${billsList}

DEBT PAYMENT PLANS:
${debtPlans}

Please give me:
1. A specific recommendation on how to allocate my ${formatCurrency(availableForDebt)} available monthly
2. Which bills should I prioritize paying down or reducing first to help my credit score
3. Based on my income and bills, what is a realistic debt payoff timeline
4. Any red flags you see (like bills being too high relative to income)
5. Two or three specific action steps I can take this month

Keep advice practical and specific to my numbers.`;

      const res = await aiAPI.ask(message);
      const text = res?.data?.response ?? res?.data?.message ?? res?.data ?? '';
      setAiAdvice(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) {
      setAiError('Could not get AI advice. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>💰 Budget Planner</Text>
          <Text style={styles.subtitle}>Track bills, income, and get AI-powered advice</Text>
        </View>

        {/* ── Budget Overview ── */}
        {budget ? (
          <View style={styles.snapshotCard}>
            <View style={styles.snapshotGrid}>
              <View style={styles.snapshotItem}>
                <Text style={styles.snapshotLabel}>📈 Monthly Income</Text>
                <Text style={[styles.snapshotValue, { color: COLORS.success }]}>{formatCurrency(monthlyIncome)}</Text>
              </View>
              <View style={styles.snapshotItem}>
                <Text style={styles.snapshotLabel}>📉 Total Expenses</Text>
                <Text style={[styles.snapshotValue, { color: COLORS.danger }]}>{formatCurrency(monthlyExpenses)}</Text>
              </View>
            </View>
            <View style={styles.snapshotDivider} />
            <View style={styles.availableRow}>
              <Text style={styles.availableLabel}>💵 Available for Debt/Savings</Text>
              <Text style={[styles.availableValue, availableForDebt < 0 && styles.negative]}>
                {formatCurrency(availableForDebt)}
              </Text>
            </View>
            {/* DTI bar */}
            {monthlyIncome > 0 && (
              <View style={{ marginTop: 12 }}>
                <View style={styles.dtiRow}>
                  <Text style={styles.dtiLabel}>Debt-to-Income Ratio</Text>
                  <Text style={[styles.dtiPct, {
                    color: monthlyExpenses / monthlyIncome > 0.5 ? COLORS.danger
                      : monthlyExpenses / monthlyIncome > 0.36 ? COLORS.warning
                      : COLORS.success,
                  }]}>
                    {Math.round((monthlyExpenses / monthlyIncome) * 100)}%
                  </Text>
                </View>
                <View style={styles.dtiTrack}>
                  <View style={[styles.dtiFill, {
                    width: `${Math.min(100, (monthlyExpenses / monthlyIncome) * 100)}%`,
                    backgroundColor: monthlyExpenses / monthlyIncome > 0.5 ? COLORS.danger
                      : monthlyExpenses / monthlyIncome > 0.36 ? COLORS.warning
                      : COLORS.success,
                  }]} />
                  {/* Target line at 36% */}
                  <View style={[styles.dtiTargetLine, { left: '36%' }]} />
                </View>
                <Text style={styles.dtiHint}>Lenders prefer under 36%</Text>
              </View>
            )}
            {budget.strategy && (
              <View style={styles.strategyBadge}>
                <Text style={styles.strategyBadgeText}>
                  {STRATEGIES.find(s => s.key === budget.strategy)?.label || budget.strategy}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.editButton} onPress={() => {
              setFormData({
                monthlyIncome:   String(budget.monthly_income   || ''),
                monthlyExpenses: String(budget.monthly_expenses || ''),
                savingsGoal:     String(budget.savings_goal     || ''),
              });
              setSelectedStrategy(budget.strategy || 'avalanche');
              setShowForm(true);
            }}>
              <Text style={styles.editButtonText}>Edit Budget</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noBudgetCard}>
            <Text style={styles.noBudgetIcon}>💰</Text>
            <Text style={styles.noBudgetTitle}>Set Up Your Budget</Text>
            <Text style={styles.noBudgetText}>Enter your income and choose a strategy to get started</Text>
            <TouchableOpacity style={styles.createButton} onPress={() => setShowForm(true)}>
              <Text style={styles.createButtonText}>Create Budget</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Budget Form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Set Up Your Budget</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Income (after tax)</Text>
              <TextInput style={styles.input} value={formData.monthlyIncome} onChangeText={t => setFormData({ ...formData, monthlyIncome: t })} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Expenses (or leave blank — auto-calculated from bills)</Text>
              <TextInput style={styles.input} value={formData.monthlyExpenses} onChangeText={t => setFormData({ ...formData, monthlyExpenses: t })} placeholder={`${totalBills.toFixed(2)} (from bills)`} placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Savings Goal</Text>
              <TextInput style={styles.input} value={formData.savingsGoal} onChangeText={t => setFormData({ ...formData, savingsGoal: t })} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
            </View>
            <Text style={[styles.inputLabel, { marginTop: 8 }]}>Debt Payoff Strategy</Text>
            {STRATEGIES.map(s => (
              <TouchableOpacity key={s.key} style={[styles.strategyCard, selectedStrategy === s.key && styles.strategyCardActive]} onPress={() => setSelectedStrategy(s.key)} activeOpacity={0.7}>
                <View style={styles.strategyCardHeader}>
                  <Text style={[styles.strategyLabel, selectedStrategy === s.key && { color: COLORS.purple }]}>{s.label}</Text>
                  <Text style={styles.strategySubtitle}>{s.subtitle}</Text>
                </View>
                <Text style={styles.strategyDesc}>{s.description}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}><Text style={styles.saveButtonText}>Save Budget</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── BILLS SECTION ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🧾 Monthly Bills</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAddBill}>
            <Text style={styles.addBtnText}>+ Add Bill</Text>
          </TouchableOpacity>
        </View>

        {billsError ? (
          <View style={styles.billsErrorCard}>
            <Text style={styles.billsErrorIcon}>⚠️</Text>
            <Text style={styles.billsErrorTitle}>Bills tracking unavailable</Text>
            <Text style={styles.billsErrorText}>
              We're having trouble loading your bills right now. Please try again in a few minutes, or contact support if this keeps happening.
            </Text>
          </View>
        ) : bills.length === 0 ? (
          <View style={styles.emptyBillsCard}>
            <Text style={styles.emptyBillsIcon}>🧾</Text>
            <Text style={styles.emptyBillsText}>No bills added yet.{'\n'}Add your recurring bills to see your full expense picture.</Text>
          </View>
        ) : (
          <View style={styles.billsCard}>
            {bills.map((bill, i) => {
              const cat = getCategoryMeta(bill.category);
              return (
                <View key={bill.id} style={[styles.billRow, i < bills.length - 1 && styles.billRowBorder]}>
                  <View style={styles.billIcon}>
                    <Text style={styles.billIconText}>{cat.icon}</Text>
                  </View>
                  <View style={styles.billInfo}>
                    <Text style={styles.billName}>{bill.name}</Text>
                    <Text style={styles.billMeta}>
                      {cat.label}{bill.due_day ? ` · Due the ${bill.due_day}${bill.due_day === 1 ? 'st' : bill.due_day === 2 ? 'nd' : bill.due_day === 3 ? 'rd' : 'th'}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.billAmount}>{formatCurrency(bill.amount)}</Text>
                  <TouchableOpacity style={styles.billEditBtn} onPress={() => openEditBill(bill)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.billEditBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.billDeleteBtn} onPress={() => handleDeleteBill(bill)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.billDeleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {/* Bills total */}
            <View style={styles.billsTotalRow}>
              <Text style={styles.billsTotalLabel}>Total Monthly Bills</Text>
              <Text style={styles.billsTotalValue}>{formatCurrency(totalBills)}</Text>
            </View>
          </View>
        )}

        {/* ── AI BUDGET ADVISOR ── */}
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <View>
              <Text style={styles.aiTitle}>🤖 AI Budget Advisor</Text>
              <Text style={styles.aiSubtitle}>Personalized advice based on your income and bills</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.aiBtn, aiLoading && styles.aiBtnLoading]}
            onPress={getAiAdvice}
            disabled={aiLoading}
            activeOpacity={0.85}
          >
            {aiLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.aiBtnText}>
                  {aiAdvice ? '↺ Refresh Advice' : 'Get AI Budget Advice'}
                </Text>
            }
          </TouchableOpacity>

          {aiLoading && (
            <Text style={styles.aiLoadingText}>Analyzing your income, bills, and debt plans…</Text>
          )}

          {!!aiError && (
            <Text style={styles.aiErrorText}>{aiError}</Text>
          )}

          {!!aiAdvice && !aiLoading && (
            <View style={styles.aiResponseCard}>
              <Text style={styles.aiResponseText}>{aiAdvice}</Text>
            </View>
          )}

          {!aiAdvice && !aiLoading && !aiError && (
            <View style={styles.aiPreviewCard}>
              <Text style={styles.aiPreviewText}>
                The AI will analyze your{monthlyIncome > 0 ? ` ${formatCurrency(monthlyIncome)} income,` : ''} {bills.length > 0 ? `${bills.length} bill${bills.length > 1 ? 's' : ''} (${formatCurrency(totalBills)}/mo),` : ''} debt plans, and strategy to give you a personalized payoff roadmap.
              </Text>
            </View>
          )}
        </View>

        {/* ── Debt Payment Plans ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 Debt Payment Plans</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowPlanModal(true)}>
            <Text style={styles.addBtnText}>+ Create Plan</Text>
          </TouchableOpacity>
        </View>

        {plans.length === 0 ? (
          <View style={styles.emptyBillsCard}>
            <Text style={styles.emptyBillsText}>No payment plans yet.{'\n'}Create one to track your debt payoff progress.</Text>
          </View>
        ) : (
          plans.map(plan => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planCardHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planStrategy}>{STRATEGIES.find(s => s.key === plan.strategy)?.label || plan.strategy}</Text>
              </View>
              <View style={styles.planDetails}>
                {plan.target_amount > 0 && <Text style={styles.planDetail}>Target: {formatCurrency(plan.target_amount)}</Text>}
                {plan.monthly_payment > 0 && <Text style={styles.planDetail}>Monthly: {formatCurrency(plan.monthly_payment)}</Text>}
              </View>
              <View style={styles.planActions}>
                <TouchableOpacity style={styles.planEditBtn} onPress={() => handleEditPlan(plan)}><Text style={styles.planEditBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={styles.planDeleteBtn} onPress={() => handleDeletePlan(plan)}><Text style={styles.planDeleteBtnText}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* ── Education ── */}
        <View style={styles.educationSection}>
          <Text style={styles.educationTitle}>💡 How Your Budget Affects Your Credit Score</Text>
          {EDUCATION_ITEMS.map((item, i) => (
            <View key={i} style={styles.educationCard}>
              <Text style={styles.educationIcon}>{item.icon}</Text>
              <View style={styles.educationContent}>
                <Text style={styles.educationItemTitle}>{item.title}</Text>
                <Text style={styles.educationDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Add/Edit Bill Modal ── */}
      <Modal animationType="slide" transparent visible={showBillModal} onRequestClose={() => setShowBillModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.handleBar} />
            <Text style={styles.modalTitle}>{editingBill ? 'Edit Bill' : 'Add Bill'}</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bill Name *</Text>
                <TextInput style={styles.input} value={billForm.name} onChangeText={t => setBillForm({ ...billForm, name: t })} placeholder="e.g. Rent, Netflix, Car Payment" placeholderTextColor={COLORS.textSecondary} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Monthly Amount *</Text>
                <TextInput style={styles.input} value={billForm.amount} onChangeText={t => setBillForm({ ...billForm, amount: t })} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Due Day of Month (1–31, optional)</Text>
                <TextInput style={styles.input} value={billForm.due_day} onChangeText={t => setBillForm({ ...billForm, due_day: t.replace(/\D/g, '') })} placeholder="e.g. 15" placeholderTextColor={COLORS.textSecondary} keyboardType="number-pad" maxLength={2} />
              </View>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {BILL_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.categoryChip, billForm.category === cat.key && styles.categoryChipActive]}
                    onPress={() => setBillForm({ ...billForm, category: cat.key })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                    <Text style={[styles.categoryChipLabel, billForm.category === cat.key && { color: COLORS.purple }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowBillModal(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, savingBill && { opacity: 0.6 }]} onPress={handleSaveBill} disabled={savingBill}>
                  <Text style={styles.saveButtonText}>{savingBill ? 'Saving...' : editingBill ? 'Update' : 'Add Bill'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Payment Plan Modal ── */}
      <Modal animationType="slide" transparent visible={showPlanModal} onRequestClose={() => { setShowPlanModal(false); setEditingPlan(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.handleBar} />
            <Text style={styles.modalTitle}>{editingPlan ? 'Edit Payment Plan' : 'Create Payment Plan'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plan Name *</Text>
                <TextInput style={styles.input} value={planForm.name} onChangeText={t => setPlanForm({ ...planForm, name: t })} placeholder="e.g. Credit Card Payoff 2025" placeholderTextColor={COLORS.textSecondary} />
              </View>
              <Text style={styles.inputLabel}>Strategy</Text>
              {STRATEGIES.map(s => (
                <TouchableOpacity key={s.key} style={[styles.strategyCard, planForm.strategy === s.key && styles.strategyCardActive]} onPress={() => setPlanForm({ ...planForm, strategy: s.key })} activeOpacity={0.7}>
                  <Text style={[styles.strategyLabel, planForm.strategy === s.key && { color: COLORS.purple }]}>{s.label} — {s.subtitle}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Total Debt Target ($)</Text>
                <TextInput style={styles.input} value={planForm.targetAmount} onChangeText={t => setPlanForm({ ...planForm, targetAmount: t })} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Monthly Payment ($)</Text>
                <TextInput style={styles.input} value={planForm.monthlyPayment} onChangeText={t => setPlanForm({ ...planForm, monthlyPayment: t })} placeholder="0.00" placeholderTextColor={COLORS.textSecondary} keyboardType="decimal-pad" />
              </View>
              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowPlanModal(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, savingPlan && { opacity: 0.6 }]} onPress={handleCreatePlan} disabled={savingPlan}>
                  <Text style={styles.saveButtonText}>{savingPlan ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.background },
  scrollView:       { flex: 1 },
  scrollContent:    { padding: 20, paddingBottom: 48 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:   { marginBottom: 20 },
  title:    { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },

  // Budget snapshot card
  snapshotCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  snapshotGrid:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  snapshotItem:    { flex: 1 },
  snapshotLabel:   { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  snapshotValue:   { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  snapshotDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  availableRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  availableLabel:  { fontSize: 14, fontWeight: '600', color: COLORS.text },
  availableValue:  { fontSize: 22, fontWeight: 'bold', color: COLORS.success },
  negative:        { color: COLORS.danger },

  // DTI bar
  dtiRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, marginTop: 4 },
  dtiLabel:      { fontSize: 12, color: COLORS.textSecondary },
  dtiPct:        { fontSize: 12, fontWeight: '700' },
  dtiTrack:      { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', position: 'relative' },
  dtiFill:       { height: '100%', borderRadius: 3 },
  dtiTargetLine: { position: 'absolute', top: -1, bottom: -1, width: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  dtiHint:       { fontSize: 10, color: COLORS.textSecondary, marginTop: 4, textAlign: 'right' },

  strategyBadge: { marginTop: 12, backgroundColor: COLORS.purple + '20', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  strategyBadgeText: { fontSize: 13, color: COLORS.purple, fontWeight: '600' },
  editButton:    { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 14 },
  editButtonText:{ color: COLORS.text, fontWeight: '600' },

  noBudgetCard:  { backgroundColor: COLORS.card, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  noBudgetIcon:  { fontSize: 44, marginBottom: 14 },
  noBudgetTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  noBudgetText:  { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
  createButton:  { backgroundColor: COLORS.purple, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8 },
  createButtonText: { color: COLORS.text, fontWeight: '600', fontSize: 16 },

  // Form
  formCard:   { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  formTitle:  { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 7, fontWeight: '500' },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formButtons:      { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelButton:     { flex: 1, backgroundColor: COLORS.border, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  cancelButtonText: { color: COLORS.text, fontWeight: '600' },
  saveButton:       { flex: 1, backgroundColor: COLORS.success, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  saveButtonText:   { color: COLORS.text, fontWeight: '600' },

  strategyCard:       { backgroundColor: COLORS.background, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  strategyCardActive: { borderColor: COLORS.purple, backgroundColor: COLORS.purple + '12' },
  strategyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  strategyLabel:      { fontSize: 15, fontWeight: '600', color: COLORS.text },
  strategySubtitle:   { fontSize: 12, color: COLORS.textSecondary },
  strategyDesc:       { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },

  // Section headers
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionTitle:  { fontSize: 16, fontWeight: '600', color: COLORS.text },
  addBtn:        { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addBtnText:    { color: COLORS.text, fontWeight: '600', fontSize: 13 },

  // Bills card
  billsCard:      { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 20 },
  billRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  billRowBorder:  { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  billIcon:       { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  billIconText:   { fontSize: 18 },
  billInfo:       { flex: 1 },
  billName:       { fontSize: 14, fontWeight: '600', color: COLORS.text },
  billMeta:       { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  billAmount:     { fontSize: 15, fontWeight: '700', color: COLORS.text, marginRight: 6 },
  billEditBtn:    { padding: 4 },
  billEditBtnText:{ fontSize: 14 },
  billDeleteBtn:  { padding: 4 },
  billDeleteBtnText: { fontSize: 14, color: COLORS.danger, fontWeight: '700' },
  billsTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
  billsTotalLabel:{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  billsTotalValue:{ fontSize: 17, fontWeight: '800', color: COLORS.text },

  emptyBillsCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  emptyBillsIcon: { fontSize: 36, marginBottom: 10 },
  emptyBillsText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  billsErrorCard:  { backgroundColor: COLORS.warning + '10', borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: COLORS.warning + '40' },
  billsErrorIcon:  { fontSize: 28, marginBottom: 8 },
  billsErrorTitle: { fontSize: 15, fontWeight: '700', color: COLORS.warning, marginBottom: 6 },
  billsErrorText:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  // Category grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 16 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  categoryChipActive: { borderColor: COLORS.purple, backgroundColor: COLORS.purple + '15' },
  categoryChipIcon:   { fontSize: 14 },
  categoryChipLabel:  { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },

  // AI section
  aiSection:       { backgroundColor: COLORS.card, borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: COLORS.purple + '40' },
  aiHeader:        { marginBottom: 14 },
  aiTitle:         { fontSize: 16, fontWeight: '700', color: COLORS.text },
  aiSubtitle:      { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  aiBtn:           { backgroundColor: COLORS.purple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  aiBtnLoading:    { opacity: 0.7 },
  aiBtnText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
  aiLoadingText:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
  aiErrorText:     { fontSize: 13, color: COLORS.danger, textAlign: 'center', marginTop: 10 },
  aiResponseCard:  { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: COLORS.border },
  aiResponseText:  { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  aiPreviewCard:   { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.border + '80' },
  aiPreviewText:   { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  // Plans
  planCard:       { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  planCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planName:       { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  planStrategy:   { fontSize: 12, color: COLORS.purple, fontWeight: '500' },
  planDetails:    { flexDirection: 'row', gap: 16 },
  planDetail:     { fontSize: 13, color: COLORS.textSecondary },
  planActions:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  planEditBtn:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  planEditBtnText:{ fontSize: 13, color: COLORS.text, fontWeight: '500' },
  planDeleteBtn:  { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: COLORS.danger + '15', borderWidth: 1, borderColor: COLORS.danger + '40' },
  planDeleteBtnText: { fontSize: 13, color: COLORS.danger, fontWeight: '500' },

  // Education
  educationSection:   { marginBottom: 24 },
  educationTitle:     { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 14 },
  educationCard:      { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  educationIcon:      { fontSize: 24, marginRight: 14 },
  educationContent:   { flex: 1 },
  educationItemTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 5 },
  educationDescription: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },

  // Modals
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent:  { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%', paddingBottom: 40 },
  handleBar:     { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
});

export default BudgetScreen;
