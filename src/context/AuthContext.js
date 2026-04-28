import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, signIn, signUp, signOut, getCurrentUser, getSession, resetPassword, updateUserProfile, isRefreshTokenError, clearStoredSession } from '../services/supabase';
import { setStoredToken, authAPI } from '../services/api';
import { updateBiometricSession } from '../services/biometrics';
import { friendlyAuthError } from '../utils/authErrors';
// Push notification helpers — imported lazily so the rest of auth still
// works in environments where Firebase isn't initialized (tests, etc.).
const getPushHelpers = () => {
  try {
    const mod = require('../services/notifications');
    return {
      registerForPushNotifications:   mod.registerForPushNotifications,
      unregisterPushNotifications:    mod.unregisterPushNotifications,
      checkNotificationPermissions:   mod.checkNotificationPermissions,
      requestNotificationPermission:  mod.requestNotificationPermission,
      onTokenRefresh:                 mod.onTokenRefresh,
    };
  } catch {
    return {
      registerForPushNotifications:   async () => null,
      unregisterPushNotifications:    async () => {},
      checkNotificationPermissions:   async () => ({ granted: false, alert: false }),
      requestNotificationPermission:  async () => ({ granted: false, alert: false }),
      onTokenRefresh:                 () => () => {},
    };
  }
};

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Shown on the login screen after a silent session expiry
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.access_token) {
          setStoredToken(currentSession.access_token);
        }
        // Cold-start: if user is already signed in and has granted
        // notification permission, silently refresh the FCM token.
        // Never prompts — only the post-login flow does that.
        if (currentSession?.user) {
          try {
            const { checkNotificationPermissions, registerForPushNotifications } = getPushHelpers();
            const perms = await checkNotificationPermissions();
            if (perms.granted) {
              registerForPushNotifications().catch(() => null);
            }
          } catch {}
        }
      } catch (e) {
        if (isRefreshTokenError(e)) {
          // Stale token from a previous install or expired session.
          // Clear storage silently and let the navigator send the user to login.
          console.log('[Auth] Stale refresh token on startup — clearing session');
          await clearStoredSession();
          setUser(null);
          setSession(null);
          setStoredToken(null);
          setSessionExpiredMessage('Your session expired. Please log in again.');
        } else {
          // Unexpected error — still don't crash; just drop to login
          console.warn('[Auth] initializeAuth unexpected error:', e?.message);
          setUser(null);
          setSession(null);
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes (token refresh, sign-out, etc.)
    let subscription = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setUser(null);
          setSession(null);
          setStoredToken(null);
        } else if (newSession) {
          setSession(newSession);
          setUser(newSession.user ?? null);
          if (newSession.access_token) {
            setStoredToken(newSession.access_token);
          }
        }
        setLoading(false);
      });
      subscription = data?.subscription;
    } catch (e) {
      console.warn('[Auth] onAuthStateChange setup error:', e?.message);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Subscribe to FCM token rotation while authenticated. Re-uploads the
  // refreshed token to the backend automatically. Cleanup on sign-out
  // or unmount; keyed on user.id so we don't accumulate listeners.
  useEffect(() => {
    if (!user?.id) return undefined;
    let unsub = () => {};
    try {
      const { onTokenRefresh } = getPushHelpers();
      unsub = onTokenRefresh(() => {
        // Token already re-uploaded inside onTokenRefresh — nothing else to do.
      });
    } catch {}
    return () => { try { unsub(); } catch {} };
  }, [user?.id]);

  const login = async (email, password) => {
    try {
      setError(null);
      setSessionExpiredMessage(null);
      setLoading(true);
      const data = await signIn(email, password);
      // Post-login push setup — non-blocking, never throws.
      // If permission already granted: register silently.
      // If not yet asked: prompt; on grant, register.
      // If denied: do nothing.
      (async () => {
        try {
          const {
            checkNotificationPermissions,
            requestNotificationPermission,
            registerForPushNotifications,
          } = getPushHelpers();
          const perms = await checkNotificationPermissions();
          if (perms.granted) {
            await registerForPushNotifications();
          } else {
            const result = await requestNotificationPermission();
            if (result.granted) await registerForPushNotifications();
          }
        } catch {}
      })();

      return data;
    } catch (e) {
      setError(friendlyAuthError(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  // profileData: { fullName, phone, address: { street, city, state, zip } }
  const register = async (email, password, profileData) => {
    try {
      setError(null);
      setLoading(true);
      // Support legacy string argument (fullName only)
      const data = await signUp(
        email,
        password,
        typeof profileData === 'string' ? { fullName: profileData } : profileData
      );
      return data;
    } catch (e) {
      setError(friendlyAuthError(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  // Update user name/phone/address in Supabase metadata + backend profile
  const updateProfile = async (profileData) => {
    try {
      // Build Supabase metadata object
      const metadata = {};
      if (profileData.fullName !== undefined)       metadata.full_name       = profileData.fullName;
      if (profileData.phone !== undefined)          metadata.phone           = profileData.phone;
      if (profileData.address_street !== undefined) metadata.address_street  = profileData.address_street;
      if (profileData.address_city !== undefined)   metadata.address_city    = profileData.address_city;
      if (profileData.address_state !== undefined)  metadata.address_state   = profileData.address_state;
      if (profileData.address_zip !== undefined)    metadata.address_zip     = profileData.address_zip;

      // Update Supabase — triggers onAuthStateChange so user state refreshes automatically
      await updateUserProfile(metadata);

      // Also sync to backend profile
      const backendPayload = {};
      if (profileData.fullName !== undefined)       backendPayload.full_name      = profileData.fullName;
      if (profileData.phone !== undefined)          backendPayload.phone          = profileData.phone;
      if (profileData.address_street !== undefined) backendPayload.address_line1  = profileData.address_street;
      if (profileData.address_city !== undefined)   backendPayload.city           = profileData.address_city;
      if (profileData.address_state !== undefined)  backendPayload.state          = profileData.address_state;
      if (profileData.address_zip !== undefined)    backendPayload.zip            = profileData.address_zip;
      await authAPI.updateProfile(backendPayload).catch(() => null); // don't fail if backend is unavailable
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      // Tear down push registration before clearing the session so the backend
      // mapping (user → token) is removed and Firebase forgets the local token.
      try {
        const { unregisterPushNotifications } = getPushHelpers();
        await unregisterPushNotifications();
      } catch {}
      await clearStoredSession();
      setUser(null);
      setSession(null);
      setStoredToken(null);
      setSessionExpiredMessage(null);
    } catch (e) {
      // Force-clear local state even if network sign-out fails
      setUser(null);
      setSession(null);
      setStoredToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Restore a session using stored tokens (used by biometric login).
  // Calls supabase.auth.setSession which validates/refreshes the tokens.
  // Returns the refreshed session on success, throws on failure.
  const loginWithSession = async (storedTokens) => {
    try {
      setError(null);
      setLoading(true);
      const { data, error } = await supabase.auth.setSession({
        access_token:  storedTokens.access_token,
        refresh_token: storedTokens.refresh_token,
      });
      if (error) throw error;
      if (!data?.session) throw new Error('Session could not be restored');

      // Keep stored biometric tokens fresh after a successful refresh
      if (data.session.user?.id) {
        updateBiometricSession(data.session.user.id, data.session).catch(() => null);
      }

      return data.session;
    } catch (e) {
      if (isRefreshTokenError(e)) {
        // Biometric tokens are stale — clear them and force re-login
        await clearStoredSession();
        setUser(null);
        setSession(null);
        setStoredToken(null);
        setSessionExpiredMessage('Your session expired. Please log in again.');
        throw new Error('Session expired');
      }
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email) => {
    try {
      setError(null);
      await resetPassword(email);
    } catch (e) {
      setError(friendlyAuthError(e));
      throw e;
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    sessionExpiredMessage,
    isAuthenticated: !!user,
    login,
    loginWithSession,
    register,
    logout,
    forgotPassword,
    updateProfile,
    setError,
    clearSessionExpiredMessage: () => setSessionExpiredMessage(null),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;