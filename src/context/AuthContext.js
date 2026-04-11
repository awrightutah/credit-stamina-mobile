import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, signIn, signUp, signOut, getCurrentUser, getSession, resetPassword, updateUserProfile } from '../services/supabase';
import { setStoredToken, authAPI } from '../services/api';

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

  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...');
        const session = await getSession();
        console.log('Session:', session);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.access_token) {
          setStoredToken(session.access_token);
        }
      } catch (e) {
        console.error('Auth initialization error:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    let subscription = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event);
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.access_token) {
            setStoredToken(session.access_token);
          }
          setLoading(false);
        }
      );
      subscription = data?.subscription;
    } catch (e) {
      console.error('Auth state change listener error:', e);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const data = await signIn(email, password);
      return data;
    } catch (e) {
      setError(e.message);
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
      setError(e.message);
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
      if (profileData.address_street !== undefined) backendPayload.address_street = profileData.address_street;
      if (profileData.address_city !== undefined)   backendPayload.address_city   = profileData.address_city;
      if (profileData.address_state !== undefined)  backendPayload.address_state  = profileData.address_state;
      if (profileData.address_zip !== undefined)    backendPayload.address_zip    = profileData.address_zip;
      await authAPI.updateProfile(backendPayload).catch(() => null); // don't fail if backend is unavailable
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await signOut();
      setUser(null);
      setSession(null);
      setStoredToken(null);
    } catch (e) {
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
      setError(e.message);
      throw e;
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    forgotPassword,
    updateProfile,
    setError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;