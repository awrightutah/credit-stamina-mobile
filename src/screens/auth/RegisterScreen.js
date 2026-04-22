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
  Linking,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { supabase } from '../../services/supabase';
import { statesAPI } from '../../services/api';
import { friendlyAuthError } from '../../utils/authErrors';

const formatPhone = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

const COLORS = {
  primary: '#1E40AF',
  purple: '#7C3AED',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  danger: '#EF4444',
  success: '#10B981',
  inputBg: '#1E293B',
};

const Field = ({ label, children }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();

  // Personal info
  const [fullName, setFullName]       = useState('');
  const [phone, setPhone]             = useState('');

  // Address
  const [street, setStreet]           = useState('');
  const [city, setCity]               = useState('');
  const [state, setState]             = useState('');
  const [zip, setZip]                 = useState('');

  // Account
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [promoCode, setPromoCode]     = useState('');

  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState(false);
  const [croaConsent, setCroaConsent]       = useState(false);
  const [showPassword, setShowPass]         = useState(false);
  const [showConfirmPass, setShowConfirm]   = useState(false);

  // Called when user selects a Google Places suggestion
  const handleAddressSelect = ({ street: s, city: c, state: st, zip: z }) => {
    if (s) setStreet(s);
    if (c) setCity(c);
    if (st) setState(st);
    if (z) setZip(z);
  };

  // Refs for keyboard next
  const phoneRef     = useRef(null);
  const streetRef    = useRef(null);
  const cityRef      = useRef(null);
  const stateRef     = useRef(null);
  const zipRef       = useRef(null);
  const emailRef     = useRef(null);
  const passwordRef  = useRef(null);
  const confirmRef   = useRef(null);
  const promoRef     = useRef(null);

  const handleRegister = async () => {
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!phone.trim())    { setError('Please enter your phone number'); return; }
    if (!street.trim())   { setError('Please enter your street address'); return; }
    if (!city.trim())     { setError('Please enter your city'); return; }
    if (!state.trim())    { setError('Please enter your state'); return; }
    if (!zip.trim())      { setError('Please enter your ZIP code'); return; }
    if (!email.trim())    { setError('Please enter your email'); return; }
    if (!password)        { setError('Please create a password'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!croaConsent) { setError('Please review and acknowledge the required disclosures to continue.'); return; }

    // Check state availability before anything else
    try {
      const stateActive = await statesAPI.isStateActive(state.trim());
      if (!stateActive) {
        setError(
          `Credit Stamina is not yet available in ${state.trim().toUpperCase()}. ` +
          `We are expanding to new states regularly — please check back soon or contact support@creditstamina.com to be notified when we launch in your state.`
        );
        return;
      }
    } catch {
      // If state check fails (network error), allow registration to continue
      // so a Supabase outage doesn't block all signups
    }

    // Validate promo code if provided
    let promoData = null;
    if (promoCode.trim()) {
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, price, uses_count, max_uses, is_active')
        .eq('code', promoCode.trim().toUpperCase())
        .single();
      if (promoErr || !promo) {
        setError('Invalid promo code. Please check and try again.');
        return;
      }
      if (!promo.is_active) {
        setError('This promo code is no longer active.');
        return;
      }
      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        setError('This promo code has reached its usage limit.');
        return;
      }
      promoData = promo;
    }

    try {
      setLoading(true);
      setError('');
      const data = await register(email.trim().toLowerCase(), password, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
        },
      });

      // Apply promo to profile if a valid code was provided
      if (promoData) {
        const userId = data?.user?.id;
        if (userId) {
          await supabase.from('profiles').upsert({
            id: userId,
            promo_price: promoData.price,
            is_test_user: true,
            promo_code_id: promoData.id,
          }, { onConflict: 'id' }).catch(() => null);
          // Increment uses_count (non-critical)
          await supabase.from('promo_codes')
            .update({ uses_count: (promoData.uses_count ?? 0) + 1 })
            .eq('id', promoData.id)
            .catch(() => null);
        }
      }

      setSuccess(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✉️</Text>
          </View>
          <Text style={styles.successTitle}>Almost There!</Text>
          <Text style={styles.successText}>
            We sent a confirmation link to{'\n'}
            <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{email}</Text>
            {'\n\n'}Tap the link in that email to verify your account, then come back and sign in.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
          <Text style={styles.resendNote}>
            Didn't get it? Check your spam folder or{' '}
            <Text
              style={{ color: COLORS.primary }}
              onPress={() => {
                setSuccess(false);
                setEmail(email);
              }}
            >try a different email</Text>.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start your credit repair journey</Text>
        </View>

        {/* Error banner */}
        {!!error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Personal Info ── */}
        <Text style={styles.sectionLabel}>PERSONAL INFO</Text>

        <Field label="Full Name *">
          <TextInput
            style={styles.input}
            placeholder="First and last name"
            placeholderTextColor={COLORS.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
        </Field>

        <Field label="Phone Number *">
          <TextInput
            ref={phoneRef}
            style={styles.input}
            placeholder="(555) 555-5555"
            placeholderTextColor={COLORS.textSecondary}
            value={phone}
            onChangeText={(text) => setPhone(formatPhone(text))}
            keyboardType="phone-pad"
            returnKeyType="next"
            onSubmitEditing={() => streetRef.current?.focus()}
          />
        </Field>

        {/* ── Mailing Address ── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MAILING ADDRESS</Text>
        <Text style={styles.sectionHint}>Used for generating dispute letters</Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Street Address *</Text>
          <AddressAutocomplete
            initialValue={street}
            placeholder="123 Main St, Apt 4B"
            onSelect={handleAddressSelect}
            onChangeText={setStreet}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowFlex2}>
            <Field label="City *">
              <TextInput
                ref={cityRef}
                style={styles.input}
                placeholder="City"
                placeholderTextColor={COLORS.textSecondary}
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => stateRef.current?.focus()}
              />
            </Field>
          </View>
          <View style={[styles.rowFlex1, { marginLeft: 10 }]}>
            <Field label="State *">
              <TextInput
                ref={stateRef}
                style={styles.input}
                placeholder="TX"
                placeholderTextColor={COLORS.textSecondary}
                value={state}
                onChangeText={setState}
                autoCapitalize="characters"
                maxLength={2}
                returnKeyType="next"
                onSubmitEditing={() => zipRef.current?.focus()}
              />
            </Field>
          </View>
        </View>

        <Field label="ZIP Code *">
          <TextInput
            ref={zipRef}
            style={styles.input}
            placeholder="75001"
            placeholderTextColor={COLORS.textSecondary}
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </Field>

        {/* ── Account ── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACCOUNT</Text>

        <Field label="Email *">
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </Field>

        <Field label="Password *">
          <View style={styles.inputWrapper}>
            <TextInput
              ref={passwordRef}
              style={styles.inputInner}
              placeholder="Minimum 8 characters"
              placeholderTextColor={COLORS.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Field label="Confirm Password *">
          <View style={styles.inputWrapper}>
            <TextInput
              ref={confirmRef}
              style={styles.inputInner}
              placeholder="Re-enter password"
              placeholderTextColor={COLORS.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPass}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => promoRef.current?.focus()}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeText}>{showConfirmPass ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </Field>

        {/* ── Promo Code (optional) ── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>PROMO CODE</Text>
        <Field label="Promo Code (Optional)">
          <TextInput
            ref={promoRef}
            style={styles.input}
            placeholder="Enter code if you have one"
            placeholderTextColor={COLORS.textSecondary}
            value={promoCode}
            onChangeText={setPromoCode}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />
        </Field>

        {/* ── CROA Required Disclosure ── */}
        <View style={styles.croaBox}>
          <Text style={styles.croaTitle}>Required Legal Disclosures (CROA)</Text>
          <Text style={styles.croaText}>
            Under the Credit Repair Organizations Act (15 U.S.C. §1679 et seq.):
            {'\n\n'}• You have the right to dispute inaccurate information in your credit report
            directly with the credit bureau at no charge.
            {'\n\n'}• Credit Stamina cannot remove accurate, timely information from your credit
            report, and cannot guarantee any specific result.
            {'\n\n'}• You may cancel your membership within 3 business days of signing up, without
            penalty, by emailing support@creditstamina.com.
            {'\n\n'}• Credit Stamina will not charge any fee until after the agreed-upon services
            have been fully performed.
          </Text>
          <TouchableOpacity
            style={styles.croaCheckRow}
            onPress={() => setCroaConsent(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.croaCheckbox, croaConsent && styles.croaCheckboxChecked]}>
              {croaConsent && <Text style={styles.croaCheckmark}>✓</Text>}
            </View>
            <Text style={styles.croaCheckLabel}>
              I have read and understand my rights under the CROA
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={styles.termsContainer}>
          <Text style={styles.termsText}>
            By creating an account, you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://creditstamina.com/terms').catch(() => {})}
            >Terms of Service</Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://creditstamina.com/privacy').catch(() => {})}
            >Privacy Policy</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    color: COLORS.primary,
    fontSize: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 4,
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
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  inputInner: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  eyeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowFlex2: { flex: 2 },
  rowFlex1: { flex: 1 },
  croaBox: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  croaTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  croaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  croaCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  croaCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#334155',
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  croaCheckboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  croaCheckmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  croaCheckLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
    fontWeight: '500',
  },
  button: {
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  termsContainer: {
    marginTop: 20,
    paddingHorizontal: 8,
  },
  termsText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.primary,
  },
  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIconText: {
    fontSize: 40,
    color: COLORS.text,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  successText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  resendNote: {
    marginTop: 16,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RegisterScreen;
