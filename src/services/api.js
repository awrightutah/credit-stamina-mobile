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
  
  getProfile: async (token) => {
    return api.get('/api/profile', {
      headers: { 'x-user-token': token }
    });
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
};

// ============================================
// SCORES ENDPOINTS
// ============================================

export const scoresAPI = {
  getAll: async () => {
    return api.get('/api/scores');
  },
  
  add: async (bureau, score, recorded_date, notes) => {
    return api.post('/api/scores', { bureau, score, recorded_date, notes });
  },
  
  delete: async (id) => {
    return api.delete(`/api/scores/${id}`);
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
    return api.post('/api/letters/generate', data);
  },
};

// ============================================
// AI ADVISOR ENDPOINTS
// ============================================

export const aiAPI = {
  ask: async (message) => {
    return api.post('/api/ai-advisor', { message });
  },
  
  getScoreTips: async (currentScore, targetTier, pointsNeeded) => {
    return api.post('/api/score-improvement-tips', {
      current_score: currentScore,
      target_tier: targetTier,
      points_needed: pointsNeeded,
    });
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

export default api;