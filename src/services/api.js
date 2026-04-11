import axios from 'axios';

// Production API URL - your Railway backend
const API_URL = 'https://YOUR_RAILWAY_APP_NAME.up.railway.app';

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
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      // This will be handled by auth context
    }
    return Promise.reject(error);
  }
);

// Token storage helper
let storedToken = null;

export const setStoredToken = (token) => {
  storedToken = token;
};

export const getStoredToken = () => storedToken;

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
  
  delete: async (id) => {
    return api.delete(`/api/actions/${id}`);
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
    return api.post('/api/letters', data);
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
  
  // 30/60/90 Day Action Plan (AI generation can take up to 2 minutes)
  getActionPlan: async () => {
    return api.post('/api/action-plan', {}, { timeout: 120000 });
  },
  
  // Score Prediction
  predictScore: async (improvements) => {
    return api.post('/api/score-prediction', { improvements });
  },
};

// ============================================
// POINTS ENDPOINTS
// ============================================

export const pointsAPI = {
  get: async () => {
    return api.get('/api/points');
  },
  
  award: async (action, description) => {
    return api.post('/api/points/award', { action, description });
  },
};

// ============================================
// BILLING ENDPOINTS
// ============================================

export const billingAPI = {
  getInfo: async () => {
    return api.get('/api/billing/info');
  },
  
  getPaymentMethods: async () => {
    return api.get('/api/billing/payment-methods');
  },
  
  getHistory: async () => {
    return api.get('/api/billing/history');
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
    return api.get('/api/activity-timeline');
  },
};

export default api;