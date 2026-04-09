import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { actionsAPI } from '../services/api';

const COLORS = {
  primary: '#3B82F6',
  secondary: '#10B981',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
};

const ActionsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState('pending');

  const fetchActions = async () => {
    try {
      const response = await actionsAPI.getAll(filter === 'all' ? undefined : filter);
      setActions(response.data || []);
    } catch (error) {
      console.error('Error fetching actions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, [filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActions();
  }, [filter]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return COLORS.danger;
      case 2: return COLORS.warning;
      default: return COLORS.success;
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return 'High';
      case 2: return 'Medium';
      default: return 'Low';
    }
  };

  const renderAction = ({ item }) => (
    <TouchableOpacity style={styles.actionCard}>
      <View style={styles.actionHeader}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
          <Text style={styles.priorityText}>{getPriorityLabel(item.priority)}</Text>
        </View>
        <Text style={styles.actionStatus}>{item.status}</Text>
      </View>
      
      <Text style={styles.actionText}>{item.next_action}</Text>
      <Text style={styles.actionAccount}>{item.account_name}</Text>
      
      {item.due_date && (
        <Text style={styles.dueDate}>
          Due: {new Date(item.due_date).toLocaleDateString()}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Actions</Text>
        <Text style={styles.subtitle}>{actions.length} tasks</Text>
      </View>

      <View style={styles.filterContainer}>
        {['pending', 'complete', 'all'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={actions}
        renderItem={renderAction}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No actions found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card },
  filterTabActive: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.textSecondary, fontSize: 14 },
  filterTextActive: { color: COLORS.text, fontWeight: '600' },
  listContent: { padding: 20, paddingTop: 0 },
  actionCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  priorityText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  actionStatus: { color: COLORS.textSecondary, fontSize: 12 },
  actionText: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  actionAccount: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 },
  dueDate: { fontSize: 12, color: COLORS.warning },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 16, color: COLORS.text },
});

export default ActionsScreen;