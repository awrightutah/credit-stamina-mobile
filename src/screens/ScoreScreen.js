import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scoresAPI } from '../services/api';

const { width } = Dimensions.get('window');

const ScoreScreen = () => {
  const [scores, setScores] = useState([]);
  const [selectedBureau, setSelectedBureau] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchScores();
  }, []);

  const fetchScores = async () => {
    try {
      setLoading(true);
      const data = await scoresAPI.getScores();
      setScores(data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load credit scores');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchScores();
    setRefreshing(false);
  };

  const getScoreColor = (score) => {
    if (score >= 750) return '#10B981'; // Excellent - Green
    if (score >= 700) return '#3B82F6'; // Good - Blue
    if (score >= 650) return '#F59E0B'; // Fair - Yellow
    if (score >= 600) return '#F97316'; // Poor - Orange
    return '#EF4444'; // Very Poor - Red
  };

  const getScoreLabel = (score) => {
    if (score >= 750) return 'Excellent';
    if (score >= 700) return 'Good';
    if (score >= 650) return 'Fair';
    if (score >= 600) return 'Poor';
    return 'Very Poor';
  };

  const renderScoreCircle = (score, bureau, date) => {
    const scoreColor = getScoreColor(score);
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = ((score - 300) / 550) * circumference;

    return (
      <View key={bureau} style={styles.scoreCard}>
        <Text style={styles.bureauName}>{bureau}</Text>
        <View style={styles.circleContainer}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
            <Text style={[styles.scoreLabel, { color: scoreColor }]}>
              {getScoreLabel(score)}
            </Text>
          </View>
        </View>
        <Text style={styles.updateDate}>
          Updated: {new Date(date).toLocaleDateString()}
        </Text>
      </View>
    );
  };

  const filteredScores = selectedBureau === 'all' 
    ? scores 
    : scores.filter(s => s.bureau?.toLowerCase() === selectedBureau);

  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length)
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Credit Scores</Text>
        <Text style={styles.subtitle}>Track your credit health</Text>
      </View>

      {averageScore > 0 && (
        <View style={styles.averageContainer}>
          <Text style={styles.averageLabel}>Average Score</Text>
          <Text style={[styles.averageScore, { color: getScoreColor(averageScore) }]}>
            {averageScore}
          </Text>
        </View>
      )}

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.filterButton, selectedBureau === 'all' && styles.filterButtonActive]}
            onPress={() => setSelectedBureau('all')}
          >
            <Text style={[styles.filterText, selectedBureau === 'all' && styles.filterTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, selectedBureau === 'experian' && styles.filterButtonActive]}
            onPress={() => setSelectedBureau('experian')}
          >
            <Text style={[styles.filterText, selectedBureau === 'experian' && styles.filterTextActive]}>
              Experian
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, selectedBureau === 'equifax' && styles.filterButtonActive]}
            onPress={() => setSelectedBureau('equifax')}
          >
            <Text style={[styles.filterText, selectedBureau === 'equifax' && styles.filterTextActive]}>
              Equifax
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, selectedBureau === 'transunion' && styles.filterButtonActive]}
            onPress={() => setSelectedBureau('transunion')}
          >
            <Text style={[styles.filterText, selectedBureau === 'transunion' && styles.filterTextActive]}>
              TransUnion
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading scores...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchScores}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredScores.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No credit scores available</Text>
            <Text style={styles.emptySubtext}>
              Import a credit report to see your scores
            </Text>
          </View>
        ) : (
          filteredScores.map((scoreData) => 
            renderScoreCircle(
              scoreData.score, 
              scoreData.bureau || 'Credit Bureau', 
              scoreData.reported_at || new Date()
            )
          )
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Score Ranges</Text>
          <View style={styles.rangeItem}>
            <View style={[styles.rangeDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.rangeText}>750 - 850: Excellent</Text>
          </View>
          <View style={styles.rangeItem}>
            <View style={[styles.rangeDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.rangeText}>700 - 749: Good</Text>
          </View>
          <View style={styles.rangeItem}>
            <View style={[styles.rangeDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.rangeText}>650 - 699: Fair</Text>
          </View>
          <View style={styles.rangeItem}>
            <View style={[styles.rangeDot, { backgroundColor: '#F97316' }]} />
            <Text style={styles.rangeText}>600 - 649: Poor</Text>
          </View>
          <View style={styles.rangeItem}>
            <View style={[styles.rangeDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.rangeText}>300 - 599: Very Poor</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F3D',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  averageContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F3D',
  },
  averageLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  averageScore: {
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 4,
  },
  filterContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F3D',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F1F3D',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scoreCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  bureauName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  circleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F1F3D',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  updateDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
  infoSection: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  rangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rangeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  rangeText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});

export default ScoreScreen;