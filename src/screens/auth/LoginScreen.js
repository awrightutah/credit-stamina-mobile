import React, { useState, useEffect, useCallback } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { friendlyAuthError } from '../../utils/authErrors';
import {
  checkBiometricAvailability,
  getBiometricLabel,
  getBiometricIcon,
  authenticateWithBiometrics,
  saveBiometricSession,
  getBiometricSession,
  getLastBiometricUserId,
  recordBiometricAuthTime,
  isBiometricAuthRecent,
  updateBiometricSession,
  clearBiometricAuthTime,
} from '../../services/biometrics';

const COLORS = {
  primary:       '#3B82F6',
  secondary:     '#10B981',
  background:    '#0F172A',
  card:          '#1E293B',
  text:          '#F8FAFC',
  textSecondary: '#94A3B8',
  border:        '#334155',
  danger:        '#EF4444',
  inputBg:       '#1E293B',
  biometric:     '#7C3AED',
};

const LoginScreen = ({ navigation }) => {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPass] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const { login, session, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();

  // Show session-expired message (set by AuthContext when refresh token is stale)
  useEffect(() => {
    if (sessionExpiredMessage) {
      setError(sessionExpiredMessage);
      clearSessionExpiredMessage?.();
    }
  }, [sessionExpiredMessage]);

  // Biometric state
  const [bioAvailable, setBioAvailable]   = useState(false);
  const [biometryType, setBiometryType]   = useState(null);
  const [bioLoading, setBioLoading]       = useState(false);
  const [storedUserId, setStoredUserId]   = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // ── Check biometric availability on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { available, biometryType: type } = await checkBiometricAvailability();
        if (cancelled) return;
        if (!available) { setShowPasswordForm(true); return; }

        setBioAvailable(true);
        setBiometryType(type);

        const userId = await getLastBiometricUserId();
        if (cancelled || !userId) { setShowPasswordForm(true); return; }

        const stored = await getBiometricSession(userId);
        if (cancelled || !stored) { setShowPasswordForm(true); return; }

        setStoredUserId(userId);

        // If auth was within the last 15 min, silently restore the session
        const recentAuth = await isBiometricAuthRecent();
        if (cancelled) return;

        if (recentAuth) {
          setBioLoading(true);
          try {
            const { data, error: sessErr } = await Promise.race([
              supabase.auth.setSession({
                access_token: stored.access_token,
                refresh_token: stored.refresh_token,
              }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
            ]);
            if (sessErr) throw sessErr;
            if (!data?.session) throw new Error('No session returned');
            // Persist refreshed tokens so next launch has fresh ones
            updateBiometricSession(data.session.user.id, data.session).catch(() => null);
            // AuthContext's onAuthStateChange fires and navigates away — nothing else to do
          } catch {
            if (!cancelled) {
              await clearBiometricAuthTime(); // prevent infinite remount loop
              setBioLoading(false);
              setShowPasswordForm(true);
            }
          }
          return;
        }

        // Show biometric button — triggerBiometric called by user tap or auto-prompt
        triggerBiometric(userId, stored);
      } catch {
        if (!cancelled) setShowPasswordForm(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Biometric authentication ────────────────────────────────────────────────
  // NOTE: bioLoading is only set TRUE after Face ID succeeds, during session restore.
  // This prevents the screen getting permanently stuck if the prompt stalls.
  const triggerBiometric = useCallback(async (userId, stored) => {
    setError('');

    const label = getBiometricLabel(biometryType);
    const { success, cancelled: userCancelled, error: bioError } = await authenticateWithBiometrics(
      `Sign in to Credit Stamina with ${label}`
    );

    if (success) {
      // Face ID passed — now restore the session (show spinner only during this step)
      setBioLoading(true);
      try {
        const { data, error: sessErr } = await Promise.race([
          supabase.auth.setSession({
            access_token: stored.access_token,
            refresh_token: stored.refresh_token,
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
        ]);
        if (sessErr) throw sessErr;
        if (!data?.session) throw new Error('No session returned');
        // Persist refreshed tokens
        updateBiometricSession(data.session.user.id, data.session).catch(() => null);
        await recordBiometricAuthTime();
        // AuthContext's onAuthStateChange fires and navigates away
      } catch {
        await clearBiometricAuthTime(); // prevent remount loop on next render
        setBioLoading(false);
        setShowPasswordForm(true);
        setError('Your session has expired. Please sign in with your password.');
      }
    } else if (userCancelled) {
      setShowPasswordForm(true);
    } else {
      setShowPasswordForm(true);
      if (bioError) setError('Biometric authentication failed. Please use your password.');
    }
  }, [biometryType]);

  const handleBiometricPress = () => {
    if (!storedUserId) return;
    getBiometricSession(storedUserId).then(stored => {
      if (stored) {
        triggerBiometric(storedUserId, stored);
      } else {
        setShowPasswordForm(true);
        setError('Biometric login unavailable. Please sign in with your password.');
      }
    });
  };

  // ── Password login ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await login(email.trim().toLowerCase(), password);
      await recordBiometricAuthTime();

      // After successful password login, offer to enable Face ID / Touch ID
      // — only if not already enrolled for this user
      if (bioAvailable) {
        const label  = getBiometricLabel(biometryType);
        const userId = data?.user?.id ?? data?.session?.user?.id;
        const sess   = data?.session;

        if (userId && sess) {
          const alreadyEnrolled = await getBiometricSession(userId);
          if (!alreadyEnrolled) {
            setTimeout(() => {
              Alert.alert(
                `Enable ${label}?`,
                `Sign in faster next time using ${label} instead of your password.`,
                [
                  { text: 'Not Now', style: 'cancel' },
                  {
                    text: `Enable ${label}`,
                    onPress: async () => {
                      const { success } = await authenticateWithBiometrics(
                        `Confirm to enable ${label} for Credit Stamina`
                      );
                      if (success) {
                        await saveBiometricSession(userId, sess);
                        setStoredUserId(userId);
                      }
                    },
                  },
                ]
              );
            }, 500);
          }
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const bioLabel = getBiometricLabel(biometryType);
  const bioIcon  = getBiometricIcon(biometryType);

  // Show spinner while biometric prompt is launching / session restoring
  if (bioLoading) {
    return (
      <View style={styles.bioLoadingContainer}>
        <View style={styles.bioLoadingCard}>
          <Text style={styles.bioLoadingIcon}>{bioIcon}</Text>
          <ActivityIndicator size="large" color={COLORS.biometric} style={{ marginTop: 16 }} />
          <Text style={styles.bioLoadingText}>Verifying {bioLabel}...</Text>
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
      >
        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <Text style={styles.title}>Credit Stamina</Text>
          <Text style={styles.subtitle}>Build better credit, build better life</Text>
        </View>

        <View style={styles.form}>
          {/* Error / session-expiry banner */}
          {!!error && (
            <View style={[
              styles.errorContainer,
              error.toLowerCase().includes('session') || error.toLowerCase().includes('expired')
                ? styles.warningContainer
                : null,
            ]}>
              <Text style={[
                styles.errorText,
                error.toLowerCase().includes('session') || error.toLowerCase().includes('expired')
                  ? styles.warningText
                  : null,
              ]}>{error}</Text>
            </View>
          )}

          {/* Biometric quick-login — shown when enrolled and not in password fallback mode */}
          {bioAvailable && storedUserId && !showPasswordForm && (
            <View style={styles.bioSection}>
              <TouchableOpacity
                style={styles.bioButton}
                onPress={handleBiometricPress}
                activeOpacity={0.75}
              >
                <Text style={styles.bioIcon}>{bioIcon}</Text>
                <Text style={styles.bioButtonText}>Sign in with {bioLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.usePasswordLink}
                onPress={() => { setShowPasswordForm(true); setError(''); }}
              >
                <Text style={styles.usePasswordText}>Use password instead</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Password form */}
          {showPasswordForm && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Enter your password"
                    placeholderTextColor={COLORS.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPass(v => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={COLORS.text} />
                  : <Text style={styles.buttonText}>Sign In</Text>
                }
              </TouchableOpacity>

              {/* Option to go back to biometric if enrolled */}
              {bioAvailable && storedUserId && (
                <TouchableOpacity
                  style={styles.useBioLink}
                  onPress={() => { setShowPasswordForm(false); setError(''); handleBiometricPress(); }}
                >
                  <Text style={styles.useBioText}>{bioIcon}  Use {bioLabel} instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerButtonText}>
              Don't have an account? <Text style={styles.registerLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
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
    justifyContent: 'center',
    padding: 24,
  },
  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  // ── Form ──
  form: {
    width: '100%',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#F59E0B',
  },
  warningText: {
    color: '#F59E0B',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  // ── Biometric section ──
  bioSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.biometric,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 32,
    width: '100%',
    gap: 10,
    shadowColor: COLORS.biometric,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  bioIcon: {
    fontSize: 22,
  },
  bioButtonText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  usePasswordLink: {
    marginTop: 16,
    padding: 8,
  },
  usePasswordText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  // ── Password form ──
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
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
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  eyeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  useBioLink: {
    alignItems: 'center',
    marginTop: 14,
    padding: 8,
  },
  useBioText: {
    color: COLORS.biometric,
    fontSize: 14,
    fontWeight: '500',
  },
  // ── Divider / Register ──
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginHorizontal: 16,
  },
  registerButton: {
    alignItems: 'center',
    padding: 16,
  },
  registerButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  registerLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  // ── Biometric loading overlay ──
  bioLoadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  bioLoadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.biometric + '40',
  },
  bioLoadingIcon: {
    fontSize: 56,
  },
  bioLoadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 16,
  },
});

export default LoginScreen;
