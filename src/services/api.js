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

  // Get recent activity across all users
  getRecentActivity: async (limit = 50) => {
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

export default api;