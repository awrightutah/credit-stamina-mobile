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
import { useAuth } from '../context/AuthContext';
import { scoresAPI } from '../services/api';
import COLORS from '../theme/colors';

const { width } = Dimensions.get('window');
const GAUGE_SIZE = Math.min(width - 80, 260);
const STROKE = 24;
const CHART_HEIGHT = 100;
const BUREAUS = ['TransUnion', 'Equifax', 'Experian'];

// Brand color scale — no red
const getScoreColor = (score) => {
  if (score >= 750) return COLORS.growthGreen;  // #059669
  if (score >= 700) return COLORS.staminaBlue;  // #1E40AF
  if (score >= 650) return COLORS.powerPurple;  // #7C3AED
  if (score >= 600) return COLORS.alertAmber;   // #D97706
  return '#B45309';                             // dark amber — warm caution, not red
};

const getScoreLabel = (score) => {
  if (score >= 750) return 'Excellent';
  if (score >= 700) return 'Good';
  if (score >= 650) return 'Fair';
  if (score >= 600) return 'Poor';
  return 'Very Poor';
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Semicircle Gauge ────────────────────────────────────────────────────────
// Uses two clipped half-circles that rotate to fill the arc without any SVG dep.
const ScoreGauge = ({ score }) => {
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const angle = pct * 180; // 0° (300) → 180° (850)
  const color = getScoreColor(score);

  // Left half fill rotates from -90° (hidden) → 0° (fully shown)
  const leftDeg = Math.min(0, angle - 90);
  // Right half fill rotates from -90° (hidden) → 0° (fully shown)
  const rightDeg = angle > 90 ? angle - 180 : -90;
  const showRight = angle > 90;

  const innerSize = GAUGE_SIZE - STROKE * 2;

  return (
    <View style={gaugeStyles.wrapper}>
      {/* Arc container — clips to top half */}
      <View style={[gaugeStyles.arcClip, { width: GAUGE_SIZE, height: GAUGE_SIZE / 2 + STROKE / 2 }]}>

        {/* Gray track */}
        <View style={[gaugeStyles.ring, {
          width: GAUGE_SIZE, height: GAUGE_SIZE,
          borderRadius: GAUGE_SIZE / 2,
          borderWidth: STROKE,
          borderColor: '#1F2937',
        }]} />

        {/* Left fill — clipped to left half */}
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

        {/* Right fill — clipped to right half */}
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

        {/* Inner cap — hides the inside of the ring */}
        <View style={[gaugeStyles.innerCap, {
          width: innerSize, height: innerSize,
          borderRadius: innerSize / 2,
          left: STROKE, top: STROKE,
        }]} />
      </View>

      {/* Score text */}
      <View style={gaugeStyles.scoreText}>
        <Text style={[gaugeStyles.scoreNumber, { color }]}>{score}</Text>
        <Text style={[gaugeStyles.scoreRating, { color }]}>{getScoreLabel(score)}</Text>
      </View>

      {/* 300 / 850 labels */}
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

// ─── Screen ───────────────────────────────────────────────────────────────────
const ScoreScreen = () => {
  const { user } = useAuth();
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newBureau, setNewBureau] = useState('TransUnion');
  const [newScore, setNewScore] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
      setModalVisible(false);
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

  const openModal = () => {
    setNewBureau('TransUnion');
    setNewScore('');
    setNewNotes('');
    setModalVisible(true);
  };

  const latestScore = scores[0] ?? null;
  const chartScores = [...scores].reverse(); // oldest → newest
  const barWidth = Math.min(40, Math.max(24, (width - 64) / Math.max(chartScores.length, 1) - 10));

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
        <TouchableOpacity style={styles.logBtn} onPress={openModal}>
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
            <TouchableOpacity style={[styles.logBtn, { marginTop: 20 }]} onPress={openModal}>
              <Text style={styles.logBtnText}>+ Log Score</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Gauge card */}
            <View style={styles.gaugeCard}>
              <ScoreGauge score={latestScore.score} />
              <Text style={styles.gaugeMeta}>
                {latestScore.bureau} · {formatDate(latestScore.recorded_date || latestScore.reported_at)}
              </Text>
            </View>

            {/* History */}
            {renderChart()}

            {/* Legend */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Score Ranges</Text>
              {[
                { color: COLORS.growthGreen, label: '750 – 850: Excellent' },
                { color: COLORS.staminaBlue, label: '700 – 749: Good' },
                { color: COLORS.powerPurple, label: '650 – 699: Fair' },
                { color: COLORS.alertAmber,  label: '600 – 649: Poor' },
                { color: '#B45309',           label: '300 – 599: Very Poor' },
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

      {/* Log Score Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
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
  errorText: { color: COLORS.alertAmber, fontSize: 15, marginBottom: 16, textAlign: 'center' },
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
  gaugeMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 12 },
  // Chart
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
  // Legend
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rangeDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  rangeText: { color: COLORS.textSecondary, fontSize: 14 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 20 },
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
