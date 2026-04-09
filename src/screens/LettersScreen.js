import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lettersAPI } from '../services/api';

const LettersScreen = () => {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [letterType, setLetterType] = useState('dispute');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetchLetters();
  }, []);

  const fetchLetters = async () => {
    try {
      setLoading(true);
      const data = await lettersAPI.getLetters();
      setLetters(data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load letters');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLetters();
    setRefreshing(false);
  };

  const handleGenerateLetter = async () => {
    if (!accountId.trim()) {
      Alert.alert('Error', 'Please enter an account ID');
      return;
    }

    try {
      const newLetter = await lettersAPI.generateLetter({
        account_id: accountId,
        letter_type: letterType,
        reason: reason,
      });
      
      Alert.alert('Success', 'Letter generated successfully');
      setGenerateModalVisible(false);
      setAccountId('');
      setReason('');
      fetchLetters();
    } catch (err) {
      Alert.alert('Error', 'Failed to generate letter');
      console.error(err);
    }
  };

  const handleDeleteLetter = (letterId) => {
    Alert.alert(
      'Delete Letter',
      'Are you sure you want to delete this letter?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await lettersAPI.deleteLetter(letterId);
              setLetters(letters.filter(l => l.id !== letterId));
            } catch (err) {
              Alert.alert('Error', 'Failed to delete letter');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'sent':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'draft':
        return '#6B7280';
      case 'responded':
        return '#3B82F6';
      default:
        return '#9CA3AF';
    }
  };

  const getLetterTypeLabel = (type) => {
    switch (type?.toLowerCase()) {
      case 'dispute':
        return 'Dispute Letter';
      case 'goodwill':
        return 'Goodwill Letter';
      case 'pay_for_delete':
        return 'Pay for Delete';
      case 'validation':
        return 'Debt Validation';
      default:
        return type || 'Letter';
    }
  };

  const renderLetterItem = (letter) => (
    <TouchableOpacity
      key={letter.id}
      style={styles.letterCard}
      onPress={() => {
        setSelectedLetter(letter);
        setModalVisible(true);
      }}
    >
      <View style={styles.letterHeader}>
        <View style={styles.letterInfo}>
          <Text style={styles.letterType}>{getLetterTypeLabel(letter.letter_type)}</Text>
          <Text style={styles.letterBureau}>{letter.bureau || 'Credit Bureau'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(letter.status) }]}>
          <Text style={styles.statusText}>{letter.status || 'Draft'}</Text>
        </View>
      </View>
      
      <Text style={styles.letterAccount} numberOfLines={1}>
        Account: {letter.account_name || letter.account_id || 'N/A'}
      </Text>
      
      <View style={styles.letterFooter}>
        <Text style={styles.letterDate}>
          {new Date(letter.created_at).toLocaleDateString()}
        </Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteLetter(letter.id)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dispute Letters</Text>
        <Text style={styles.subtitle}>Manage your credit dispute correspondence</Text>
      </View>

      <TouchableOpacity
        style={styles.generateButton}
        onPress={() => setGenerateModalVisible(true)}
      >
        <Text style={styles.generateButtonText}>+ Generate New Letter</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading letters...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchLetters}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : letters.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No letters yet</Text>
            <Text style={styles.emptySubtext}>
              Generate your first dispute letter to get started
            </Text>
          </View>
        ) : (
          letters.map(renderLetterItem)
        )}
      </ScrollView>

      {/* Letter Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Letter Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {selectedLetter && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>
                    {getLetterTypeLabel(selectedLetter.letter_type)}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bureau:</Text>
                  <Text style={styles.detailValue}>{selectedLetter.bureau || 'N/A'}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={[styles.detailValue, { color: getStatusColor(selectedLetter.status) }]}>
                    {selectedLetter.status || 'Draft'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account:</Text>
                  <Text style={styles.detailValue}>
                    {selectedLetter.account_name || selectedLetter.account_id || 'N/A'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Created:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedLetter.created_at).toLocaleDateString()}
                  </Text>
                </View>
                
                {selectedLetter.content && (
                  <View style={styles.contentSection}>
                    <Text style={styles.contentLabel}>Letter Content:</Text>
                    <ScrollView style={styles.letterContentScroll}>
                      <Text style={styles.letterContent}>{selectedLetter.content}</Text>
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setModalVisible(false);
                  // Would implement download/share functionality
                }}
              >
                <Text style={styles.actionButtonText}>Download PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Generate Letter Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={generateModalVisible}
        onRequestClose={() => setGenerateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate Letter</Text>
              <TouchableOpacity onPress={() => setGenerateModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Letter Type</Text>
              <View style={styles.typeSelector}>
                {['dispute', 'goodwill', 'validation'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      letterType === type && styles.typeButtonActive,
                    ]}
                    onPress={() => setLetterType(type)}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        letterType === type && styles.typeButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.inputLabel}>Account ID</Text>
              <TextInput
                style={styles.textInput}
                value={accountId}
                onChangeText={setAccountId}
                placeholder="Enter account ID"
                placeholderTextColor="#6B7280"
              />
              
              <Text style={styles.inputLabel}>Reason (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Describe the reason for this letter..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={4}
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleGenerateLetter}
              >
                <Text style={styles.actionButtonText}>Generate Letter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  generateButton: {
    backgroundColor: '#8B5CF6',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  letterCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  letterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  letterInfo: {
    flex: 1,
  },
  letterType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  letterBureau: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  letterAccount: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  letterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  letterDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
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
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D4A',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    fontSize: 24,
    color: '#9CA3AF',
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  contentSection: {
    marginTop: 16,
  },
  contentLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  letterContentScroll: {
    backgroundColor: '#0F0F1A',
    borderRadius: 8,
    padding: 12,
    maxHeight: 200,
  },
  letterContent: {
    fontSize: 13,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  modalActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2D2D4A',
  },
  actionButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#2D2D4A',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  typeButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#2D2D4A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

export default LettersScreen;