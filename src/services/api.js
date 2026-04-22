import axios from 'axios';
import { supabase } from './supabase';

import { API_URL as _API_URL } from '../config/env';
// Production API URL - your Railway backend
const API_URL = _API_URL;

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    // Get token from AsyncStorage (will be set by auth context)
    const token = await getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      config.headers['x-user-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Retry once on network error (ConnectionRefused, timeout, no response)
    if (!error.response && !original._networkRetry) {
      original._networkRetry = true;
      await new Promise(r => setTimeout(r, 1500));
      return api(original);
    }

    // On 401: refresh Supabase session and retry the original request once
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          // Stale/invalid refresh token — clear local storage so AuthContext
          // redirects to login on the next render cycle.
          const { clearStoredSession: clear } = require('./supabase');
          await clear().catch(() => null);
          setStoredToken(null);
        } else {
          const token = data?.session?.access_token;
          if (token) {
            setStoredToken(token);
            original.headers.Authorization = `Bearer ${token}`;
            original.headers['x-user-token'] = token;
            return api(original);
          }
        }
      } catch {
        // Never let the interceptor throw — just fall through to reject
      }
    }

    return Promise.reject(error);
  }
);

// Token storage helper
let storedToken = null;

export const setStoredToken = (token) => {
  storedToken = token;
};

// Async getter: uses in-memory token first, falls back to Supabase session
// (Supabase persists session to AsyncStorage, so this works on cold start)
export const getStoredToken = async () => {
  if (storedToken) return storedToken;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      storedToken = token; // cache for subsequent calls
      return token;
    }
  } catch {}
  return null;
};

// ============================================
// AUTH ENDPOINTS
// ============================================

export const authAPI = {
  login: async (email, password) => {
    // Note: Auth is handled by Supabase directly
    // This is a placeholder for any additional auth API calls
  },
  
  getProfile: async () => {
    return api.get('/api/profile');
  },
  
  updateProfile: async (data) => {
    return api.put('/api/profile', data);
  },
};

// ============================================
// ACCOUNTS ENDPOINTS
// ============================================

export const accountsAPI = {
  getAll: async () => {
    return api.get('/api/accounts');
  },

  create: async (data) => {
    return api.post('/api/accounts', data);
  },

  update: async (id, data) => {
    return api.put(`/api/accounts/${id}`, data);
  },

  delete: async (id) => {
    return api.delete(`/api/accounts/${id}`);
  },
};

// ============================================
// ACTIONS ENDPOINTS
// ============================================

export const actionsAPI = {
  getAll: async (status, lane) => {
    let url = '/api/actions';
    const params = [];
    if (status) params.push(`status=${status}`);
    if (lane) params.push(`lane=${lane}`);
    if (params.length) url += '?' + params.join('&');
    return api.get(url);
  },

  updateStatus: async (id, status) => {
    return api.put(`/api/actions/${id}/status`, { status });
  },

  create: async (data) => {
    return api.post('/api/actions', data);
  },

  // Bulk create — tries a single bulk endpoint first, always falls back to
  // sequential individual creates on ANY error (bulk endpoint may not exist yet).
  createBulk: async (actions) => {
    try {
      return await api.post('/api/actions/bulk', { actions });
    } catch {
      // Bulk endpoint not available — fall back to individual creates in batches of 8
      const BATCH = 8;
      let saved = 0;
      for (let i = 0; i < actions.length; i += BATCH) {
        const batch = actions.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(a => api.post('/api/actions', a).catch(() => null))
        );
        saved += results.filter(Boolean).length;
      }
      return { data: { saved } };
    }
  },

  delete: async (id) => {
    return api.delete(`/api/actions/${id}`);
  },

  // Delete all pending actions so they can be regenerated.
  // Falls back to a direct Supabase delete if the Railway endpoint doesn't exist.
  deleteAllPending: async () => {
    try {
      return await api.delete('/api/actions/pending/all');
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return { data: { success: true } };
        await supabase
          .from('action_queue')
          .delete()
          .eq('user_id', userId)
          .eq('status', 'Pending');
        return { data: { success: true } };
      }
      // Non-404 errors are logged but not re-thrown — this is a background operation
      console.warn('[actionsAPI] deleteAllPending failed:', err?.message);
      return { data: { success: false } };
    }
  },
};

// ============================================
// CREDIT REPORTS ENDPOINTS
// ============================================

export const creditReportsAPI = {
  getAll: async () => {
    return api.get('/api/credit-reports');
  },
  
  delete: async (id) => {
    return api.delete(`/api/credit-reports/${id}`);
  },
  
  // Upload and parse credit report PDF with AI
  upload: async (formData, onProgress) => {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    };
    return api.post('/api/upload-pdf', formData, config);
  },
};

// ============================================
// SCORES ENDPOINTS
// ============================================

export const scoresAPI = {
  getAll: async () => {
    return api.get('/api/scores');
  },

  // user_id is required by Supabase RLS — must match auth.uid()
  add: async (bureau, score, recorded_date, notes, userId) => {
    const payload = { bureau, score, recorded_date, notes };
    if (userId) payload.user_id = userId;
    return api.post('/api/scores', payload);
  },

  delete: async (id) => {
    return api.delete(`/api/scores/${id}`);
  },
};

// ============================================
// GOOGLE PLACES PROXY (key stored on Railway)
// ============================================

export const placesAPI = {
  autocomplete: async (input) => {
    return api.get('/api/places/autocomplete', { params: { input } });
  },

  details: async (placeId) => {
    return api.get('/api/places/details', { params: { place_id: placeId } });
  },
};

// ============================================
// LETTERS ENDPOINTS
// ============================================

export const lettersAPI = {
  getAll: async () => {
    return api.get('/api/letters');
  },
  
  create: async (data) => {
    // DB column is creditor_name — remap account_name if present
    const payload = { ...data };
    if (payload.account_name && !payload.creditor_name) {
      payload.creditor_name = payload.account_name;
      delete payload.account_name;
    }
    return api.post('/api/letters', payload);
  },
  
  update: async (id, data) => {
    return api.put(`/api/letters/${id}`, data);
  },
  
  delete: async (id) => {
    return api.delete(`/api/letters/${id}`);
  },
  
  generate: async (data) => {
    return api.post('/api/letters/generate', data, { timeout: 120000 });
  },

  // Save typed signature to a letter
  sign: async (id, signatureName) => {
    return api.put(`/api/letters/${id}`, { signature_name: signatureName, signed_at: new Date().toISOString() });
  },

  // Submit letter to Click2Mail for USPS mailing (backend handles payment + Click2Mail API)
  mailViaClick2Mail: async (id, { recipientName, recipientAddress, recipientCity, recipientState, recipientZip }) => {
    return api.post(`/api/letters/${id}/mail`, {
      recipient_name:    recipientName,
      recipient_address: recipientAddress,
      recipient_city:    recipientCity,
      recipient_state:   recipientState,
      recipient_zip:     recipientZip,
    });
  },

  // Update letter status / outcome after a response is received
  updateStatus: async (id, updates) => {
    return api.put(`/api/letters/${id}`, updates);
  },

  // Generate an AI escalation / follow-up letter
  generateEscalation: async (data) => {
    try {
      return await api.post('/api/letters/escalate', data, { timeout: 120000 });
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        const round = (data.follow_up_count || 0) + 1;
        const context = data.denial_reason
          ? `denied — stated reason: "${data.denial_reason}"`
          : 'received no response after the required 30-day window';
        return api.post('/api/letters/generate', {
          ...data,
          is_escalation: true,
          escalation_round: round,
          reason: `ESCALATION ROUND ${round}: My previous ${data.letter_type?.replace('_', ' ')} letter was ${context}. ` +
            `Generate a stronger, more assertive follow-up letter. Cite specific FCRA sections (§611, §623). ` +
            `Increase urgency and legal tone. Demand immediate action and compliance within 15 days. ` +
            `Reference that this is follow-up number ${round} and that non-compliance may result in legal action.`,
        }, { timeout: 120000 });
      }
      throw err;
    }
  },

  // Get a short-lived PDF URL for viewing/downloading
  getPdfUrl: async (id) => {
    return api.get(`/api/letters/${id}/pdf`);
  },
};

// ============================================
// AI ADVISOR ENDPOINTS
// ============================================

export const aiAPI = {
  ask: async (message) => {
    return api.post('/api/ai-advisor', { message });
  },
  
  askQuestion: async (data) => {
    return api.post('/api/ai-advisor', data);
  },
  
  getScoreTips: async (currentScore, targetTier, pointsNeeded) => {
    return api.post('/api/score-improvement-tips', {
      current_score: currentScore,
      target_tier: targetTier,
      points_needed: pointsNeeded,
    });
  },
  
  // Quick Wins - AI analysis of accounts for quick actions
  getQuickWins: async () => {
    return api.post('/api/ai-next-steps', { limit: 10 });
  },
  
  // Complete a quick win action
  completeAction: async (actionId) => {
    return api.post('/api/ai-next-steps/complete', { actionId });
  },
  
  // 30/60/90 Day Action Plan — pass accounts so backend doesn't need to re-fetch
  getActionPlan: async (accounts = []) => {
    return api.post('/api/action-plan', { accounts }, { timeout: 120000 });
  },
  
  // Score Prediction
  predictScore: async (improvements, currentScore) => {
    const payload = { improvements };
    if (currentScore) payload.current_score = currentScore;
    return api.post('/api/score-prediction', payload);
  },
};

// ============================================
// POINTS (Supabase-direct — Railway has no /api/points endpoint)
// ============================================

// Points awarded per action type
export const POINTS_VALUES = {
  upload_report:    50,
  log_score:        25,
  complete_action:  20,
  generate_letter:  30,
  send_letter:      35,
  add_bill:         10,
  daily_login:       5,
  redeem_month:   -500,
};

export const POINTS_GOAL = 500; // points needed for a free month

export const pointsAPI = {
  get: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return { data: { points: 0, total: 0 } };

      const { data: profile } = await supabase
        .from('profiles')
        .select('stamina_points, total_points_earned')
        .eq('id', userId)
        .single();

      const pts = profile?.stamina_points ?? 0;
      return { data: { points: pts, total: profile?.total_points_earned ?? pts } };
    } catch {
      return { data: { points: 0, total: 0 } };
    }
  },

  // Award points for an action. amount defaults to POINTS_VALUES[action] ?? 10
  award: async (action, description, amount) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return { data: { success: false } };

      const pts = amount ?? POINTS_VALUES[action] ?? 10;

      // Increment profile balance using actual column names
      const { data: profile } = await supabase
        .from('profiles')
        .select('stamina_points, total_points_earned')
        .eq('id', userId)
        .single();

      const current = profile?.stamina_points ?? 0;
      const currentTotal = profile?.total_points_earned ?? 0;
      const newBalance = current + pts;
      const newTotal = currentTotal + pts;

      await supabase
        .from('profiles')
        .update({ stamina_points: newBalance, total_points_earned: newTotal })
        .eq('id', userId);

      return { data: { success: true, points: newBalance, awarded: pts } };
    } catch {
      return { data: { success: false } };
    }
  },

  // Redeem 500 points for a free month
  redeem: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return { data: { success: false } };

      const { data: profile } = await supabase
        .from('profiles')
        .select('stamina_points, free_months_redeemed')
        .eq('id', userId)
        .single();

      const current = profile?.stamina_points ?? 0;
      if (current < POINTS_GOAL) {
        return { data: { success: false, message: `Need ${POINTS_GOAL - current} more points` } };
      }

      const remaining = current - POINTS_GOAL;
      const redeemed = (profile?.free_months_redeemed ?? 0) + 1;
      await supabase.from('profiles').update({
        stamina_points: remaining,
        free_months_redeemed: redeemed,
      }).eq('id', userId);
      await supabase.from('points_log').insert([{
        user_id: userId,
        action: 'redeem_month',
        description: 'Redeemed 500 points for 1 free month',
        amount: -POINTS_GOAL,
      }]).catch(() => null);

      return { data: { success: true, remaining, redeemed: POINTS_GOAL } };
    } catch (err) {
      return { data: { success: false, message: err?.message } };
    }
  },

  // Get points transaction history
  getHistory: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return { data: [] };
      const { data } = await supabase
        .from('points_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      return { data: data ?? [] };
    } catch {
      return { data: [] };
    }
  },
};

// ============================================
// ADMIN API (Supabase-direct — requires is_admin = true in profiles)
// ============================================

export const adminAPI = {
  // Check if the current user is an admin
  isAdmin: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        console.warn('[Admin] isAdmin: no userId in session');
        return false;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, is_admin')
        .eq('id', userId)
        .single();
      if (error) {
        console.warn('[Admin] isAdmin query error:', error.message, error.code);
        return false;
      }
      console.log('[Admin] isAdmin result:', JSON.stringify(data));
      return data?.is_admin === true;
    } catch (e) {
      console.warn('[Admin] isAdmin exception:', e?.message);
      return false;
    }
  },

  // Aggregate platform stats via SECURITY DEFINER RPC (bypasses RLS)
  getStats: async () => {
    const { data, error } = await supabase.rpc('admin_get_stats');
    if (error) throw error;
    return {
      total_users: data?.total_users ?? 0,
      active_subscriptions: data?.active_subscriptions ?? 0,
      total_letters: data?.total_letters ?? 0,
      total_actions: 0,
    };
  },

  // List users — tries RPC first (bypasses RLS), falls back to direct query
  getUsers: async () => {
    // Try RPC (SECURITY DEFINER — bypasses RLS entirely)
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_users');
    if (rpcError) {
      console.warn('[Admin] admin_get_users RPC failed:', rpcError.code, rpcError.message);
    } else if (Array.isArray(rpcData)) {
      return rpcData;
    }

    // Fallback: direct table query (works if admin RLS policy is set)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, subscription_status, subscription_override, stamina_points, total_letters_sent, created_at, last_activity, is_admin, is_test_user')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[Admin] direct profiles query failed:', error.code, error.message);
      throw error;
    }
    return data ?? [];
  },

  // Update a user's subscription override or points
  updateUser: async (userId, updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Get recent activity across all users (uses SECURITY DEFINER RPC to bypass RLS)
  getRecentActivity: async (limit = 50) => {
    // Try RPC first — bypasses RLS on activity_log
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('admin_get_activity', { p_limit: limit });
    if (!rpcError && Array.isArray(rpcData)) return rpcData;
    if (rpcError) console.warn('[Admin] admin_get_activity RPC failed:', rpcError.code, rpcError.message);
    // Fallback: direct query (works if admin has permissive RLS or no RLS on activity_log)
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

// ============================================
// BILLING ENDPOINTS
// ============================================

// Normalize /api/subscription response → consistent shape for the mobile app.
// PWA fields: { is_active, subscription_override, status, trial_days_left, trial_expired, can_use_letters }
const normalizeSubscriptionResponse = (raw) => {
  if (!raw) return null;
  const override = raw.subscription_override?.toLowerCase()?.trim() ?? '';
  const isActive = raw.is_active === true || override === 'paid' || override === 'active';
  return {
    is_active:    isActive,
    status:       isActive ? 'active' : (raw.status ?? 'free'),
    plan_name:    raw.plan_name ?? raw.plan ?? (isActive ? 'Credit Stamina Premium' : 'Free Plan'),
    subscription_id: raw.subscription_id ?? raw.id ?? null,
    trial_days_left: raw.trial_days_left ?? null,
    trial_expired:   raw.trial_expired   ?? false,
    can_use_letters: raw.can_use_letters ?? isActive,
    subscription_override: override,
  };
};

// Fetch subscription status directly from Supabase `profiles` table as a fallback.
const getSubscriptionFromSupabase = async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_override, subscription_plan, subscription_id, authorizenet_subscription_id, subscription_paused, promo_price, is_test_user')
      .eq('id', userId)
      .single();
    if (error || !profile) return null;
    const override = profile.subscription_override?.toLowerCase()?.trim() ?? '';
    const isActive =
      override === 'paid' || override === 'active' ||
      profile.subscription_status === 'active';
    const promoPrice = profile.promo_price ? parseFloat(profile.promo_price) : null;
    return {
      is_active: isActive,
      status: isActive ? 'active' : 'free',
      plan_name: profile.subscription_plan ?? (isActive ? 'Credit Stamina Premium' : 'Free Plan'),
      subscription_id: profile.subscription_id ?? profile.authorizenet_subscription_id ?? null,
      promo_price: promoPrice,
      is_test_user: profile.is_test_user ?? false,
      subscription_override: override,
    };
  } catch {
    return null;
  }
};

export const billingAPI = {
  // GET /api/subscription — primary endpoint (same one the PWA uses)
  // Falls back to Supabase profiles table if Railway returns no usable data
  getInfo: async () => {
    try {
      const res = await api.get('/api/subscription');
      const normalized = normalizeSubscriptionResponse(res?.data ?? res);
      if (normalized !== null) return { data: normalized };
    } catch { /* fall through to Supabase */ }
    const fromSupabase = await getSubscriptionFromSupabase();
    return { data: fromSupabase };
  },

  // No payment-methods endpoint on backend — return empty list gracefully
  getPaymentMethods: async () => {
    return { data: { payment_methods: [] } };
  },

  // Try Supabase billing_history table for transaction history
  getHistory: async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { data } = await supabase
          .from('billing_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (data && data.length > 0) return { data };
      }
    } catch { /* fall through */ }
    return { data: [] };
  },

  // Pause subscription via Railway
  pauseSubscription: async () => {
    return api.post('/api/billing/pause');
  },

  // Cancel: use subscription ID from getInfo, then DELETE /api/billing/subscription/:id
  cancelSubscription: async () => {
    const info = await billingAPI.getInfo();
    const subId = info?.data?.subscription_id;
    if (!subId) throw new Error('No active subscription found.');
    return api.delete(`/api/billing/subscription/${subId}`);
  },

  // One-time charge via Authorize.net (backend holds API keys)
  // cardData: { card_number, expiry_month, expiry_year, cvv, cardholder_name }
  // OR pass saved_payment_profile_id to charge a stored card
  charge: async ({ amount, description, cardData, savedProfileId }) => {
    return api.post('/api/billing/charge', {
      amount,
      description,
      ...(savedProfileId
        ? { saved_payment_profile_id: savedProfileId }
        : {
            card_number:      cardData.cardNumber.replace(/\s/g, ''),
            expiry_month:     cardData.expiryMonth,
            expiry_year:      cardData.expiryYear,
            cvv:              cardData.cvv,
            cardholder_name:  cardData.cardholderName,
          }),
    });
  },

  // Subscribe via /api/create-checkout (matches PWA endpoint)
  subscribe: async ({ planId, cardData, savedProfileId }) => {
    return api.post('/api/create-checkout', {
      plan: planId ?? 'Monthly',
      amount: 24.99,
      ...(savedProfileId
        ? { saved_payment_profile_id: savedProfileId }
        : {
            card_number:      cardData.cardNumber.replace(/\s/g, ''),
            expiry_month:     cardData.expiryMonth,
            expiry_year:      cardData.expiryYear,
            cvv:              cardData.cvv,
            cardholder_name:  cardData.cardholderName,
          }),
    });
  },

  // Save card as Authorize.net Customer Payment Profile for future use
  savePaymentMethod: async (cardData) => {
    return api.post('/api/billing/payment-methods', {
      card_number:     cardData.cardNumber.replace(/\s/g, ''),
      expiry_month:    cardData.expiryMonth,
      expiry_year:     cardData.expiryYear,
      cvv:             cardData.cvv,
      cardholder_name: cardData.cardholderName,
    });
  },
};

// ============================================
// SMS PREFERENCES ENDPOINTS
// ============================================

export const smsAPI = {
  getPreferences: async () => {
    return api.get('/api/sms/preferences');
  },
  
  updatePreferences: async (preferences) => {
    return api.post('/api/sms/preferences', { preferences });
  },
  
  sendVerification: async (phone) => {
    return api.post('/api/sms/verify', { phone });
  },
  
  confirmVerification: async (code) => {
    return api.post('/api/sms/confirm', { code });
  },
};

// ============================================
// BILLS ENDPOINTS (Supabase direct — no Railway endpoint yet)
// ============================================

export const billsAPI = {
  getAll: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return { data: [] };
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .order('due_day', { ascending: true });
    if (error) throw error;
    return { data: data ?? [] };
  },

  create: async (bill) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('bills')
      .insert([{ ...bill, user_id: userId }])
      .select()
      .single();
    if (error) throw error;
    return { data };
  },

  update: async (id, updates) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)   // RLS: only allow updating own bills
      .select()
      .single();
    if (error) throw error;
    return { data };
  },

  delete: async (id) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);   // RLS: only allow deleting own bills
    if (error) throw error;
    return { data: { success: true } };
  },
};

// ============================================
// BUDGET ENDPOINTS
// ============================================

export const budgetAPI = {
  get: async () => {
    return api.get('/api/budget');
  },
  
  create: async (data) => {
    return api.post('/api/budget', data);
  },
  
  update: async (data) => {
    return api.put('/api/budget', data);
  },
  
  getPaymentPlans: async () => {
    return api.get('/api/budget/payment-plans');
  },
  
  createPaymentPlan: async (data) => {
    return api.post('/api/budget/payment-plans', data);
  },

  updatePaymentPlan: async (id, data) => {
    return api.put(`/api/budget/payment-plans/${id}`, data);
  },

  deletePaymentPlan: async (id) => {
    return api.delete(`/api/budget/payment-plans/${id}`);
  },
};

// ============================================
// DISPUTE TRACKER ENDPOINTS
// ============================================

export const disputesAPI = {
  getCounts: async () => {
    return api.get('/api/dispute-counts');
  },
};

// ============================================
// NOTES ENDPOINTS
// ============================================

export const notesAPI = {
  getForAccount: async (accountId) => {
    return api.get(`/api/accounts/${accountId}/notes`);
  },
  
  create: async (accountId, content) => {
    return api.post(`/api/accounts/${accountId}/notes`, { content });
  },
  
  delete: async (noteId) => {
    return api.delete(`/api/accounts/notes/${noteId}`);
  },
};

// ============================================
// ACTIVITY TIMELINE ENDPOINTS
// ============================================

export const activityAPI = {
  getTimeline: async () => {
    return api.get('/api/activity-timeline');
  },
  getAll: async () => {
    // Try Railway API first, fall back to Supabase activity_log directly
    try {
      const res = await api.get('/api/activity-timeline');
      if (Array.isArray(res?.data) && res.data.length > 0) return res;
    } catch {}
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return { data: [] };
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return { data: data ?? [] };
  },
};

// ============================================
// ACTIVITY LOGGING HELPER
// ============================================

export const logActivity = async (type, title, description = '', metadata = {}) => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;
    await supabase.from('activity_log').insert([{
      user_id: userId,
      type,
      title,
      description: description || null,
      metadata: metadata || {},
    }]);
  } catch (err) {
    // Non-fatal — never block the caller
    console.warn('[logActivity] failed:', err?.message);
  }
};

// ============================================
// HOUSEHOLD / FAMILY INVITE ENDPOINTS
// ============================================

export const householdAPI = {
  // Get current user's household status + profile flags
  getStatus: async () => {
    return api.get('/api/profile');
  },

  // List all invites sent by this user
  getInvites: async () => {
    return api.get('/api/household/invites');
  },

  // Send an invite to an email address
  sendInvite: async (email) => {
    return api.post('/api/household/invite', { email });
  },

  // Cancel / revoke a pending invite
  cancelInvite: async (inviteId) => {
    return api.delete(`/api/household/invite/${inviteId}`);
  },
};

// ============================================
// NOTIFICATIONS ENDPOINTS
// ============================================

// ============================================
// SERVICE STATES — which states Credit Stamina is licensed to operate in
// ============================================
export const statesAPI = {
  // Returns all 50 states with their is_active flag (public, no auth needed)
  getAll: async () => {
    const { data, error } = await supabase
      .from('service_states')
      .select('state_code, state_name, is_active, note')
      .order('state_name');
    if (error) throw error;
    return data ?? [];
  },

  // Returns just the active state codes — used for registration check
  getActiveCodes: async () => {
    const { data, error } = await supabase
      .from('service_states')
      .select('state_code')
      .eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map(r => r.state_code);
  },

  // Check a single state — returns true if Credit Stamina operates there
  isStateActive: async (stateCode) => {
    if (!stateCode) return false;
    const { data, error } = await supabase
      .from('service_states')
      .select('is_active')
      .eq('state_code', stateCode.toUpperCase().trim())
      .single();
    if (error || !data) return false;
    return data.is_active === true;
  },

  // Admin: toggle a state on or off
  setActive: async (stateCode, isActive) => {
    const { data, error } = await supabase
      .from('service_states')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('state_code', stateCode.toUpperCase().trim())
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const notificationsAPI = {
  // Register APNs device token with the backend
  registerToken: async (deviceToken) => {
    return api.post('/api/notifications/register-token', {
      device_token: deviceToken,
      platform: 'ios',
    });
  },

  // Unregister device token (on logout or user disables push)
  unregisterToken: async (deviceToken) => {
    return api.post('/api/notifications/unregister-token', {
      device_token: deviceToken,
      platform: 'ios',
    });
  },

  // Get/update push notification preferences
  getPreferences: async () => {
    return api.get('/api/notifications/preferences');
  },

  updatePreferences: async (prefs) => {
    return api.put('/api/notifications/preferences', prefs);
  },
};

// ============================================
// LEGAL / COMPLIANCE  (Supabase-direct)
//
// Required Supabase migrations — run once in the SQL editor:
//
// CREATE TABLE IF NOT EXISTS ai_disclaimer_acknowledgments (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
//   acknowledged_at timestamptz NOT NULL DEFAULT now(),
//   version text NOT NULL DEFAULT '1.0'
// );
// ALTER TABLE ai_disclaimer_acknowledgments ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own disclaimer ack" ON ai_disclaimer_acknowledgments
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
//
// CREATE TABLE IF NOT EXISTS esign_consents (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   consented_at timestamptz NOT NULL DEFAULT now(),
//   withdrawn_at timestamptz,
//   consent_text_version text NOT NULL DEFAULT '1.0'
// );
// ALTER TABLE esign_consents ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own esign consents" ON esign_consents
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
//
// CREATE TABLE IF NOT EXISTS signed_documents (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   letter_id uuid,
//   signer_name text NOT NULL,
//   signed_at timestamptz NOT NULL DEFAULT now(),
//   esign_consent_id uuid REFERENCES esign_consents(id),
//   signature_svg text,
//   is_active boolean NOT NULL DEFAULT true
// );
// ALTER TABLE signed_documents ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own signed docs" ON signed_documents
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
// ============================================

export const legalAPI = {
  // ─── AI Disclaimer ────────────────────────────────────────────────────────────
  getDisclaimerAck: async (userId) => {
    const { data, error } = await supabase
      .from('ai_disclaimer_acknowledgments')
      .select('user_id, acknowledged_at, version')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  acknowledgeDisclaimer: async (userId, version = '1.0') => {
    const { data, error } = await supabase
      .from('ai_disclaimer_acknowledgments')
      .upsert(
        { user_id: userId, acknowledged_at: new Date().toISOString(), version },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── eSign Consent ────────────────────────────────────────────────────────────
  getESignConsent: async (userId) => {
    const { data, error } = await supabase
      .from('esign_consents')
      .select('*')
      .eq('user_id', userId)
      .is('withdrawn_at', null)
      .order('consented_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  recordESignConsent: async (userId, version = '1.0') => {
    const { data, error } = await supabase
      .from('esign_consents')
      .insert({
        user_id: userId,
        consented_at: new Date().toISOString(),
        consent_text_version: version,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  withdrawESignConsent: async (userId) => {
    const { error } = await supabase
      .from('esign_consents')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('withdrawn_at', null);
    if (error) throw error;
  },

  // ─── Signed Documents ─────────────────────────────────────────────────────────
  saveSignedDocument: async ({ userId, letterId, signerName, signedAt, esignConsentId, signatureSvg }) => {
    const { data, error } = await supabase
      .from('signed_documents')
      .insert({
        user_id: userId,
        letter_id: letterId ?? null,
        signer_name: signerName,
        signed_at: signedAt ?? new Date().toISOString(),
        esign_consent_id: esignConsentId ?? null,
        signature_svg: signatureSvg ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  getSignedDocuments: async (userId) => {
    const { data, error } = await supabase
      .from('signed_documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

// ============================================
// AI CACHE (Supabase-direct)
// Stores AI-generated content so screens read from cache instead of calling Claude
// on every load. Content is keyed by user_id + cache_type.
//
// SQL migration (run once in Supabase SQL editor):
// ============================================
// CREATE TABLE ai_cache (
//   id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   cache_type      TEXT NOT NULL,  -- 'action_queue' | 'quick_wins' | 'score_tips' | 'score_prediction'
//   content         TEXT,           -- JSON-serialised AI response
//   generated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
//   report_upload_id UUID,          -- which report triggered this analysis (nullable)
//   UNIQUE(user_id, cache_type)
// );
// ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage their own AI cache" ON ai_cache
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
// ============================================

export const aiCacheAPI = {
  // Returns the cached row for a given type, or null if none exists.
  get: async (cacheType) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('ai_cache')
      .select('*')
      .eq('user_id', userId)
      .eq('cache_type', cacheType)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  // Upserts a cache entry. content can be any JSON-serialisable value.
  set: async (cacheType, content, reportUploadId = null) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('ai_cache')
      .upsert(
        {
          user_id:          userId,
          cache_type:       cacheType,
          content:          typeof content === 'string' ? content : JSON.stringify(content),
          generated_at:     new Date().toISOString(),
          report_upload_id: reportUploadId ?? null,
        },
        { onConflict: 'user_id,cache_type' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Helper: parse JSON content from a cache row (returns null on failure)
  parse: (row) => {
    if (!row?.content) return null;
    try {
      return typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    } catch {
      return null;
    }
  },
};

// ============================================
// POST-UPLOAD AI ANALYSIS
// Called once after a successful PDF upload. Makes all AI calls in parallel and
// stores every result in ai_cache so individual screens never need to call Claude.
// onProgress(step: string) — optional callback for progress UI.
// ============================================

export const runPostUploadAnalysis = async (uploadId, accounts = [], scores = [], onProgress) => {
  const progress = (msg) => { try { onProgress?.(msg); } catch {} };

  progress('Analyzing your accounts…');

  // Run action plan + quick wins in parallel; score tips after we have scores
  const [planResult, quickWinsResult] = await Promise.allSettled([
    (async () => {
      progress('Building your personalized action plan…');
      const res = await api.post('/api/action-plan', { accounts }, { timeout: 120000 });
      await aiCacheAPI.set('action_queue', res?.data || res, uploadId);
      return res;
    })(),
    (async () => {
      progress('Finding quick wins…');
      const res = await api.post('/api/ai-next-steps', { limit: 10 });
      await aiCacheAPI.set('quick_wins', res?.data || res, uploadId);
      return res;
    })(),
  ]);

  // Score tips — use the latest score if available
  const latestScore = scores?.[0]?.score;
  if (latestScore) {
    try {
      progress('Generating score improvement tips…');
      const tips = await api.post('/api/score-improvement-tips', {
        current_score: latestScore,
        target_tier:   latestScore >= 750 ? 'Exceptional' : latestScore >= 700 ? 'Very Good' : latestScore >= 650 ? 'Good' : 'Fair',
        points_needed: Math.max(0, 750 - latestScore),
      });
      await aiCacheAPI.set('score_tips', tips?.data || tips, uploadId);
    } catch (e) {
      console.warn('[PostUpload] score tips failed (non-blocking):', e?.message);
    }
  }

  progress('Saving results…');

  // Also save the action items to the actions table
  const planData = planResult.status === 'fulfilled' ? planResult.value?.data : null;
  if (planData) {
    try {
      // Import locally to avoid circular deps — actionsAPI is defined in same file
      const parsed = _parseAIActionsForBulkSave(planData, accounts);
      if (parsed.length > 0) {
        await api.delete('/api/actions/pending').catch(() => null); // clear old pending
        await api.post('/api/actions/bulk', { actions: parsed }).catch(() => null);
      }
    } catch (e) {
      console.warn('[PostUpload] action save failed (non-blocking):', e?.message);
    }
  }

  progress('Done!');
  return {
    actionPlan:  planResult.status  === 'fulfilled' ? planResult.value  : null,
    quickWins:   quickWinsResult.status === 'fulfilled' ? quickWinsResult.value : null,
  };
};

// Internal helper used only by runPostUploadAnalysis
const _parseAIActionsForBulkSave = (raw, accounts = []) => {
  const base      = raw?.plan || raw?.action_plan || raw?.data || raw || {};
  const priorityMap = { high: 1, medium: 2, low: 3 };
  const daysOut   = (d) => new Date(Date.now() + (d || 30) * 86400000).toISOString().split('T')[0];
  const phases    = [
    { key: 'days_30', day: 15 }, { key: 'days_60', day: 45 }, { key: 'days_90', day: 75 },
    { key: 'days1to30', day: 15 }, { key: 'days31to60', day: 45 }, { key: 'days61to90', day: 75 },
  ];
  const seen = new Set();
  const out  = [];
  for (const { key, day } of phases) {
    const phase = base[key];
    if (!phase) continue;
    const tasks = Array.isArray(phase) ? phase : (phase.tasks || []);
    for (const t of tasks) {
      const title = (t.title || t.action || '').trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      out.push({
        next_action: title,
        title,
        description: t.description || t.details || '',
        category:    t.category || 'general',
        priority:    priorityMap[t.priority?.toLowerCase()] ?? 2,
        status:      'pending',
        due_date:    daysOut(t.due_day || day),
      });
    }
  }
  return out;
};

export default api;