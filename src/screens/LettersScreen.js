import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { lettersAPI, accountsAPI, logActivity, pointsAPI } from '../services/api';
import { scheduleLetterReminder, cancelLetterReminder } from '../services/notifications';
import PaymentModal from '../components/PaymentModal';
import { useAuth } from '../context/AuthContext';
import { useESignConsent } from '../hooks/useESignConsent';
import AIDisclaimer from '../components/AIDisclaimer';
import ProgressMessage from '../components/ProgressMessage';

const LETTER_GEN_MESSAGES = [
  'Reviewing your account details...',
  'Researching dispute grounds...',
  'Writing your dispute letter...',
  'Formatting for mailing...',
  'Almost done...',
];

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  alertAmber: '#F97316',
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
};

const LETTER_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'bureau_dispute', label: 'Bureau Dispute' },
  { key: 'goodwill', label: 'Goodwill' },
  { key: 'pay_for_delete', label: 'Pay for Delete' },
  { key: 'debt_validation', label: 'Debt Validation' },
  { key: 'hardship', label: 'Hardship' },
];

const STATUS_COLORS = {
  sent: COLORS.success,
  pending: COLORS.warning,
  draft: COLORS.textSecondary,
  responded: COLORS.staminaBlue,
  delivered: COLORS.purple,
};

const getLetterTypeLabel = (type) => {
  switch (type?.toLowerCase()) {
    case 'bureau_dispute':
    case 'dispute': return 'Bureau Dispute';
    case 'goodwill': return 'Goodwill';
    case 'pay_for_delete': return 'Pay for Delete';
    case 'debt_validation':
    case 'validation': return 'Debt Validation';
    case 'hardship': return 'Hardship / Get Current';
    default: return type || 'Letter';
  }
};

const getStatusColor = (status) => STATUS_COLORS[status?.toLowerCase()] ?? COLORS.textSecondary;

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Letter Card ───────────────────────────────────────────────────────────────
const LetterCard = ({ letter, onPress, onDelete }) => {
  const statusColor = getStatusColor(letter.status);
  return (
    <TouchableOpacity style={styles.letterCard} onPress={() => onPress(letter)} activeOpacity={0.7}>
      <View style={styles.letterCardHeader}>
        <View style={styles.letterTypeRow}>
          <Text style={styles.letterTypeText}>{getLetterTypeLabel(letter.letter_type)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(letter.status || 'draft').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.letterBureau}>{letter.bureau || 'Credit Bureau'}</Text>
      </View>

      <Text style={styles.letterAccount} numberOfLines={1}>
        {letter.account_name || letter.account_id || 'General'}
      </Text>

      <View style={styles.letterFooter}>
        <Text style={styles.letterDate}>{formatDate(letter.created_at)}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={(e) => { e.stopPropagation(); onDelete(letter.id); }}
          >
            <Text style={styles.cardDeleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── AI Recommendation Logic ──────────────────────────────────────────────────
const getRecommendation = (account) => {
  if (!account) return null;
  const lane    = account.lane || '';
  const balance = parseFloat(account.balance) || 0;
  const bureau  = account.bureau || 'Equifax';
  const name    = account.creditor || account.account_name || 'this account';

  if (lane === 'Active Damage') {
    return {
      letterType: 'bureau_dispute',
      bureau,
      reason: `${name} is actively hurting your score. A Bureau Dispute challenges the negative reporting at ${bureau} and requests correction or removal.`,
    };
  }
  if (lane === 'Removable') {
    if (balance > 0) {
      return {
        letterType: 'pay_for_delete',
        bureau,
        reason: `${name} has an outstanding balance and is in the Removable lane. A Pay for Delete letter offers payment in exchange for full removal from your ${bureau} report.`,
      };
    }
    return {
      letterType: 'debt_validation',
      bureau,
      reason: `${name} appears removable. A Debt Validation letter forces ${bureau} to prove the debt is valid — if they can't, it must be removed.`,
    };
  }
  // Aging / Monitor
  return {
    letterType: 'goodwill',
    bureau,
    reason: `${name} is aging off your report. A Goodwill letter kindly asks ${bureau} to remove this mark early in recognition of your improved payment behavior.`,
  };
};

// Hardship accounts (past due / delinquent)
const getHardshipRecommendation = (account) => {
  if (!account) return null;
  const past_due = parseFloat(account.past_due_amount) || 0;
  if (past_due > 0) {
    return {
      letterType: 'hardship',
      bureau: account.bureau || 'Equifax',
      reason: `${account.creditor || account.account_name} shows a past-due amount of $${past_due.toLocaleString()}. A Hardship letter explains your circumstances and requests the creditor bring the account current or arrange a payment plan.`,
    };
  }
  return null;
};

// ─── Generate Modal ────────────────────────────────────────────────────────────
const GenerateModal = ({ visible, onClose, onGenerate, accounts = [] }) => {
  const [letterType, setLetterType]           = useState('bureau_dispute');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [reason, setReason]                   = useState('');
  const [bureau, setBureau]                   = useState('Equifax');
  const [loading, setLoading]                 = useState(false);
  const [recommendation, setRecommendation]   = useState(null);

  // Reset when modal opens
  React.useEffect(() => {
    if (visible) {
      setSelectedAccount(null);
      setReason('');
      setBureau('Equifax');
      setLetterType('bureau_dispute');
      setRecommendation(null);
    }
  }, [visible]);

  // Derive AI recommendation whenever account changes.
  // Hardship (past-due) takes priority over the standard lane-based recommendation.
  React.useEffect(() => {
    const hardship = getHardshipRecommendation(selectedAccount);
    const rec = hardship || getRecommendation(selectedAccount);
    setRecommendation(rec);
    if (rec) {
      setLetterType(rec.letterType);
      setBureau(rec.bureau);
    }
  }, [selectedAccount]);

  const handleGenerate = async () => {
    if (!selectedAccount) {
      Alert.alert('Select Account', 'Please select an account to dispute.');
      return;
    }
    setLoading(true);
    try {
      await onGenerate({
        letter_type: letterType,
        account_name: selectedAccount.creditor || selectedAccount.account_name,
        account_id: selectedAccount.id,
        reason,
        bureau,
      });
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to generate letter. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.handleBar} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Generate Letter</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Letter Type */}
            <Text style={styles.inputLabel}>LETTER TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelectorScroll}>
              {LETTER_TYPES.filter(t => t.key !== 'all').map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeChip, letterType === t.key && styles.typeChipActive]}
                  onPress={() => setLetterType(t.key)}
                >
                  <Text style={[styles.typeChipText, letterType === t.key && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Bureau */}
            <Text style={styles.inputLabel}>BUREAU</Text>
            <View style={styles.bureauRow}>
              {['Equifax', 'Experian', 'TransUnion'].map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.bureauChip, bureau === b && styles.typeChipActive]}
                  onPress={() => setBureau(b)}
                >
                  <Text style={[styles.typeChipText, bureau === b && styles.typeChipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Account Picker */}
            <Text style={styles.inputLabel}>SELECT ACCOUNT</Text>
            {accounts.length === 0 ? (
              <View style={styles.noAccountsBox}>
                <Text style={styles.noAccountsText}>No accounts found. Upload a credit report first.</Text>
              </View>
            ) : (
              <View style={styles.accountPickerList}>
                {accounts.map((acct) => {
                  const name = acct.creditor || acct.account_name || 'Unknown';
                  const isSelected = selectedAccount?.id === acct.id;
                  const laneColor = acct.lane === 'Active Damage' ? COLORS.danger
                    : acct.lane === 'Removable' ? COLORS.warning
                    : COLORS.success;
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      style={[styles.accountPickerRow, isSelected && styles.accountPickerRowSelected]}
                      onPress={() => setSelectedAccount(acct)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.accountPickerDot, { backgroundColor: laneColor }]} />
                      <View style={styles.accountPickerInfo}>
                        <Text style={[styles.accountPickerName, isSelected && { color: COLORS.purple }]}
                          numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.accountPickerMeta}>
                          {acct.account_type || 'Account'}{acct.bureau ? ` · ${acct.bureau}` : ''}
                        </Text>
                      </View>
                      {isSelected && <Text style={styles.accountPickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* AI Recommendation Card */}
            {recommendation && selectedAccount && (
              <View style={styles.recommendationCard}>
                <View style={styles.recommendationHeader}>
                  <Text style={styles.recommendationIcon}>🤖</Text>
                  <Text style={styles.recommendationTitle}>AI Recommendation</Text>
                </View>
                <Text style={styles.recommendationBody}>{recommendation.reason}</Text>
                <View style={styles.recommendationTags}>
                  <View style={styles.recTag}>
                    <Text style={styles.recTagText}>
                      {LETTER_TYPES.find(t => t.key === recommendation.letterType)?.label || recommendation.letterType}
                    </Text>
                  </View>
                  <View style={[styles.recTag, { backgroundColor: COLORS.staminaBlue + '30', borderColor: COLORS.staminaBlue + '60' }]}>
                    <Text style={[styles.recTagText, { color: COLORS.staminaBlue }]}>{recommendation.bureau}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Reason */}
            <Text style={styles.inputLabel}>REASON / NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe the reason for this dispute..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            {loading && (
              <ProgressMessage messages={LETTER_GEN_MESSAGES} />
            )}
            <TouchableOpacity
              style={[styles.generateBtn, loading && { opacity: 0.7 }]}
              onPress={handleGenerate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.generateBtnText}>Generate Letter</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ letter, visible, onClose, onLetterUpdated }) => {
  const navigation = useNavigation();
  const { hasConsented, loading: consentLoading } = useESignConsent();
  const [signingLoading, setSigningLoading] = useState(false);
  const [mailLoading, setMailLoading]       = useState(false);
  const [pdfLoading, setPdfLoading]         = useState(false);
  const [currentLetter, setCurrentLetter]   = useState(letter);
  const [paymentVisible, setPaymentVisible] = useState(false);

  // Recipient address fields (pre-fill from bureau)
  const [recipientName, setRecipientName]       = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientCity, setRecipientCity]       = useState('');
  const [recipientState, setRecipientState]     = useState('');
  const [recipientZip, setRecipientZip]         = useState('');
  const [showMailForm, setShowMailForm]         = useState(false);

  // Response tracking
  const [outcome, setOutcome]                   = useState(null);
  const [denialReason, setDenialReason]         = useState('');
  const [updatingResponse, setUpdatingResponse] = useState(false);

  // AI Escalation
  const [escalationText, setEscalationText]               = useState('');
  const [escalationLoading, setEscalationLoading]         = useState(false);
  const [showEscalation, setShowEscalation]               = useState(false);
  const [escalationPaymentVisible, setEscalationPaymentVisible] = useState(false);
  const [escalationMailLoading, setEscalationMailLoading] = useState(false);
  const [generatedEscalationId, setGeneratedEscalationId] = useState(null);

  useEffect(() => {
    setCurrentLetter(letter);
    setShowMailForm(false);
    setOutcome(letter?.outcome || null);
    setDenialReason(letter?.denial_reason || '');
    setEscalationText('');
    setShowEscalation(false);
    setGeneratedEscalationId(null);
    // Pre-fill bureau mailing address
    if (letter) {
      const bureau = (letter.bureau || '').toLowerCase();
      if (bureau.includes('equifax')) {
        setRecipientName('Equifax Information Services LLC');
        setRecipientAddress('P.O. Box 740256');
        setRecipientCity('Atlanta'); setRecipientState('GA'); setRecipientZip('30374');
      } else if (bureau.includes('experian')) {
        setRecipientName('Experian');
        setRecipientAddress('P.O. Box 4500');
        setRecipientCity('Allen'); setRecipientState('TX'); setRecipientZip('75013');
      } else if (bureau.includes('transunion')) {
        setRecipientName('TransUnion LLC Consumer Dispute Center');
        setRecipientAddress('P.O. Box 2000');
        setRecipientCity('Chester'); setRecipientState('PA'); setRecipientZip('19016');
      } else {
        setRecipientName(''); setRecipientAddress('');
        setRecipientCity(''); setRecipientState(''); setRecipientZip('');
      }
    }
  }, [letter]);

  if (!letter) return null;

  const isSigned = !!(currentLetter?.signature_name || currentLetter?.signed_at);
  const isSent   = ['sent', 'mailed', 'delivered'].includes((currentLetter?.status || '').toLowerCase());

  const handleOpenSignFlow = () => {
    const letterData = {
      letterId:   currentLetter.id,
      letterType: getLetterTypeLabel(currentLetter.letter_type),
      creditor:   currentLetter.account_name || currentLetter.creditor_name || currentLetter.creditor || 'Unknown',
      bureau:     currentLetter.bureau,
    };
    // Close modal first so navigation works cleanly from behind the Modal
    onClose();
    if (hasConsented) {
      navigation.navigate('Signature', { letterData });
    } else {
      navigation.navigate('ESignConsent', { letterData });
    }
  };

  const handleMailConfirm = () => {
    if (!isSigned) {
      Alert.alert('Sign First', 'Please sign the letter before mailing it.');
      return;
    }
    if (!recipientAddress.trim() || !recipientZip.trim()) {
      Alert.alert('Address Required', 'Please fill in the recipient address and zip code.');
      return;
    }
    // Open payment modal in 'collect' mode — we don't charge here. The
    // backend charges + mails atomically in /api/letters/:id/mail, so we
    // just need the card data handed back to us.
    setPaymentVisible(true);
  };

  const handlePaymentSuccess = async ({ cardData } = {}) => {
    setPaymentVisible(false);
    if (!cardData) {
      Alert.alert('Card Required', 'We could not read your card details. Please try again.');
      return;
    }
    setMailLoading(true);
    try {
      const res = await lettersAPI.mailViaUSPS(currentLetter.id, {
        recipientName, recipientAddress, recipientCity, recipientState, recipientZip, cardData,
      });
      const trackingNumber = res?.data?.tracking_number || null;
      setCurrentLetter(prev => ({ ...prev, status: 'sent', send_status: 'sent', sent_date: new Date().toISOString(), tracking_number: trackingNumber }));
      onLetterUpdated?.();
      setShowMailForm(false);
      // Schedule follow-up reminder (30 days for bureaus, 14 for creditors)
      const isBureau = ['equifax','experian','transunion'].some(b =>
        (currentLetter.bureau || '').toLowerCase().includes(b)
      );
      await scheduleLetterReminder(currentLetter.id, recipientName, isBureau);
      // Award points for mailing a letter (non-blocking)
      pointsAPI.award('send_letter', 'Mailed dispute letter via USPS', 35).catch(() => null);
      // Log to activity
      await logActivity(
        'letter_sent',
        'Letter Mailed via USPS',
        `${getLetterTypeLabel(currentLetter.letter_type)} sent to ${recipientName}`,
        { letter_id: currentLetter.id, letter_type: currentLetter.letter_type, bureau: currentLetter.bureau }
      );
      const trackingLine = trackingNumber ? `\n\nTracking: ${trackingNumber}` : '';
      Alert.alert(
        'Letter Mailed! ✉️',
        `Your letter has been submitted via USPS and will be delivered within 3–5 business days.${trackingLine}\n\nYou'll receive a reminder to follow up in ${isBureau ? 30 : 14} days.`
      );
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Mailing failed. Please try again.';
      Alert.alert('Mailing Error', msg);
    } finally {
      setMailLoading(false);
    }
  };

  const handleViewPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await lettersAPI.getPdfUrl(currentLetter.id);
      const url = res?.data?.url || res?.data?.pdf_url;
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert('PDF Not Ready', 'The PDF for this letter is not yet available. Try again in a moment.');
      }
    } catch {
      Alert.alert('Error', 'Could not load PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleUpdateResponse = async (newOutcome) => {
    setUpdatingResponse(true);
    try {
      const recipientLabel = currentLetter.bureau || currentLetter.creditor_name || currentLetter.creditor || 'recipient';
      const updates = {
        outcome:       newOutcome,
        denial_reason: newOutcome === 'accepted' ? null : (denialReason || null),
        response_date: new Date().toISOString().split('T')[0],
        status:        newOutcome === 'accepted' ? 'responded' : 'responded',
        send_status:   newOutcome === 'accepted' ? 'responded' : 'sent',
      };
      await lettersAPI.updateStatus(currentLetter.id, updates);
      setCurrentLetter(prev => ({ ...prev, ...updates }));
      onLetterUpdated?.();
      if (newOutcome === 'accepted') {
        await cancelLetterReminder(currentLetter.id);
        await logActivity(
          'letter_responded',
          'Letter Accepted',
          `${getLetterTypeLabel(currentLetter.letter_type)} to ${recipientLabel} was accepted — item should be removed`,
          { letter_id: currentLetter.id, letter_type: currentLetter.letter_type, outcome: 'accepted' }
        );
        Alert.alert('Great News! 🎉', 'Marked as accepted. Check your credit report in 30 days to confirm the item was removed.');
      } else {
        const outcomeLabel = newOutcome === 'declined' ? 'Declined' : 'No Response Received';
        await logActivity(
          'letter_responded',
          `Letter ${outcomeLabel}`,
          `${getLetterTypeLabel(currentLetter.letter_type)} to ${recipientLabel}${denialReason ? ` — ${denialReason}` : ''}`,
          { letter_id: currentLetter.id, letter_type: currentLetter.letter_type, outcome: newOutcome }
        );
        Alert.alert('Response Recorded', 'Use "Generate Follow-Up Letter" below to send a stronger escalation letter.');
      }
    } catch {
      Alert.alert('Error', 'Failed to save response. Please try again.');
    } finally {
      setUpdatingResponse(false);
    }
  };

  const handleGenerateEscalation = async () => {
    setEscalationLoading(true);
    setEscalationText('');
    try {
      const round = (currentLetter.follow_up_count || 0) + 1;
      const res = await lettersAPI.generateEscalation({
        original_letter_id: currentLetter.id,
        letter_type:        currentLetter.letter_type,
        account_name:       currentLetter.account_name || currentLetter.creditor_name || currentLetter.creditor,
        account_id:         currentLetter.account_id,
        bureau:             currentLetter.bureau,
        creditor_name:      currentLetter.creditor_name || currentLetter.creditor || currentLetter.bureau,
        denial_reason:      denialReason || (outcome === 'no_response' ? 'No response received after required window' : 'Denied without sufficient reason'),
        follow_up_count:    currentLetter.follow_up_count || 0,
      });
      const text  = res?.data?.letter_content || res?.data?.content || res?.data?.letter || '';
      const newId = res?.data?.id || res?.data?.letter_id || null;
      setEscalationText(text);
      setGeneratedEscalationId(newId);
      setShowEscalation(true);
      await lettersAPI.updateStatus(currentLetter.id, { follow_up_count: round });
      setCurrentLetter(prev => ({ ...prev, follow_up_count: round }));
      await logActivity(
        'letter_escalated',
        `Escalation Letter Generated (Round ${round})`,
        `Follow-up for ${getLetterTypeLabel(currentLetter.letter_type)} to ${currentLetter.bureau || currentLetter.creditor_name}`,
        { original_letter_id: currentLetter.id, round }
      );
    } catch {
      Alert.alert('Error', 'Could not generate escalation letter. Please try again.');
    } finally {
      setEscalationLoading(false);
    }
  };

  const handleEscalationPaymentSuccess = async ({ cardData } = {}) => {
    setEscalationPaymentVisible(false);
    if (!cardData) {
      Alert.alert('Card Required', 'We could not read your card details. Please try again.');
      return;
    }
    setEscalationMailLoading(true);
    const targetId = generatedEscalationId || currentLetter.id;
    try {
      const res = await lettersAPI.mailViaUSPS(targetId, {
        recipientName, recipientAddress, recipientCity, recipientState, recipientZip, cardData,
      });
      const trackingNumber = res?.data?.tracking_number || null;
      const isBureau = ['equifax','experian','transunion'].some(b =>
        (currentLetter.bureau || '').toLowerCase().includes(b)
      );
      await scheduleLetterReminder(targetId, recipientName, isBureau);
      await logActivity(
        'letter_sent',
        'Escalation Letter Mailed',
        `Follow-up ${getLetterTypeLabel(currentLetter.letter_type)} sent to ${recipientName} via USPS`,
        { letter_id: targetId, letter_type: currentLetter.letter_type }
      );
      setShowEscalation(false);
      const trackingLine = trackingNumber ? `\n\nTracking: ${trackingNumber}` : '';
      Alert.alert('Escalation Letter Mailed!', `Your follow-up letter has been submitted via USPS. A reminder will be sent when follow-up is due.${trackingLine}`);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Mailing failed. Please try again.';
      Alert.alert('Mailing Error', msg);
    } finally {
      setEscalationMailLoading(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.handleBar} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{getLetterTypeLabel(currentLetter.letter_type)}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Metadata */}
            <View style={styles.detailSection}>
              {[
                { label: 'Bureau',   value: currentLetter.bureau || 'N/A' },
                { label: 'Account',  value: currentLetter.account_name || currentLetter.account_id || 'N/A' },
                { label: 'Status',   value: currentLetter.status || 'Draft', color: getStatusColor(currentLetter.status) },
                { label: 'Created',  value: formatDate(currentLetter.created_at) },
                { label: 'Sent',     value: formatDate(currentLetter.sent_date) },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={[styles.detailValue, color && { color }]}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Letter Content */}
            {currentLetter.content && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabel}>LETTER CONTENT</Text>
                <View style={styles.letterContentBox}>
                  <Text style={styles.letterContentText}>{currentLetter.content}</Text>
                </View>
                <AIDisclaimer style={styles.letterAIDisclaimer} />
              </View>
            )}

            {/* Signature Section */}
            <View style={styles.signatureSection}>
              <Text style={styles.inputLabel}>SIGNATURE</Text>
              {isSigned ? (
                <View style={styles.signedBadge}>
                  <Text style={styles.signedIcon}>✅</Text>
                  <View>
                    <Text style={styles.signedName}>{currentLetter.signature_name}</Text>
                    <Text style={styles.signedDate}>Signed {formatDate(currentLetter.signed_at)}</Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.signatureHint}>
                    Sign this letter with your finger. Your drawn signature is legally binding under the ESIGN Act and UETA.
                  </Text>
                  <TouchableOpacity
                    style={[styles.signBtn, consentLoading && { opacity: 0.6 }]}
                    onPress={handleOpenSignFlow}
                    disabled={consentLoading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.signBtnText}>
                      {consentLoading ? 'Loading…' : '✍  Sign Letter'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Mail via USPS */}
            {!isSent && (
              <View style={styles.mailSection}>
                <Text style={styles.inputLabel}>SEND VIA USPS</Text>
                {!showMailForm ? (
                  <TouchableOpacity
                    style={[styles.mailToggleBtn, !isSigned && styles.mailToggleBtnDisabled]}
                    onPress={() => isSigned ? setShowMailForm(true) : Alert.alert('Sign First', 'Sign the letter before mailing.')}
                  >
                    <Text style={styles.mailToggleBtnText}>Mail via USPS — $2.99</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.signatureHint}>Confirm the recipient address before mailing.</Text>
                    {[
                      { label: 'Recipient Name',    value: recipientName,    set: setRecipientName,    placeholder: 'Equifax Information Services LLC' },
                      { label: 'Street / PO Box',   value: recipientAddress, set: setRecipientAddress, placeholder: 'P.O. Box 740256' },
                      { label: 'City',              value: recipientCity,    set: setRecipientCity,    placeholder: 'Atlanta' },
                      { label: 'State',             value: recipientState,   set: setRecipientState,   placeholder: 'GA' },
                      { label: 'ZIP Code',          value: recipientZip,     set: setRecipientZip,     placeholder: '30374' },
                    ].map(({ label, value, set, placeholder }) => (
                      <View key={label}>
                        <Text style={styles.miniLabel}>{label.toUpperCase()}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={value}
                          onChangeText={set}
                          placeholder={placeholder}
                          placeholderTextColor={COLORS.textSecondary}
                          autoCapitalize="words"
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.mailSendBtn, mailLoading && { opacity: 0.7 }]}
                      onPress={handleMailConfirm}
                      disabled={mailLoading}
                    >
                      {mailLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.mailSendBtnText}>Pay & Send via USPS</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mailCancelBtn} onPress={() => setShowMailForm(false)}>
                      <Text style={styles.mailCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {isSent && (
              <View style={styles.mailedBanner}>
                <Text style={styles.mailedBannerText}>
                  ✅ Mailed via USPS on {formatDate(currentLetter.sent_date)}
                </Text>
              </View>
            )}

            {/* USPS Tracking Number */}
            {(currentLetter.tracking_number) && (
              <View style={styles.trackingCard}>
                <Text style={styles.inputLabel}>USPS TRACKING</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://tools.usps.com/go/TrackConfirmAction?tLabels=${currentLetter.tracking_number}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.trackingNumber}>{currentLetter.tracking_number}</Text>
                  <Text style={styles.trackingHint}>Tap to track on USPS.com →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Follow-up count badge */}
            {(currentLetter.follow_up_count > 0) && (
              <View style={styles.followUpBadge}>
                <Text style={styles.followUpBadgeText}>
                  📬 Follow-up #{currentLetter.follow_up_count} sent
                </Text>
              </View>
            )}

            {/* Response Tracking Section */}
            {isSent && (
              <View style={styles.responseSection}>
                <Text style={styles.inputLabel}>RESPONSE TRACKING</Text>
                {!currentLetter.outcome && !outcome ? (
                  <>
                    <Text style={styles.responseHint}>
                      Did this letter receive a response? Record the outcome to track your progress.
                    </Text>
                    <View style={styles.outcomeRow}>
                      {[
                        { key: 'accepted',    label: '✅ Accepted',     color: COLORS.success },
                        { key: 'declined',    label: '❌ Declined',     color: COLORS.danger  },
                        { key: 'no_response', label: '🔇 No Response',  color: COLORS.warning },
                      ].map(opt => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.outcomeBtn, { borderColor: opt.color }]}
                          onPress={() => setOutcome(opt.key)}
                        >
                          <Text style={[styles.outcomeBtnText, { color: opt.color }]}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={[styles.outcomeSaved, {
                    borderColor: (outcome || currentLetter.outcome) === 'accepted' ? COLORS.success
                               : (outcome || currentLetter.outcome) === 'declined'  ? COLORS.danger
                               : COLORS.warning
                  }]}>
                    <Text style={[styles.outcomeSavedText, {
                      color: (outcome || currentLetter.outcome) === 'accepted' ? COLORS.success
                           : (outcome || currentLetter.outcome) === 'declined'  ? COLORS.danger
                           : COLORS.warning
                    }]}>
                      {(outcome || currentLetter.outcome) === 'accepted' ? '✅ Accepted / Removed' :
                       (outcome || currentLetter.outcome) === 'declined'  ? '❌ Declined / Denied' :
                       '🔇 No Response Received'}
                    </Text>
                    {!currentLetter.outcome && (
                      <TouchableOpacity onPress={() => setOutcome(null)}>
                        <Text style={styles.outcomeChangeLink}>Change</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Denial reason input + save (only when selecting declined/no_response before saving) */}
                {!currentLetter.outcome && (outcome === 'declined' || outcome === 'no_response') && (
                  <>
                    <Text style={[styles.miniLabel, { marginTop: 12 }]}>
                      {outcome === 'declined' ? 'DENIAL REASON (OPTIONAL)' : 'NOTES (OPTIONAL)'}
                    </Text>
                    <TextInput
                      style={[styles.textInput, styles.textArea]}
                      value={denialReason}
                      onChangeText={setDenialReason}
                      placeholder={outcome === 'declined'
                        ? 'What reason did they give for the denial?'
                        : 'Any notes about the lack of response...'}
                      placeholderTextColor={COLORS.textSecondary}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.signBtn, updatingResponse && { opacity: 0.7 }]}
                      onPress={() => handleUpdateResponse(outcome)}
                      disabled={updatingResponse}
                    >
                      {updatingResponse
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.signBtnText}>Save Response</Text>
                      }
                    </TouchableOpacity>
                  </>
                )}

                {/* Save accepted */}
                {!currentLetter.outcome && outcome === 'accepted' && (
                  <TouchableOpacity
                    style={[styles.signBtn, { backgroundColor: COLORS.success, marginTop: 10 }, updatingResponse && { opacity: 0.7 }]}
                    onPress={() => handleUpdateResponse('accepted')}
                    disabled={updatingResponse}
                  >
                    {updatingResponse
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.signBtnText}>Confirm Accepted</Text>
                    }
                  </TouchableOpacity>
                )}

                {/* Saved denial reason display */}
                {currentLetter.denial_reason && (
                  <Text style={styles.denialReasonText}>Reason: {currentLetter.denial_reason}</Text>
                )}
              </View>
            )}

            {/* AI Escalation — shown when declined or no response */}
            {isSent && !showEscalation &&
              ((outcome === 'declined' || outcome === 'no_response') ||
               (currentLetter.outcome === 'declined' || currentLetter.outcome === 'no_response')) && (
              <View style={styles.escalationCard}>
                <View style={styles.escalationHeader}>
                  <Text style={styles.escalationIcon}>🤖</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.escalationTitle}>Generate Stronger Follow-Up Letter</Text>
                    <Text style={styles.escalationSubtitle}>
                      AI writes a more assertive letter citing FCRA §611 and §623 rights
                      {(currentLetter.follow_up_count || 0) > 0 ? ` · Round ${(currentLetter.follow_up_count || 0) + 1}` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.escalationBtn, escalationLoading && { opacity: 0.7 }]}
                  onPress={handleGenerateEscalation}
                  disabled={escalationLoading}
                >
                  {escalationLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.escalationBtnText}>Generating stronger letter...</Text>
                    </View>
                  ) : (
                    <Text style={styles.escalationBtnText}>Generate Follow-Up Letter</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Escalation Letter Preview */}
            {showEscalation && escalationText ? (
              <View style={styles.escalationPreview}>
                <View style={styles.escalationPreviewHeader}>
                  <Text style={styles.inputLabel}>FOLLOW-UP LETTER — REVIEW BEFORE SENDING</Text>
                  <TouchableOpacity onPress={() => setShowEscalation(false)}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Collapse</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.letterContentBox}>
                  <Text style={styles.letterContentText}>{escalationText}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.mailSendBtn, { marginTop: 12 }, escalationMailLoading && { opacity: 0.7 }]}
                  onPress={() => setEscalationPaymentVisible(true)}
                  disabled={escalationMailLoading}
                >
                  {escalationMailLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.mailSendBtnText}>Pay & Send Follow-Up via USPS</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Footer — View PDF */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.copyBtn, pdfLoading && { opacity: 0.7 }]}
              onPress={handleViewPdf}
              disabled={pdfLoading}
            >
              {pdfLoading
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.copyBtnText}>View / Download PDF</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Card collector — backend charges + mails atomically via /api/letters/:id/mail */}
      <PaymentModal
        visible={paymentVisible}
        onClose={() => setPaymentVisible(false)}
        onSuccess={handlePaymentSuccess}
        amount={2.99}
        description={`USPS first-class mailing — ${getLetterTypeLabel(currentLetter.letter_type)} to ${recipientName || currentLetter.bureau}`}
        mode="collect"
        submitLabel="Pay $2.99 & Send Letter"
      />

      {/* Card collector for escalation / follow-up letter mailing */}
      <PaymentModal
        visible={escalationPaymentVisible}
        onClose={() => setEscalationPaymentVisible(false)}
        onSuccess={handleEscalationPaymentSuccess}
        amount={2.99}
        description={`USPS first-class mailing — Follow-up letter to ${recipientName || currentLetter.bureau}`}
        mode="collect"
        submitLabel="Pay $2.99 & Send Follow-Up"
      />
    </Modal>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────
const LettersScreen = ({ route }) => {
  const { user } = useAuth();
  const [letters, setLetters]       = useState([]);
  const [accounts, setAccounts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState('all');
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [detailVisible, setDetailVisible]   = useState(false);
  const [generateVisible, setGenerateVisible] = useState(false);

  // Track a pending deep-link letterId (from push notification tap)
  const pendingOpenId = React.useRef(route?.params?.openLetterId ?? null);

  const fetchData = async () => {
    try {
      setError(null);
      const [lettersRes, accountsRes] = await Promise.all([
        lettersAPI.getAll().catch(() => ({ data: [] })),
        accountsAPI.getAll().catch(() => ({ data: [] })),
      ]);
      const lettersData  = lettersRes?.data  ?? lettersRes  ?? [];
      const accountsData = accountsRes?.data ?? accountsRes ?? [];
      setLetters(Array.isArray(lettersData)  ? lettersData  : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
    } catch (err) {
      console.error('[Letters] fetch error:', err);
      setError('Failed to load letters');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // keep local alias so retry button still works
  const fetchLetters = fetchData;

  useEffect(() => {
    if (user?.id) fetchData();
  }, [user?.id]);

  // Once letters are loaded, auto-open the one requested via notification deep-link
  useEffect(() => {
    if (!pendingOpenId.current || letters.length === 0) return;
    const target = letters.find(l => l.id === pendingOpenId.current);
    if (target) {
      setSelectedLetter(target);
      setDetailVisible(true);
      pendingOpenId.current = null;
    }
  }, [letters]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  const handleGenerate = async (params) => {
    const meta = user?.user_metadata ?? {};
    const enriched = {
      ...params,
      sender_name: meta.full_name || meta.name || user?.email || '',
      sender_address: meta.address || meta.mailing_address || '',
      sender_city: meta.city || '',
      sender_state: meta.state || '',
      sender_zip: meta.zip || meta.postal_code || '',
    };
    await lettersAPI.generate(enriched);
    // Award points for generating a letter (non-blocking)
    pointsAPI.award('generate_letter', 'Generated dispute letter', 30).catch(() => null);
    await fetchLetters();
    await logActivity(
      'letter_generated',
      'Dispute Letter Generated',
      `${getLetterTypeLabel(params.letter_type)} for ${params.account_name || 'account'} at ${params.bureau || 'bureau'}`,
      { letter_type: params.letter_type, bureau: params.bureau, account_name: params.account_name }
    );
    Alert.alert('Success', 'Letter generated successfully!');
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Letter', 'Are you sure you want to delete this letter?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await lettersAPI.delete(id);
            setLetters(prev => prev.filter(l => l.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete letter');
          }
        },
      },
    ]);
  };

  const matchesTab = (letterType, tab) => {
    const lt  = (letterType ?? '').toLowerCase();
    const key = tab.toLowerCase();
    if (key === 'bureau_dispute') return lt === 'bureau_dispute' || lt === 'dispute';
    if (key === 'debt_validation') return lt === 'debt_validation' || lt === 'validation';
    if (key === 'hardship') return lt === 'hardship' || lt === 'hardship_get_current';
    return lt === key;
  };

  const filteredLetters = activeTab === 'all'
    ? letters
    : letters.filter(l => matchesTab(l.letter_type, activeTab));

  // Counts per tab
  const tabCounts = Object.fromEntries(LETTER_TYPES.map(t => {
    if (t.key === 'all') return [t.key, letters.length];
    const count = letters.filter(l => matchesTab(l.letter_type, t.key)).length;
    return [t.key, count];
  }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dispute Letters</Text>
          <Text style={styles.subtitle}>{letters.length} letters total</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setGenerateVisible(true)}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Type Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {LETTER_TYPES.map(tab => {
          const active = activeTab === tab.key;
          const count = tabCounts[tab.key] ?? 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading letters...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLetters}
          keyExtractor={(item) => item.id?.toString() ?? Math.random().toString()}
          renderItem={({ item }) => (
            <LetterCard
              letter={item}
              onPress={(l) => { setSelectedLetter(l); setDetailVisible(true); }}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {error ? (
                <>
                  <Text style={styles.emptyIcon}>⚠️</Text>
                  <Text style={styles.emptyTitle}>{error}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={fetchLetters}>
                    <Text style={styles.retryBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.emptyIcon}>✉️</Text>
                  <Text style={styles.emptyTitle}>No Letters Yet</Text>
                  <Text style={styles.emptySubtext}>
                    {activeTab === 'all'
                      ? 'Generate your first dispute letter to get started.'
                      : 'No letters of this type found.'}
                  </Text>
                  {activeTab === 'all' && (
                    <TouchableOpacity style={styles.generateBtnEmpty} onPress={() => setGenerateVisible(true)}>
                      <Text style={styles.generateBtnText}>Generate First Letter</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
      )}

      {/* Modals */}
      <GenerateModal
        visible={generateVisible}
        onClose={() => setGenerateVisible(false)}
        onGenerate={handleGenerate}
        accounts={accounts}
      />
      <DetailModal
        letter={selectedLetter}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onLetterUpdated={() => {
          fetchLetters();
          // Refresh the selected letter from the updated list
          setSelectedLetter(prev => prev ? { ...prev } : prev);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  tabActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  tabBadgeTextActive: {
    color: COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Letter Card
  letterCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  letterCardHeader: {
    marginBottom: 10,
  },
  letterTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  letterTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  letterBureau: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  letterAccount: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  letterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  letterDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: COLORS.danger + '20',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
  },
  cardDeleteText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '500',
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  generateBtnEmpty: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  retryBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    paddingTop: 12,
    maxHeight: 500,
  },
  modalFooter: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  // Generate modal
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
  },
  typeSelectorScroll: {
    flexGrow: 0,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  typeChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  bureauRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bureauChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  generateBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  generateBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  // Detail modal
  detailSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '60',
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  contentSection: {
    marginBottom: 16,
  },
  letterContentBox: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  letterContentText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  letterAIDisclaimer: {
    marginTop: 10,
    fontSize: 10,
  },
  copyBtn: {
    backgroundColor: COLORS.staminaBlue,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  copyBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  // Signature section
  signatureSection: {
    marginTop: 20,
    marginBottom: 8,
  },
  signatureHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '20',
    borderWidth: 1,
    borderColor: COLORS.success + '50',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  signedIcon: {
    fontSize: 22,
  },
  signedName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    fontStyle: 'italic',
  },
  signedDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  signBtn: {
    backgroundColor: COLORS.staminaBlue,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  signBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  // Mail section
  mailSection: {
    marginTop: 20,
    marginBottom: 8,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 10,
  },
  mailToggleBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mailToggleBtnDisabled: {
    opacity: 0.45,
  },
  mailToggleBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  mailSendBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  mailSendBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },
  mailCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  mailCancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  mailedBanner: {
    backgroundColor: COLORS.success + '20',
    borderWidth: 1,
    borderColor: COLORS.success + '50',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  mailedBannerText: {
    color: COLORS.success,
    fontWeight: '600',
    fontSize: 14,
  },
  // Account picker
  accountPickerList: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  accountPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  accountPickerRowSelected: {
    backgroundColor: COLORS.purple + '15',
    borderColor: COLORS.purple,
    borderWidth: 1,
  },
  accountPickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  accountPickerInfo: {
    flex: 1,
  },
  accountPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  accountPickerMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  accountPickerCheck: {
    fontSize: 16,
    color: COLORS.purple,
    fontWeight: '700',
    marginLeft: 8,
  },
  noAccountsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noAccountsText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  // AI recommendation card
  recommendationCard: {
    backgroundColor: COLORS.purple + '18',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.purple + '50',
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  recommendationIcon: {
    fontSize: 16,
  },
  recommendationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.purple,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recommendationBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 10,
  },
  recommendationTags: {
    flexDirection: 'row',
    gap: 8,
  },
  recTag: {
    backgroundColor: COLORS.purple + '30',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.purple + '50',
  },
  recTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purple,
  },
  // Tracking
  trackingCard: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trackingNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  trackingHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  followUpBadge: {
    backgroundColor: COLORS.warning + '15',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    alignItems: 'center',
  },
  followUpBadgeText: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  // Response tracking
  responseSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  responseHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  outcomeBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  outcomeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  outcomeSaved: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1.5,
  },
  outcomeSavedText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  outcomeChangeLink: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginLeft: 8,
  },
  denialReasonText: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  // Escalation
  escalationCard: {
    marginTop: 16,
    backgroundColor: COLORS.purple + '10',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.purple + '40',
  },
  escalationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  escalationIcon: {
    fontSize: 28,
  },
  escalationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  escalationSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  escalationBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  escalationBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  escalationPreview: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.purple + '50',
    borderRadius: 12,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  escalationPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
});

export default LettersScreen;
