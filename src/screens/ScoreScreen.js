import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { scoresAPI } from '../services/api';
import COLORS from '../theme/colors';

const { width } = Dimensions.get('window');
const GAUGE_SIZE = Math.min(width - 80, 260);
const STROKE = 24;
const CHART_HEIGHT = 100;
const BUREAUS = ['TransUnion', 'Equifax', 'Experian'];
const GOAL_KEY = '@credit_stamina_score_goal';

// ─── FICO tier definitions ────────────────────────────────────────────────────
// Standard Experian/FICO tier boundaries
const TIERS = [
  { min: 800, label: 'Exceptional', color: '#059669' },
  { min: 740, label: 'Very Good',   color: '#22C55E' },
  { min: 670, label: 'Good',        color: '#84CC16' },
  { min: 580, label: 'Fair',        color: '#F97316' },
  { min: 300, label: 'Poor',        color: '#DC2626' },
];

const getScoreColor = (score) => {
  if (!score) return COLORS.textSecondary;
  for (const tier of TIERS) {
    if (score >= tier.min) return tier.color;
  }
  return '#DC2626';
};

const getScoreLabel = (score) => {
  if (!score) return '—';
  for (const tier of TIERS) {
    if (score >= tier.min) return tier.label;
  }
  return 'Poor';
};

// Returns { pts, label } for the next tier above current score, or null if Exceptional
const getNextTier = (score) => {
  if (!score) return null;
  const thresholds = [
    { threshold: 580, label: 'Fair' },
    { threshold: 670, label: 'Good' },
    { threshold: 740, label: 'Very Good' },
    { threshold: 800, label: 'Exceptional' },
  ];
  for (const t of thresholds) {
    if (score < t.threshold) {
      return { pts: t.threshold - score, label: t.label };
    }
  }
  return null; // already Exceptional
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Semicircle Gauge ─────────────────────────────────────────────────────────
const ScoreGauge = ({ score }) => {
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const angle = pct * 180; // 0° (300) → 180° (850)
  const color = getScoreColor(score);

  const leftDeg  = Math.min(0, angle - 90);
  const rightDeg = angle > 90 ? angle - 180 : -90;
  const showRight = angle > 90;
  const innerSize = GAUGE_SIZE - STROKE * 2;

  return (
    <View style={gaugeStyles.wrapper}>
      <View style={[gaugeStyles.arcClip, { width: GAUGE_SIZE, height: GAUGE_SIZE / 2 + STROKE / 2 }]}>
        {/* Gray track */}
        <View style={[gaugeStyles.ring, {
          width: GAUGE_SIZE, height: GAUGE_SIZE,
          borderRadius: GAUGE_SIZE / 2,
          borderWidth: STROKE,
          borderColor: '#1F2937',
        }]} />

        {/* Left fill */}
        {angle > 0 && (
          <View style={[gaugeStyles.halfClip, { left: 0, width: GAUGE_SIZE / 2 }]}>
            <View style={[gaugeStyles.ring, {
              left: 0,
              width: GAUGE_SIZE, height: GAUGE_SIZE,
              borderRadius: GAUGE_SIZE / 2,
              borderWidth: STROKE,
              borderColor: color,
              transform: [{ rotate: `${leftDeg}deg` }],
            }]} />
          </View>
        )}

        {/* Right fill */}
        {showRight && (
          <View style={[gaugeStyles.halfClip, { right: 0, width: GAUGE_SIZE / 2 }]}>
            <View style={[gaugeStyles.ring, {
              right: 0,
              width: GAUGE_SIZE, height: GAUGE_SIZE,
              borderRadius: GAUGE_SIZE / 2,
              borderWidth: STROKE,
              borderColor: color,
              transform: [{ rotate: `${rightDeg}deg` }],
            }]} />
          </View>
        )}

        {/* Inner cap */}
        <View style={[gaugeStyles.innerCap, {
          width: innerSize, height: innerSize,
          borderRadius: innerSize / 2,
          left: STROKE, top: STROKE,
        }]} />
      </View>

      {/* Score number + label */}
      <View style={gaugeStyles.scoreText}>
        <Text style={[gaugeStyles.scoreNumber, { color }]}>{score}</Text>
        <Text style={[gaugeStyles.scoreRating, { color }]}>{getScoreLabel(score)}</Text>
      </View>

      {/* 300 / 850 range labels */}
      <View style={[gaugeStyles.rangeLabels, { width: GAUGE_SIZE }]}>
        <Text style={gaugeStyles.rangeLabel}>300</Text>
        <Text style={gaugeStyles.rangeLabel}>850</Text>
      </View>
    </View>
  );
};

const gaugeStyles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  arcClip: { overflow: 'hidden', position: 'relative' },
  ring: { position: 'absolute', top: 0 },
  halfClip: { position: 'absolute', top: 0, height: GAUGE_SIZE, overflow: 'hidden' },
  innerCap: { position: 'absolute', backgroundColor: COLORS.card },
  scoreText: { alignItems: 'center', marginTop: 8 },
  scoreNumber: { fontSize: 64, fontWeight: 'bold', lineHeight: 72 },
  scoreRating: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: STROKE / 2,
    marginTop: 6,
  },
  rangeLabel: { fontSize: 11, color: COLORS.textSecondary },
});

// ─── Goal Progress Bar ────────────────────────────────────────────────────────
const GoalProgressBar = ({ baseline, current, goal, onEditGoal }) => {
  if (!current || !goal || goal <= baseline) return null;

  const pct = Math.min(100, Math.max(0,
    Math.round(((current - baseline) / (goal - baseline)) * 100)
  ));
  const ptsLeft = goal - current;
  const goalColor = getScoreColor(goal);

  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.headerRow}>
        <Text style={progressStyles.title}>Score Goal Progress</Text>
        <TouchableOpacity onPress={onEditGoal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={progressStyles.editBtn}>Edit Goal</Text>
        </TouchableOpacity>
      </View>

      {/* Milestone row */}
      <View style={progressStyles.milestones}>
        <View style={progressStyles.milestone}>
          <Text style={progressStyles.milestoneValue}>{baseline}</Text>
          <Text style={progressStyles.milestoneLabel}>Start</Text>
        </View>
        <View style={[progressStyles.milestone, progressStyles.milestoneCurrent]}>
          <Text style={[progressStyles.milestoneValue, { color: getScoreColor(current) }]}>{current}</Text>
          <Text style={progressStyles.milestoneLabel}>Now</Text>
        </View>
        <View style={progressStyles.milestone}>
          <Text style={[progressStyles.milestoneValue, { color: goalColor }]}>{goal}</Text>
          <Text style={progressStyles.milestoneLabel}>Goal</Text>
        </View>
      </View>

      {/* Progress track */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: `${pct}%`, backgroundColor: getScoreColor(current) }]} />
        {pct > 0 && pct < 100 && (
          <View style={[progressStyles.dot, { left: `${pct}%`, backgroundColor: getScoreColor(current) }]} />
        )}
      </View>

      {/* Pct + pts left */}
      <View style={progressStyles.footerRow}>
        <Text style={progressStyles.pctText}>{pct}% to goal</Text>
        {ptsLeft > 0 && (
          <Text style={progressStyles.ptsLeft}>{ptsLeft} pts to go</Text>
        )}
      </View>
    </View>
  );
};

const progressStyles = StyleSheet.create({
  container: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  editBtn: { fontSize: 13, color: COLORS.powerPurple, fontWeight: '600' },
  milestones: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  milestone: { alignItems: 'center' },
  milestoneCurrent: { flex: 1 },
  milestoneValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  milestoneLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  track: {
    height: 10,
    backgroundColor: '#1F2937',
    borderRadius: 5,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  dot: {
    position: 'absolute',
    top: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: COLORS.card,
    marginLeft: -8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pctText: { fontSize: 12, color: COLORS.textSecondary },
  ptsLeft: { fontSize: 12, color: COLORS.textSecondary },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
const ScoreScreen = () => {
  const { user } = useAuth();
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Log score modal
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [newBureau, setNewBureau] = useState('TransUnion');
  const [newScore, setNewScore] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Goal modal
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [scoreGoal, setScoreGoal] = useState(700);
  const [goalInput, setGoalInput] = useState('700');

  useEffect(() => {
    AsyncStorage.getItem(GOAL_KEY).then(val => {
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) {
          setScoreGoal(parsed);
          setGoalInput(String(parsed));
        }
      }
    });
  }, []);

  useEffect(() => {
    if (user?.id) fetchScores();
  }, [user?.id]);

  const fetchScores = async () => {
    try {
      setLoading(true);
      const response = await scoresAPI.getAll();
      const sorted = (response.data || []).sort(
        (a, b) =>
          new Date(b.recorded_date || b.reported_at) -
          new Date(a.recorded_date || a.reported_at)
      );
      setScores(sorted);
      setError(null);
    } catch (err) {
      setError('Failed to load scores');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAddScore = async () => {
    const scoreNum = parseInt(newScore, 10);
    if (!newScore || isNaN(scoreNum) || scoreNum < 300 || scoreNum > 850) {
      Alert.alert('Invalid Score', 'Please enter a score between 300 and 850.');
      return;
    }
    try {
      setSaving(true);
      await scoresAPI.add(newBureau, scoreNum, new Date().toISOString(), newNotes);
      setLogModalVisible(false);
      setNewScore('');
      setNewNotes('');
      await fetchScores();
    } catch (err) {
      Alert.alert('Error', 'Failed to save score. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGoal = async () => {
    const parsed = parseInt(goalInput, 10);
    if (isNaN(parsed) || parsed < 300 || parsed > 850) {
      Alert.alert('Invalid Goal', 'Enter a score between 300 and 850.');
      return;
    }
    await AsyncStorage.setItem(GOAL_KEY, String(parsed));
    setScoreGoal(parsed);
    setGoalModalVisible(false);
  };

  const openLogModal = () => {
    setNewBureau('TransUnion');
    setNewScore('');
    setNewNotes('');
    setLogModalVisible(true);
  };

  // Derived data
  const latestScore   = scores[0] ?? null;
  const chartScores   = [...scores].reverse(); // oldest → newest for chart
  const baselineScore = chartScores[0]?.score ?? null;
  const nextTier      = latestScore ? getNextTier(latestScore.score) : null;
  const barWidth      = Math.min(40, Math.max(24, (width - 64) / Math.max(chartScores.length, 1) - 10));

  const renderChart = () => {
    if (chartScores.length < 2) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score History</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
          {chartScores.map((s, i) => {
            const sc = s.score || 0;
            const barH = Math.max(6, ((sc - 300) / 550) * CHART_HEIGHT);
            const color = getScoreColor(sc);
            return (
              <View key={s.id ?? `score-${i}`} style={styles.barWrapper}>
                <Text style={[styles.barLabel, { color }]}>{sc}</Text>
                <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
                  <View style={[styles.bar, { height: barH, width: barWidth, backgroundColor: color }]} />
                </View>
                <Text style={styles.barDate}>{formatDate(s.recorded_date || s.reported_at)}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Credit Score</Text>
        <TouchableOpacity style={styles.logBtn} onPress={openLogModal}>
          <Text style={styles.logBtnText}>+ Log Score</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchScores(); }}
            tintColor={COLORS.powerPurple}
          />
        }
      >
        {loading ? (
          <View style={styles.centered}>
            <Text style={styles.mutedText}>Loading scores...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchScores}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !latestScore ? (
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No Scores Yet</Text>
            <Text style={styles.mutedText}>Tap "+ Log Score" to record your first score</Text>
            <TouchableOpacity style={[styles.logBtn, { marginTop: 20 }]} onPress={openLogModal}>
              <Text style={styles.logBtnText}>+ Log Score</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Main gauge card ── */}
            <View style={styles.gaugeCard}>

              {/* Bureau chip */}
              <View style={styles.bureauChip}>
                <Text style={styles.bureauChipText}>{latestScore.bureau ?? 'Bureau'}</Text>
              </View>

              {/* Semicircle gauge */}
              <ScoreGauge score={latestScore.score} />

              {/* "X pts to next tier" badge */}
              {nextTier && (
                <View style={[styles.nextTierBadge, { backgroundColor: getScoreColor(latestScore.score) + '22', borderColor: getScoreColor(latestScore.score) + '55' }]}>
                  <Text style={[styles.nextTierText, { color: getScoreColor(latestScore.score) }]}>
                    🎯 {nextTier.pts} pts to {nextTier.label}
                  </Text>
                </View>
              )}

              {/* Score Goal Progress */}
              <GoalProgressBar
                baseline={baselineScore ?? latestScore.score}
                current={latestScore.score}
                goal={scoreGoal}
                onEditGoal={() => {
                  setGoalInput(String(scoreGoal));
                  setGoalModalVisible(true);
                }}
              />

              {/* Date logged */}
              <Text style={styles.gaugeMeta}>
                Last updated · {formatDate(latestScore.recorded_date || latestScore.reported_at)}
              </Text>
            </View>

            {/* Score history chart */}
            {renderChart()}

            {/* FICO range legend */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Score Ranges</Text>
              {[
                { color: '#059669', label: '800 – 850: Exceptional' },
                { color: '#22C55E', label: '740 – 799: Very Good' },
                { color: '#84CC16', label: '670 – 739: Good' },
                { color: '#F97316', label: '580 – 669: Fair' },
                { color: '#DC2626', label: '300 – 579: Poor' },
              ].map(({ color, label }) => (
                <View key={label} style={styles.rangeRow}>
                  <View style={[styles.rangeDot, { backgroundColor: color }]} />
                  <Text style={styles.rangeText}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Log Score Modal ── */}
      <Modal
        visible={logModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Log Credit Score</Text>

            <Text style={styles.fieldLabel}>Bureau</Text>
            <View style={styles.bureauRow}>
              {BUREAUS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, newBureau === b && styles.chipActive]}
                  onPress={() => setNewBureau(b)}
                >
                  <Text style={[styles.chipText, newBureau === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Score (300 – 850)</Text>
            <TextInput
              style={styles.input}
              value={newScore}
              onChangeText={setNewScore}
              keyboardType="number-pad"
              placeholder="e.g. 720"
              placeholderTextColor={COLORS.textSecondary}
              maxLength={3}
            />

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="Any context..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setLogModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleAddScore}
                disabled={saving}
              >
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Set Goal Modal ── */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Set Score Goal</Text>
            <Text style={styles.goalHint}>
              What credit score are you aiming for? This sets your progress target.
            </Text>

            <Text style={styles.fieldLabel}>Target Score (300 – 850)</Text>
            <TextInput
              style={styles.input}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="number-pad"
              placeholder="e.g. 700"
              placeholderTextColor={COLORS.textSecondary}
              maxLength={3}
            />

            {/* Quick goal shortcuts */}
            <View style={styles.goalShortcuts}>
              {[580, 670, 740, 800].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.goalChip, goalInput === String(g) && styles.goalChipActive]}
                  onPress={() => setGoalInput(String(g))}
                >
                  <Text style={[styles.goalChipScore, goalInput === String(g) && { color: COLORS.powerPurple }]}>{g}</Text>
                  <Text style={styles.goalChipLabel}>{getScoreLabel(g)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGoalModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGoal}>
                <Text style={styles.saveText}>Save Goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  logBtn: {
    backgroundColor: COLORS.powerPurple,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  content: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  mutedText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' },
  errorText: { color: '#F97316', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryBtn: {
    backgroundColor: COLORS.powerPurple,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: COLORS.text, fontWeight: '600' },

  // Gauge card
  gaugeCard: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  bureauChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.powerPurple + '22',
    borderWidth: 1,
    borderColor: COLORS.powerPurple + '55',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  bureauChipText: {
    color: COLORS.powerPurple,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nextTierBadge: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  nextTierText: {
    fontSize: 14,
    fontWeight: '700',
  },
  gaugeMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 16,
  },

  // History chart
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
  chartScroll: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4 },
  barWrapper: { alignItems: 'center', marginHorizontal: 5 },
  barLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  barTrack: { justifyContent: 'flex-end' },
  bar: { borderRadius: 4 },
  barDate: { fontSize: 9, color: COLORS.textSecondary, marginTop: 6, width: 44, textAlign: 'center' },

  // Range legend
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rangeDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  rangeText: { color: COLORS.textSecondary, fontSize: 14 },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  goalHint: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  fieldLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, marginTop: 12 },
  bureauRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.powerPurple + '25', borderColor: COLORS.powerPurple },
  chipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.powerPurple, fontWeight: '700' },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, color: COLORS.text,
    fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  goalShortcuts: { flexDirection: 'row', gap: 8, marginTop: 12 },
  goalChip: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  goalChipActive: { borderColor: COLORS.powerPurple, backgroundColor: COLORS.powerPurple + '15' },
  goalChipScore: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },
  goalChipLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.powerPurple, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: COLORS.powerPurple + '60' },
  saveText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});

export default ScoreScreen;
