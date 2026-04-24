/**
 * PaymentModal — reusable Authorize.net payment sheet
 *
 * Props:
 *   visible        {boolean}
 *   onClose        {() => void}
 *   onSuccess      {(result) => void}  called with backend response on success
 *   amount         {number}            charge amount in USD (e.g. 1.99)
 *   description    {string}            shown to user & sent to backend
 *   mode           {'charge'|'subscribe'|'collect'}  default 'charge'
 *                   'collect' skips the server round-trip and returns
 *                   { cardData } to onSuccess — use when the caller will
 *                   submit card + payload to a different endpoint itself.
 *   planId         {string}            required when mode === 'subscribe'
 *   submitLabel    {string}            override button text
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { billingAPI } from '../services/api';

const COLORS = {
  background: '#0F172A',
  card:        '#1E293B',
  surface:     '#1e293b',
  text:        '#FFFFFF',
  textSecondary: '#64748B',
  border:      '#374151',
  primary:     '#1E40AF',
  purple:      '#7C3AED',
  success:     '#059669',
  danger:      '#DC2626',
  warning:     '#F97316',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatCardNumber = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
};

const formatExpiry = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

const getCardBrand = (number) => {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n))         return 'Visa';
  if (/^5[1-5]/.test(n))   return 'Mastercard';
  if (/^3[47]/.test(n))    return 'Amex';
  if (/^6(?:011|5)/.test(n)) return 'Discover';
  return '';
};

const validateCard = ({ cardNumber, expiryMonth, expiryYear, cvv, cardholderName }) => {
  const digits = cardNumber.replace(/\s/g, '');
  if (digits.length < 13) return 'Enter a valid card number.';
  if (!cardholderName.trim()) return 'Enter the cardholder name.';
  const month = parseInt(expiryMonth, 10);
  const year  = parseInt(`20${expiryYear}`, 10);
  if (!expiryMonth || !expiryYear || isNaN(month) || month < 1 || month > 12) return 'Enter a valid expiry date (MM/YY).';
  if (isNaN(year)) return 'Enter a valid expiry year.';
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return 'This card has expired.';
  }
  if (!cvv || cvv.length < 3) return 'Enter a valid CVV.';
  return null;
};

// ─── Saved Card Row ────────────────────────────────────────────────────────────
const SavedCardRow = ({ method, selected, onSelect }) => (
  <TouchableOpacity
    style={[styles.savedCard, selected && styles.savedCardSelected]}
    onPress={() => onSelect(method)}
    activeOpacity={0.7}
  >
    <View style={styles.savedCardLeft}>
      <Text style={styles.savedCardBrand}>{method.card_brand || 'Card'}</Text>
      <Text style={styles.savedCardNumber}>•••• {method.last_four}</Text>
      <Text style={styles.savedCardExpiry}>Expires {method.expiry_month}/{method.expiry_year}</Text>
    </View>
    <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
      {selected && <View style={styles.radioDot} />}
    </View>
  </TouchableOpacity>
);

// ─── PaymentModal ──────────────────────────────────────────────────────────────
const PaymentModal = ({
  visible,
  onClose,
  onSuccess,
  amount,
  description,
  mode = 'charge',
  planId,
  submitLabel,
  promoPrice,
}) => {
  const [savedMethods, setSavedMethods]     = useState([]);
  const [selectedSaved, setSelectedSaved]   = useState(null);
  const [useNewCard, setUseNewCard]         = useState(false);
  const [savingCard, setSavingCard]         = useState(false);
  const [loading, setLoading]               = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);

  // New card fields
  const [cardNumber, setCardNumber]         = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expiry, setExpiry]                 = useState('');
  const [cvv, setCvv]                       = useState('');

  useEffect(() => {
    if (visible) {
      loadSavedMethods();
      // Reset new-card form
      setCardNumber('');
      setCardholderName('');
      setExpiry('');
      setCvv('');
      setSavingCard(false);
    }
  }, [visible]);

  const loadSavedMethods = async () => {
    setLoadingMethods(true);
    try {
      const res = await billingAPI.getPaymentMethods();
      const methods = res?.data?.payment_methods ?? res?.data ?? [];
      setSavedMethods(Array.isArray(methods) ? methods : []);
      if (methods.length > 0) {
        setSelectedSaved(methods[0]);
        setUseNewCard(false);
      } else {
        setUseNewCard(true);
      }
    } catch {
      setSavedMethods([]);
      setUseNewCard(true);
    } finally {
      setLoadingMethods(false);
    }
  };

  const handleSubmit = async () => {
    if (useNewCard || !selectedSaved) {
      // Validate new card fields
      const [month, year] = expiry.split('/');
      const cardData = { cardNumber, cardholderName, expiryMonth: month, expiryYear: year, cvv };
      const error = validateCard(cardData);
      if (error) {
        Alert.alert('Invalid Card', error);
        return;
      }

      // mode='collect' — hand the validated card back to the caller without
      // hitting any server. The caller submits card + payload to its own
      // endpoint (e.g. /api/letters/:id/mail which does charge+mail atomically).
      if (mode === 'collect') {
        onSuccess?.({ cardData });
        onClose();
        return;
      }

      setLoading(true);
      try {
        let result;
        if (mode === 'subscribe') {
          result = await billingAPI.subscribe({ planId, cardData });
        } else {
          result = await billingAPI.charge({ amount, description, cardData });
        }
        if (savingCard) {
          await billingAPI.savePaymentMethod(cardData).catch(() => null); // non-critical
        }
        onSuccess?.(result?.data ?? result);
        onClose();
      } catch (err) {
        const msg = err?.response?.data?.error
          || err?.response?.data?.message
          || 'Payment failed. Please check your card details and try again.';
        Alert.alert('Payment Failed', msg);
      } finally {
        setLoading(false);
      }
    } else {
      // Charge saved card
      setLoading(true);
      try {
        let result;
        if (mode === 'subscribe') {
          result = await billingAPI.subscribe({ planId, savedProfileId: selectedSaved.profile_id });
        } else {
          result = await billingAPI.charge({ amount, description, savedProfileId: selectedSaved.profile_id });
        }
        onSuccess?.(result?.data ?? result);
        onClose();
      } catch (err) {
        const msg = err?.response?.data?.error
          || err?.response?.data?.message
          || 'Payment failed. Please try again.';
        Alert.alert('Payment Failed', msg);
      } finally {
        setLoading(false);
      }
    }
  };

  const cardBrand  = getCardBrand(cardNumber);
  const buttonText = submitLabel
    ?? (mode === 'subscribe'
      ? (amount != null ? `Subscribe — $${Number(amount).toFixed(2)}/mo` : 'Start Subscription')
      : (amount != null ? `Pay $${Number(amount).toFixed(2)}` : 'Submit Payment'));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {mode === 'subscribe' ? 'Start Subscription' : 'Payment'}
              </Text>
              {description ? (
                <Text style={styles.subtitle}>{description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Amount badge */}
          {amount > 0 && (
            <View style={styles.amountBadge}>
              <Text style={styles.amountText}>${Number(amount).toFixed(2)}</Text>
              <Text style={styles.amountSub}>via Authorize.net · Secure</Text>
            </View>
          )}

          {/* Promo rate badge */}
          {promoPrice != null && (
            <View style={styles.promoBadge}>
              <Text style={styles.promoIcon}>🧪</Text>
              <Text style={styles.promoText}>
                Test User Rate — ${Number(promoPrice).toFixed(2)}/mo for the life of your account
              </Text>
            </View>
          )}

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Saved payment methods */}
            {loadingMethods ? (
              <ActivityIndicator color={COLORS.purple} style={{ marginVertical: 16 }} />
            ) : savedMethods.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>SAVED CARDS</Text>
                {savedMethods.map((m) => (
                  <SavedCardRow
                    key={m.profile_id}
                    method={m}
                    selected={!useNewCard && selectedSaved?.profile_id === m.profile_id}
                    onSelect={(method) => { setSelectedSaved(method); setUseNewCard(false); }}
                  />
                ))}
                <TouchableOpacity
                  style={[styles.toggleNewCard, useNewCard && styles.toggleNewCardActive]}
                  onPress={() => setUseNewCard(v => !v)}
                >
                  <Text style={[styles.toggleNewCardText, useNewCard && styles.toggleNewCardTextActive]}>
                    {useNewCard ? '− Use a saved card' : '+ Use a different card'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            {/* New card form */}
            {(useNewCard || savedMethods.length === 0) && (
              <>
                <Text style={styles.sectionLabel}>CARD DETAILS</Text>

                {/* Cardholder */}
                <Text style={styles.fieldLabel}>CARDHOLDER NAME</Text>
                <TextInput
                  style={styles.input}
                  value={cardholderName}
                  onChangeText={setCardholderName}
                  placeholder="Full name on card"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="words"
                  autoComplete="name"
                />

                {/* Card number */}
                <Text style={styles.fieldLabel}>CARD NUMBER {cardBrand ? `· ${cardBrand}` : ''}</Text>
                <TextInput
                  style={styles.input}
                  value={cardNumber}
                  onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                  placeholder="1234 5678 9012 3456"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={19}
                  autoComplete="cc-number"
                />

                {/* Expiry + CVV */}
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={styles.fieldLabel}>EXPIRY (MM/YY)</Text>
                    <TextInput
                      style={styles.input}
                      value={expiry}
                      onChangeText={(t) => setExpiry(formatExpiry(t))}
                      placeholder="MM/YY"
                      placeholderTextColor={COLORS.textSecondary}
                      keyboardType="number-pad"
                      maxLength={5}
                      autoComplete="cc-exp"
                    />
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.fieldLabel}>CVV</Text>
                    <TextInput
                      style={styles.input}
                      value={cvv}
                      onChangeText={(t) => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123"
                      placeholderTextColor={COLORS.textSecondary}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      autoComplete="cc-csc"
                    />
                  </View>
                </View>

                {/* Save card toggle */}
                <TouchableOpacity
                  style={styles.saveCardRow}
                  onPress={() => setSavingCard(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, savingCard && styles.checkboxChecked]}>
                    {savingCard && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.saveCardText}>Save card for future payments</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Security note */}
            <View style={styles.securityNote}>
              <Text style={styles.securityIcon}>🔒</Text>
              <Text style={styles.securityText}>
                Payments are processed securely through Authorize.net. Credit Stamina never stores your full card number.
              </Text>
            </View>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Pay button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.payBtn, loading && styles.payBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.payBtnText}>{buttonText}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '55%',
    flexShrink: 1,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
    maxWidth: 260,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  amountBadge: {
    backgroundColor: COLORS.primary + '20',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary + '40',
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  amountSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  promoBadge: {
    backgroundColor: COLORS.success + '15',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.success + '30',
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoIcon: {
    fontSize: 16,
  },
  promoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  savedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  savedCardLeft: {
    flex: 1,
  },
  savedCardBrand: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  savedCardNumber: {
    fontSize: 15,
    color: COLORS.text,
    marginTop: 2,
    letterSpacing: 1,
  },
  savedCardExpiry: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  toggleNewCard: {
    paddingVertical: 10,
    marginBottom: 12,
  },
  toggleNewCardActive: {},
  toggleNewCardText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  toggleNewCardTextActive: {
    color: COLORS.textSecondary,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  saveCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  saveCardText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  securityNote: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
    gap: 8,
    alignItems: 'flex-start',
  },
  securityIcon: {
    fontSize: 16,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  payBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});

export default PaymentModal;
