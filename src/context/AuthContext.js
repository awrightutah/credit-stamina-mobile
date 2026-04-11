import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, signIn, signUp, signOut, getCurrentUser, getSession, resetPassword } from '../services/supabase';
import { setStoredToken } from '../services/api';

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

  const register = async (email, password, fullName) => {
    try {
      setError(null);
      setLoading(true);
      const data = await signUp(email, password, fullName);
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
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
    setError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;