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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, G, Line, Circle } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { scoresAPI, aiAPI, aiCacheAPI, pointsAPI } from '../services/api';
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

// ─── SVG Score Gauge (exact replica of PWA gauge) ────────────────────────────
// PWA viewBox="0 0 200 110", arc radius 85, stroke-width 14, needle to y=-72
const GAUGE_W = Math.min(width - 48, 320);
const GAUGE_SCALE = GAUGE_W / 200; // scale from 200-unit viewBox

const ScoreGauge = ({ score }) => {
  const safeScore = Math.min(850, Math.max(300, score || 300));
  // Needle angle: -90° at 300, +90° at 850 (matches PWA formula)
  const needleAngle = -90 + ((safeScore - 300) / 550) * 180;
  const color = getScoreColor(safeScore);

  return (
    <View style={gaugeStyles.wrapper}>
      <Svg
        width={GAUGE_W}
        height={GAUGE_W * 110 / 200}
        viewBox="0 0 200 110"
      >
        {/* Arc segments — exact PWA coordinates */}
        <Path d="M 15,100 A 85,85 0 0,1 43,32"  stroke="#DC2626" strokeWidth="14" fill="none" strokeLinecap="round" />
        <Path d="M 43,32 A 85,85 0 0,1 80,12"   stroke="#EF4444" strokeWidth="14" fill="none" strokeLinecap="round" />
        <Path d="M 80,12 A 85,85 0 0,1 120,12"  stroke="#F59E0B" strokeWidth="14" fill="none" strokeLinecap="round" />
        <Path d="M 120,12 A 85,85 0 0,1 157,32" stroke="#84CC16" strokeWidth="14" fill="none" strokeLinecap="round" />
        <Path d="M 157,32 A 85,85 0 0,1 185,100" stroke="#059669" strokeWidth="14" fill="none" strokeLinecap="round" />

        {/* Needle — pivots at (100,100) */}
        <G transform={`translate(100,100) rotate(${needleAngle})`}>
          <Line x1="0" y1="0" x2="0" y2="-72" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <Circle cx="0" cy="0" r="6" fill="white" />
        </G>
      </Svg>

      {/* Score number + label below gauge */}
      <View style={gaugeStyles.scoreText}>
        <Text style={[gaugeStyles.scoreNumber, { color }]}>{safeScore}</Text>
        <Text style={[gaugeStyles.scoreRating, { color }]}>{getScoreLabel(safeScore)}</Text>
      </View>

      {/* 300 / 850 range labels */}
      <View style={[gaugeStyles.rangeLabels, { width: GAUGE_W }]}>
        <Text style={gaugeStyles.rangeLabel}>300</Text>
        <Text style={gaugeStyles.rangeLabel}>850</Text>
      </View>
    </View>
  );
};

const gaugeStyles = StyleSheet.create({
  wrapper:     { alignItems: 'center' },
  scoreText:   { alignItems: 'center', marginTop: 4 },
  scoreNumber: { fontSize: 64, fontWeight: '800', lineHeight: 72 },
  scoreRating: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 4,
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

// ─── Tips response normalizer ─────────────────────────────────────────────────
// Handles every shape the backend might return from /api/score-improvement-tips
const extractTips = (raw) => {
  if (!raw) return null;
  // Walk known array-of-tips field names
  for (const key of ['tips', 'recommendations', 'suggestions', 'advice', 'actions', 'steps', 'items', 'data']) {
    if (Array.isArray(raw[key])) {
      return raw[key].map(t =>
        typeof t === 'string' ? t : (t?.text || t?.tip || t?.recommendation || t?.description || t?.action || null)
      ).filter(Boolean);
    }
  }
  // Raw itself is an array of strings or objects
  if (Array.isArray(raw)) {
    return raw.map(t =>
      typeof t === 'string' ? t : (t?.text || t?.tip || t?.recommendation || t?.description || null)
    ).filter(Boolean);
  }
  // Single string fields
  for (const key of ['advice', 'response', 'content', 'summary', 'text', 'message']) {
    if (typeof raw[key] === 'string' && raw[key].length > 10) {
      // Split on newlines or bullet chars so we can render as a list
      const lines = raw[key]
        .split(/\n+/)
        .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(l => l.length > 5);
      return lines.length > 0 ? lines : [raw[key]];
    }
  }
  return null;
};

// ─── Screen ───────────────────────────────────────────────────────────────────
const ScoreScreen = ({ route }) => {
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

  // AI score tips
  const [aiTips, setAiTips] = useState(null);
  const [tipsLoading, setTipsLoading] = useState(false);

  // Chart tap callout
  const [selectedBar, setSelectedBar] = useState(null); // { score, date, bureau }

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

      // Fetch AI score tips for the latest score
      if (sorted.length > 0) {
        const latest = sorted[0];
        const next = getNextTier(latest.score);
        fetchAiTips(latest.score, next?.label || 'Exceptional', next?.pts || 0);
      }
    } catch (err) {
      setError('Failed to load scores');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAiTips = async (currentScore, targetTier, pointsNeeded, forceRefresh = false) => {
    try {
      setTipsLoading(true);

      // Check cache first unless explicitly refreshing
      if (!forceRefresh) {
        const cached = await aiCacheAPI.get('score_tips').catch(() => null);
        if (cached) {
          const parsed = extractTips(aiCacheAPI.parse(cached));
          if (parsed && parsed.length > 0) {
            setAiTips(parsed);
            setTipsLoading(false);
            return;
          }
        }
      }

      const res = await aiAPI.getScoreTips(currentScore, targetTier, pointsNeeded);
      const raw = res?.data || res;

      const parsed = extractTips(raw);
      if (parsed && parsed.length > 0) {
        setAiTips(parsed);
        aiCacheAPI.set('score_tips', raw, null).catch(() => null);
      }
    } catch (e) {
      console.error('[ScoreScreen] tips error:', e?.response?.data || e.message);
    } finally {
      setTipsLoading(false);
    }
  };

  const handleDeleteScore = (id) => {
    Alert.alert(
      'Delete Score Entry',
      'Remove this score from your history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await scoresAPI.delete(id);
              setScores(prev => prev.filter(s => s.id !== id));
            } catch {
              Alert.alert('Error', 'Failed to delete score. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleAddScore = async () => {
    const scoreNum = parseInt(newScore, 10);
    if (!newScore || isNaN(scoreNum) || scoreNum < 300 || scoreNum > 850) {
      Alert.alert('Invalid Score', 'Please enter a score between 300 and 850.');
      return;
    }
    try {
      setSaving(true);
      // recorded_date as YYYY-MM-DD; notes as null when empty so backend doesn't reject ''
      await scoresAPI.add(
        newBureau,
        scoreNum,
        new Date().toISOString().split('T')[0],
        newNotes.trim() || null,
        user?.id
      );
      // Award points for logging a score (non-blocking)
      pointsAPI.award('log_score', `Logged ${newBureau} score: ${scoreNum}`, 25).catch(() => null);
      setLogModalVisible(false);
      setNewScore('');
      setNewNotes('');
      await fetchScores();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        'Failed to save score';
      console.error('[ScoreScreen] add score error:', err?.response?.status, msg);
      Alert.alert('Error saving score', String(msg));
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

  // Derived data — if a bureau param is passed (e.g. from Dashboard tap), highlight that bureau
  const requestedBureau = route?.params?.bureau ?? null;
  const latestScore = requestedBureau
    ? (scores.find(s => s.bureau === requestedBureau) ?? scores[0] ?? null)
    : (scores[0] ?? null);
  const chartScores   = [...scores].reverse(); // oldest → newest for chart
  const baselineScore = chartScores[0]?.score ?? null;
  const nextTier      = latestScore ? getNextTier(latestScore.score) : null;
  const barWidth      = Math.min(40, Math.max(24, (width - 64) / Math.max(chartScores.length, 1) - 10));

  const renderChart = () => {
    if (chartScores.length < 2) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score History</Text>

        {/* Tap callout — shown when a bar is selected */}
        {selectedBar && (
          <TouchableOpacity
            style={styles.chartCallout}
            onPress={() => setSelectedBar(null)}
            activeOpacity={0.9}
          >
            <Text style={[styles.chartCalloutScore, { color: getScoreColor(selectedBar.score) }]}>
              {selectedBar.score}
            </Text>
            <Text style={styles.chartCalloutDate}>{selectedBar.date}</Text>
            {selectedBar.bureau ? (
              <Text style={styles.chartCalloutBureau}>{selectedBar.bureau}</Text>
            ) : null}
            <Text style={styles.chartCalloutDismiss}>Tap to dismiss</Text>
          </TouchableOpacity>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
          {chartScores.map((s, i) => {
            const sc = s.score || 0;
            const barH = Math.max(6, ((sc - 300) / 550) * CHART_HEIGHT);
            const color = getScoreColor(sc);
            const isSelected = selectedBar?.score === sc &&
              selectedBar?.date === formatDate(s.recorded_date || s.reported_at);
            return (
              <TouchableOpacity
                key={s.id ?? `score-${i}`}
                style={styles.barWrapper}
                onPress={() => setSelectedBar({
                  score: sc,
                  date: formatDate(s.recorded_date || s.reported_at),
                  bureau: s.bureau ?? null,
                })}
                activeOpacity={0.75}
              >
                <Text style={[styles.barLabel, { color }]}>{sc}</Text>
                <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
                  <View style={[
                    styles.bar,
                    { height: barH, width: barWidth, backgroundColor: color },
                    isSelected && { opacity: 1, borderWidth: 2, borderColor: '#fff' },
                  ]} />
                </View>
                <Text style={styles.barDate}>{formatDate(s.recorded_date || s.reported_at)}</Text>
              </TouchableOpacity>
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

            {/* Multi-bureau comparison */}
            {(() => {
              const bureauLatest = BUREAUS.reduce((acc, b) => {
                const match = scores.find(s => s.bureau === b);
                if (match) acc[b] = match;
                return acc;
              }, {});
              const bureauEntries = Object.entries(bureauLatest);
              if (bureauEntries.length < 2) return null;
              return (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Bureau Comparison</Text>
                  {bureauEntries.map(([bureau, s]) => {
                    const color = getScoreColor(s.score);
                    const pct = Math.min(100, Math.max(0, ((s.score - 300) / 550) * 100));
                    return (
                      <View key={bureau} style={styles.bureauCompRow}>
                        <Text style={styles.bureauCompName}>{bureau}</Text>
                        <View style={styles.bureauCompBar}>
                          <View style={[styles.bureauCompFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.bureauCompScore, { color }]}>{s.score}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* Score history chart */}
            {renderChart()}

            {/* Score history list with delete */}
            {scores.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Logged Scores</Text>
                {scores.map((s, i) => {
                  const color = getScoreColor(s.score);
                  return (
                    <View
                      key={s.id ?? `score-${i}`}
                      style={[styles.scoreRow, i < scores.length - 1 && styles.scoreRowBorder]}
                    >
                      <View style={[styles.scoreBureauDot, { backgroundColor: color }]} />
                      <View style={styles.scoreRowInfo}>
                        <Text style={styles.scoreRowBureau}>{s.bureau ?? '—'}</Text>
                        <Text style={styles.scoreRowDate}>
                          {formatDate(s.recorded_date || s.reported_at)}
                        </Text>
                        {s.notes ? <Text style={styles.scoreRowNotes} numberOfLines={1}>{s.notes}</Text> : null}
                      </View>
                      <Text style={[styles.scoreRowValue, { color }]}>{s.score}</Text>
                      <TouchableOpacity
                        style={styles.scoreDeleteBtn}
                        onPress={() => handleDeleteScore(s.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.scoreDeleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

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

            {/* AI Score Tips */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>🤖 AI Score Tips</Text>
                {aiTips && aiTips.length > 0 && !tipsLoading && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Refresh Score Tips',
                        'Refreshing tips will use AI credits. Are you sure?',
                        [
                          { text: 'No', style: 'cancel' },
                          {
                            text: 'Yes',
                            onPress: () => {
                              if (scores.length > 0) {
                                const latest = scores[0];
                                const next = getNextTier(latest.score);
                                fetchAiTips(latest.score, next?.label || 'Exceptional', next?.pts || 0, true);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.refreshTipsBtn}>↺ Refresh</Text>
                  </TouchableOpacity>
                )}
              </View>
              {tipsLoading ? (
                <View style={styles.tipsLoading}>
                  <Text style={styles.tipsLoadingText}>Generating personalized tips...</Text>
                </View>
              ) : aiTips && aiTips.length > 0 ? (
                aiTips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>
                  Log a score to get personalized improvement tips.
                </Text>
              )}
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
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Set Goal Modal ── */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
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
        </KeyboardAvoidingView>
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

  // Gauge card — matches PWA #1E293B card
  gaugeCard: {
    margin: 20,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
  chartScroll: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4 },
  barWrapper: { alignItems: 'center', marginHorizontal: 5 },
  barLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  barTrack: { justifyContent: 'flex-end' },
  bar: { borderRadius: 4 },
  barDate: { fontSize: 9, color: COLORS.textSecondary, marginTop: 6, width: 44, textAlign: 'center' },
  chartCallout: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  chartCalloutScore: { fontSize: 28, fontWeight: '800' },
  chartCalloutDate: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  chartCalloutBureau: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  chartCalloutDismiss: { fontSize: 11, color: COLORS.textSecondary, marginTop: 8, fontStyle: 'italic' },

  // Range legend
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rangeDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  rangeText: { color: COLORS.textSecondary, fontSize: 14 },

  // Bureau comparison
  bureauCompRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bureauCompName: {
    width: 90,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  bureauCompBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  bureauCompFill: {
    height: '100%',
    borderRadius: 4,
  },
  bureauCompScore: {
    width: 36,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  // Score history list
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  scoreRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  scoreBureauDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  scoreRowInfo: {
    flex: 1,
  },
  scoreRowBureau: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  scoreRowDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  scoreRowNotes: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  scoreRowValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 12,
  },
  scoreDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#DC262620',
  },
  scoreDeleteBtnText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  // AI tips
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  refreshTipsBtn: { fontSize: 12, color: COLORS.powerPurple, fontWeight: '600' },
  tipsLoading: { paddingVertical: 8 },
  tipsLoadingText: { color: COLORS.textSecondary, fontSize: 13, fontStyle: 'italic' },
  tipRow: { flexDirection: 'row', marginBottom: 10 },
  tipBullet: { color: COLORS.powerPurple, fontSize: 16, marginRight: 8, lineHeight: 20 },
  tipText: { flex: 1, color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },

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
