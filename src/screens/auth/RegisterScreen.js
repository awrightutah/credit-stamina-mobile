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

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

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
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

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
      setError(err.message || 'Failed to create account');
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
            onChangeText={setPhone}
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
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Minimum 6 characters"
            placeholderTextColor={COLORS.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
        </Field>

        <Field label="Confirm Password *">
          <TextInput
            ref={confirmRef}
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor={COLORS.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => promoRef.current?.focus()}
          />
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowFlex2: { flex: 2 },
  rowFlex1: { flex: 1 },
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
