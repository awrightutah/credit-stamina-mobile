import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: false });

// AsyncStorage keys
const KEY_ENABLED    = (uid) => `@biometrics_enabled_${uid}`;
const KEY_SESSION    = (uid) => `@biometrics_session_${uid}`;
const KEY_LAST_USER  = '@biometrics_last_user';
const KEY_LAST_AUTH  = '@biometrics_last_auth_ts';
const BIOMETRIC_TTL  = 15 * 60 * 1000; // 15 minutes in ms

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Returns { available: bool, biometryType: 'FaceID' | 'TouchID' | 'Biometrics' | null }
 * biometryType is the string returned by the device; use it for display text.
 */
export const checkBiometricAvailability = async () => {
  try {
    const { available, biometryType } = await rnBiometrics.isSensorAvailable();
    return { available: !!available, biometryType: biometryType ?? null };
  } catch {
    return { available: false, biometryType: null };
  }
};

/**
 * Returns a friendly label for the button: "Face ID", "Touch ID", or "Biometrics"
 */
export const getBiometricLabel = (biometryType) => {
  if (biometryType === BiometryTypes.FaceID)    return 'Face ID';
  if (biometryType === BiometryTypes.TouchID)   return 'Touch ID';
  if (biometryType === BiometryTypes.Biometrics) return 'Biometrics';
  return 'Biometrics';
};

/**
 * Returns the SF Symbol name for the biometric type (used for icon display).
 */
export const getBiometricIcon = (biometryType) => {
  if (biometryType === BiometryTypes.FaceID)  return '🔒';
  if (biometryType === BiometryTypes.TouchID) return '👆';
  return '🔐';
};

// ── Auth timestamp (15-min grace window) ─────────────────────────────────────

/**
 * Records the current time as the last successful biometric auth.
 * Call this after every successful biometric or password login.
 */
export const recordBiometricAuthTime = async () => {
  try {
    await AsyncStorage.setItem(KEY_LAST_AUTH, String(Date.now()));
  } catch {}
};

/**
 * Returns true if the last successful biometric auth was within the last 15 minutes.
 * If so, the login screen should skip the biometric prompt entirely.
 */
export const isBiometricAuthRecent = async () => {
  try {
    const ts = await AsyncStorage.getItem(KEY_LAST_AUTH);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < BIOMETRIC_TTL;
  } catch {
    return false;
  }
};

// ── Authenticate ──────────────────────────────────────────────────────────────

/**
 * Triggers the biometric prompt.
 * Returns { success: bool, error?: string }
 */
export const authenticateWithBiometrics = async (promptMessage) => {
  try {
    const result = await rnBiometrics.simplePrompt({
      promptMessage: promptMessage || 'Confirm your identity',
      cancelButtonText: 'Use Password',
    });
    return { success: result.success };
  } catch (err) {
    const msg = err?.message || '';
    // User cancelled — not an error worth logging
    if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('UserCancel')) {
      return { success: false, cancelled: true };
    }
    console.warn('[Biometrics] auth error:', msg);
    return { success: false, error: msg };
  }
};

// ── Enrollment state ──────────────────────────────────────────────────────────

/**
 * Call after a successful password login to save the Supabase session
 * and mark biometrics as enabled for this user.
 */
export const saveBiometricSession = async (userId, session) => {
  if (!userId || !session) return;
  try {
    await AsyncStorage.setItem(KEY_ENABLED(userId), 'true');
    await AsyncStorage.setItem(KEY_SESSION(userId), JSON.stringify({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    }));
    await AsyncStorage.setItem(KEY_LAST_USER, userId);
  } catch (e) {
    console.warn('[Biometrics] save session error:', e?.message);
  }
};

/**
 * Returns the saved session tokens for the given user, or null.
 */
export const getBiometricSession = async (userId) => {
  if (!userId) return null;
  try {
    const enabled = await AsyncStorage.getItem(KEY_ENABLED(userId));
    if (enabled !== 'true') return null;
    const raw = await AsyncStorage.getItem(KEY_SESSION(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Returns the userId of the last user who enrolled biometrics, or null.
 * Used on the login screen before we know which user is logging in.
 */
export const getLastBiometricUserId = async () => {
  try {
    return await AsyncStorage.getItem(KEY_LAST_USER);
  } catch {
    return null;
  }
};

/**
 * Disables biometrics for a user and removes stored session tokens.
 */
export const clearBiometricSession = async (userId) => {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(KEY_ENABLED(userId));
    await AsyncStorage.removeItem(KEY_SESSION(userId));
    await AsyncStorage.removeItem(KEY_LAST_USER);
  } catch (e) {
    console.warn('[Biometrics] clear error:', e?.message);
  }
};

/**
 * Updates stored tokens after a successful session refresh
 * so the next biometric login uses fresh tokens.
 */
export const updateBiometricSession = async (userId, session) => {
  if (!userId || !session) return;
  try {
    const enabled = await AsyncStorage.getItem(KEY_ENABLED(userId));
    if (enabled === 'true') {
      await AsyncStorage.setItem(KEY_SESSION(userId), JSON.stringify({
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
      }));
    }
  } catch (e) {
    console.warn('[Biometrics] update session error:', e?.message);
  }
};
