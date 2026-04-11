import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Your Supabase configuration
const supabaseUrl = 'https://YOUR_SUPABASE_PROJECT_URL';
const supabaseAnonKey = 'SUPABASE_ANON_KEY_REMOVED_FROM_HISTORY';

// Create Supabase client with AsyncStorage for React Native
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Auth helper functions
// profileData: { fullName, phone, address: { street, city, state, zip } }
export const signUp = async (email, password, profileData = {}) => {
  try {
    const { fullName, phone, address } = profileData;
    const metadata = {};
    if (fullName) metadata.full_name = fullName;
    if (phone)    metadata.phone = phone;
    if (address?.street) metadata.address_street = address.street;
    if (address?.city)   metadata.address_city   = address.city;
    if (address?.state)  metadata.address_state  = address.state;
    if (address?.zip)    metadata.address_zip    = address.zip;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: Object.keys(metadata).length ? { data: metadata } : undefined,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Sign up error:', e);
    throw e;
  }
};

// Update Supabase user metadata (name, phone, address, etc.)
export const updateUserProfile = async (metadata) => {
  try {
    // Ensure the session is fresh before calling updateUser
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) {
      // Try to refresh
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error('Session expired — please sign out and sign back in.');
    }

    const { data, error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Update profile error:', e);
    throw e;
  }
};

export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Sign in error:', e);
    throw e;
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (e) {
    console.error('Sign out error:', e);
    throw e;
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (e) {
    console.error('Get user error:', e);
    return null;
  }
};

export const getSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch (e) {
    console.error('Get session error:', e);
    return null;
  }
};

export const resetPassword = async (email) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Reset password error:', e);
    throw e;
  }
};

export const updatePassword = async (newPassword) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Update password error:', e);
    throw e;
  }
};

// Listen to auth state changes
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

export default supabase;