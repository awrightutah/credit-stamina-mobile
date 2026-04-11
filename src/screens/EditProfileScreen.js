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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  primary: '#1E40AF',
  purple: '#7C3AED',
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
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

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

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

          <Field label="Phone Number">
            <TextInput
              ref={phoneRef}
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 555-5555"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => streetRef.current?.focus()}
            />
          </Field>

          {/* Mailing Address */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MAILING ADDRESS</Text>
          <Text style={styles.sectionHint}>Used to pre-fill your dispute letters</Text>

          <Field label="Street Address">
            <TextInput
              ref={streetRef}
              style={styles.input}
              value={street}
              onChangeText={setStreet}
              placeholder="123 Main St, Apt 4B"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
            />
          </Field>

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
});

export default EditProfileScreen;
