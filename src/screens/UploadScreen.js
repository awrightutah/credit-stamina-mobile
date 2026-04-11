import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { creditReportsAPI } from '../services/api';

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

const BUREAUS = [
  { id: 'TU', name: 'TransUnion', color: '#3B82F6' },
  { id: 'EQ', name: 'Equifax', color: '#EF4444' },
  { id: 'EX', name: 'Experian', color: '#10B981' },
];

const UploadScreen = ({ navigation }) => {
  const [selectedBureau, setSelectedBureau] = useState('TU');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
        allowMultiSelection: false,
      });
      
      if (res && res[0]) {
        setSelectedFile({
          uri: res[0].uri,
          name: res[0].name,
          size: res[0].size,
          type: res[0].type,
        });
        setError(null);
        setResult(null);
      }
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('Document picker error:', err);
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No File Selected', 'Please select a PDF credit report to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setParsing(false);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('pdf', {
        uri: Platform.OS === 'ios' ? selectedFile.uri.replace('file://', '') : selectedFile.uri,
        type: selectedFile.type || 'application/pdf',
        name: selectedFile.name,
      });
      formData.append('bureau', BUREAUS.find(b => b.id === selectedBureau)?.name || 'TransUnion');

      setUploading(false);
      setParsing(true);

      const response = await creditReportsAPI.upload(formData, (progress) => {
        setUploadProgress(progress);
      });

      setParsing(false);
      
      if (response.data) {
        setResult({
          success: true,
          accountsFound: response.data.accounts?.length || 0,
          bureau: response.data.bureau,
          accounts: response.data.accounts || [],
        });
        
        // Navigate to accounts after successful upload
        setTimeout(() => {
          Alert.alert(
            'Upload Complete!',
            `Found ${response.data.accounts?.length || 0} accounts. View them now?`,
            [
              { text: 'Stay Here', style: 'cancel' },
              { 
                text: 'View Accounts', 
                onPress: () => navigation.navigate('Accounts')
              },
            ]
          );
        }, 500);
      }
    } catch (err) {
      setUploading(false);
      setParsing(false);
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to upload and parse credit report');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Import Credit Report</Text>
        <Text style={styles.subtitle}>
          Upload your credit report PDF and AI will extract all accounts
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Bureau Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Bureau</Text>
          <View style={styles.bureauContainer}>
            {BUREAUS.map((bureau) => (
              <TouchableOpacity
                key={bureau.id}
                style={[
                  styles.bureauButton,
                  selectedBureau === bureau.id && { borderColor: bureau.color, backgroundColor: bureau.color + '20' },
                ]}
                onPress={() => setSelectedBureau(bureau.id)}
              >
                <Text style={[
                  styles.bureauText,
                  selectedBureau === bureau.id && { color: bureau.color },
                ]}>
                  {bureau.id}
                </Text>
                <Text style={styles.bureauName}>{bureau.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* File Upload Area */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Report PDF</Text>
          <TouchableOpacity style={styles.uploadArea} onPress={pickDocument}>
            <Text style={styles.uploadIcon}>📄</Text>
            {selectedFile ? (
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>{formatFileSize(selectedFile.size)}</Text>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Text style={styles.uploadText}>Tap to select PDF</Text>
                <Text style={styles.uploadSubtext}>
                  Supports Equifax, Experian, TransUnion PDFs
                </Text>
                <Text style={styles.uploadSubtext}>Max 20MB</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Need Report Link */}
        <View style={styles.helpSection}>
          <Text style={styles.helpText}>
            Need a report? Get your WEEKLY free report at{' '}
            <Text style={styles.linkText}>AnnualCreditReport.com</Text>
          </Text>
        </View>

        {/* Upload Button */}
        <TouchableOpacity
          style={[
            styles.uploadButton,
            (!selectedFile || uploading || parsing) && styles.uploadButtonDisabled,
          ]}
          onPress={handleUpload}
          disabled={!selectedFile || uploading || parsing}
        >
          {uploading || parsing ? (
            <View style={styles.buttonLoading}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.uploadButtonText}>
                {uploading ? `Uploading... ${uploadProgress}%` : 'AI is parsing your report...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.uploadButtonText}>Upload & Parse</Text>
          )}
        </TouchableOpacity>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Result Display */}
        {result && result.success && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultIcon}>✅</Text>
            <Text style={styles.resultTitle}>Upload Complete!</Text>
            <Text style={styles.resultText}>
              Found {result.accountsFound} accounts from {result.bureau}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* AI Processing Overlay */}
      <Modal
        visible={parsing}
        transparent
        animationType="fade"
      >
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            <View style={styles.spinner}>
              <ActivityIndicator size="large" color={COLORS.purple} />
            </View>
            <Text style={styles.overlayTitle}>AI is analyzing your accounts...</Text>
            <Text style={styles.overlaySubtext}>
              This may take up to 60 seconds for large reports
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  bureauContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  bureauButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  bureauText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  bureauName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  uploadArea: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  uploadSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  fileInfo: {
    alignItems: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  helpSection: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 24,
  },
  helpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  linkText: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.danger + '20',
    borderRadius: 12,
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.danger,
  },
  resultContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.success + '20',
    borderRadius: 16,
    marginBottom: 16,
  },
  resultIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    backgroundColor: COLORS.card,
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  spinner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: COLORS.purple + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  overlaySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default UploadScreen;