import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { householdAPI } from '../services/api';
import COLORS from '../theme/colors';

// Deep link: creditstamina://accept?token=XXX — the App linking config in
// AppNavigator.js routes that URL to this screen with { token } as a param.
const AcceptInviteScreen = ({ route, navigation }) => {
  const { user } = useAuth();
  const { refreshSubscription } = useSubscription();
  const [token, setToken] = useState(route?.params?.token ?? '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // If the param changes (e.g. second deep link while screen is mounted),
    // overwrite the input so the user never has to paste manually.
    if (route?.params?.token && route.params.token !== token) {
      setToken(route.params.token);
    }
  }, [route?.params?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async () => {
    const trimmed = (token || '').trim();
    if (!trimmed) {
      Alert.alert('Missing Token', 'Please paste the invitation token from your email.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in with the email this invite was sent to, then try again.');
      navigation.navigate?.('Login');
      return;
    }

    setSubmitting(true);
    try {
      await householdAPI.accept(trimmed);
      try { await refreshSubscription(); } catch {}
      Alert.alert(
        'Welcome to the Household! 🎉',
        "You're all set. Your subscription is covered — enjoy full access to Credit Stamina.",
        [{ text: 'Continue', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }]
      );
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Could not accept the invitation. Please try again.';
      Alert.alert('Invitation Problem', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top','left','right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logo} />
          </View>

          <Text style={styles.heading}>You've been invited!</Text>
          <Text style={styles.subheading}>
            Join your household on Credit Stamina. Your subscription is covered by the primary account — you won't be charged.
          </Text>

          <Text style={styles.label}>Invitation Token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste the token from your email"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.button, (submitting || !token.trim()) && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={submitting || !token.trim()}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Accept Invitation</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Not now</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Make sure you're signed in with the email address this invite was sent to — the token is only valid for that email.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.purple,
    shadowColor: COLORS.purple,
    shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 14 },
  },
  heading: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subheading: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    color: COLORS.text,
    padding: 16,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 24,
  },
  button: {
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: COLORS.textSecondary, fontSize: 14 },
  footnote: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});

export default AcceptInviteScreen;
