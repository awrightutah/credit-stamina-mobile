import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { smsAPI } from '../services/api';
import AddressAutocomplete from '../components/AddressAutocomplete';

const COLORS = {
  primary: '#1E40AF',
  purple: '#7C3AED',
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  success: '#059669',
};

const Field = ({ label, hint, children }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    {children}
  </View>
);

const EditProfileScreen = ({ navigation }) => {
  const { user, updateProfile } = useAuth();
  const meta = user?.user_metadata ?? {};

  const [fullName,  setFullName]  = useState(meta.full_name ?? '');
  const [phone,     setPhone]     = useState(meta.phone ?? '');
  const [street,    setStreet]    = useState(meta.address_street ?? '');
  const [city,      setCity]      = useState(meta.address_city ?? '');
  const [stateVal,  setStateVal]  = useState(meta.address_state ?? '');
  const [zip,       setZip]       = useState(meta.address_zip ?? '');

  // Called when user selects a Google Places suggestion
  const handleAddressSelect = ({ street: s, city: c, state: st, zip: z }) => {
    if (s) setStreet(s);
    if (c) setCity(c);
    if (st) setStateVal(st);
    if (z) setZip(z);
  };

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

  // Phone verification state
  const [verifyVisible,  setVerifyVisible]  = useState(false);
  const [verifyCode,     setVerifyCode]     = useState('');
  const [verifyError,    setVerifyError]    = useState('');
  const [verifying,      setVerifying]      = useState(false);
  const [phoneSending,   setPhoneSending]   = useState(false);
  const [phoneVerified,  setPhoneVerified]  = useState(!!meta.phone_verified);
  // Track the originally saved phone so we know if the user changed it
  const savedPhone = meta.phone ?? '';

  const phoneRef  = useRef(null);
  const streetRef = useRef(null);
  const cityRef   = useRef(null);
  const stateRef  = useRef(null);
  const zipRef    = useRef(null);

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSaved(false);

      await updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address_street: street.trim(),
        address_city: city.trim(),
        address_state: stateVal.trim().toUpperCase(),
        address_zip: zip.trim(),
      });

      setSaved(true);
      // Brief delay so the user sees the confirmation, then go back
      setTimeout(() => navigation.goBack(), 1000);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerification = async () => {
    const cleaned = phone.trim();
    if (!cleaned) return;
    setPhoneSending(true);
    setVerifyError('');
    try {
      await smsAPI.sendVerification(cleaned);
      setVerifyCode('');
      setVerifyVisible(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not send verification code. Check the number and try again.');
    } finally {
      setPhoneSending(false);
    }
  };

  const handleConfirmVerification = async () => {
    if (!verifyCode.trim()) {
      setVerifyError('Please enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    setVerifyError('');
    try {
      await smsAPI.confirmVerification(verifyCode.trim());
      // Mark phone as verified in profile metadata
      await updateProfile({ phone_verified: true });
      setPhoneVerified(true);
      setVerifyVisible(false);
    } catch (err) {
      setVerifyError(err?.response?.data?.error || 'Incorrect code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Error */}
          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Success */}
          {saved && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>✓ Profile saved successfully</Text>
            </View>
          )}

          {/* Personal Info */}
          <Text style={styles.sectionLabel}>PERSONAL INFO</Text>

          <Field label="Full Name *">
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="First and last name"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          </Field>

          <View style={styles.fieldWrap}>
            <View style={styles.phoneLabelRow}>
              <Text style={styles.label}>Phone Number</Text>
              {phoneVerified && phone.trim() === savedPhone ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
                </View>
              ) : phone.trim() && phone.trim() !== savedPhone ? (
                <Text style={styles.unverifiedText}>Not verified</Text>
              ) : null}
            </View>
            <TextInput
              ref={phoneRef}
              style={styles.input}
              value={phone}
              onChangeText={(v) => { setPhone(v); setPhoneVerified(false); }}
              placeholder="(555) 555-5555"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => streetRef.current?.focus()}
            />
            {phone.trim() && (!phoneVerified || phone.trim() !== savedPhone) && (
              <TouchableOpacity
                style={styles.verifyPhoneBtn}
                onPress={handleSendVerification}
                disabled={phoneSending}
              >
                {phoneSending
                  ? <ActivityIndicator size="small" color={COLORS.purple} />
                  : <Text style={styles.verifyPhoneBtnText}>Send Verification Code</Text>
                }
              </TouchableOpacity>
            )}
            <Text style={styles.hint}>Required for SMS reminders</Text>
          </View>

          {/* Mailing Address */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MAILING ADDRESS</Text>
          <Text style={styles.sectionHint}>Used to pre-fill your dispute letters</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Street Address</Text>
            <AddressAutocomplete
              initialValue={street}
              placeholder="123 Main St, Apt 4B"
              onSelect={handleAddressSelect}
              onChangeText={setStreet}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowFlex2}>
              <Field label="City">
                <TextInput
                  ref={cityRef}
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => stateRef.current?.focus()}
                />
              </Field>
            </View>
            <View style={[styles.rowFlex1, { marginLeft: 10 }]}>
              <Field label="State">
                <TextInput
                  ref={stateRef}
                  style={styles.input}
                  value={stateVal}
                  onChangeText={setStateVal}
                  placeholder="TX"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="characters"
                  maxLength={2}
                  returnKeyType="next"
                  onSubmitEditing={() => zipRef.current?.focus()}
                />
              </Field>
            </View>
          </View>

          <Field label="ZIP Code">
            <TextInput
              ref={zipRef}
              style={styles.input}
              value={zip}
              onChangeText={setZip}
              placeholder="75001"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </Field>

          {/* Account info (read-only) */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACCOUNT</Text>

          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Email</Text>
            <Text style={styles.readonlyValue}>{user?.email}</Text>
          </View>
          <Text style={styles.readonlyHint}>To change your email or password, contact support.</Text>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Phone OTP verification modal */}
      <Modal visible={verifyVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify Your Phone</Text>
            <Text style={styles.modalSubtitle}>
              We sent a 6-digit code to {phone.trim()}. Enter it below to activate SMS reminders.
            </Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              value={verifyCode}
              onChangeText={setVerifyCode}
              placeholder="000000"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            {!!verifyError && (
              <Text style={styles.otpError}>{verifyError}</Text>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, verifying && styles.saveBtnDisabled, { marginTop: 8 }]}
              onPress={handleConfirmVerification}
              disabled={verifying}
            >
              {verifying
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Confirm Code</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendBtn}
              onPress={handleSendVerification}
              disabled={phoneSending}
            >
              <Text style={styles.resendBtnText}>
                {phoneSending ? 'Sending...' : 'Resend Code'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelVerifyBtn}
              onPress={() => setVerifyVisible(false)}
            >
              <Text style={styles.cancelVerifyBtnText}>Cancel</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    color: COLORS.primary,
    fontSize: 15,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  errorBanner: {
    backgroundColor: COLORS.danger + '20',
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  successBanner: {
    backgroundColor: COLORS.success + '20',
    borderWidth: 1,
    borderColor: COLORS.success + '60',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: COLORS.success,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowFlex2: { flex: 2 },
  rowFlex1: { flex: 1 },
  readonlyField: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  readonlyLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  readonlyValue: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  readonlyHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 24,
    paddingHorizontal: 2,
  },
  saveBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  // Phone verification
  phoneLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  verifiedBadge: {
    backgroundColor: COLORS.success + '25',
    borderWidth: 1,
    borderColor: COLORS.success + '50',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verifiedBadgeText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
  },
  unverifiedText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  verifyPhoneBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.purple + '60',
    borderRadius: 10,
    backgroundColor: COLORS.purple + '15',
  },
  verifyPhoneBtnText: {
    fontSize: 13,
    color: COLORS.purple,
    fontWeight: '600',
  },
  // OTP modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  otpError: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  resendBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  resendBtnText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelVerifyBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelVerifyBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});

export default EditProfileScreen;
