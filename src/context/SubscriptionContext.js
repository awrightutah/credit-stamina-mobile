import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { billingAPI } from '../services/api';
import { useAuth } from './AuthContext';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

const SubscriptionContext = createContext({
  subscription: null,
  loading: false,
  refreshSubscription: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const backgroundTimeRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const fetchSubscription = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const res = await billingAPI.getInfo();
      setSubscription(res?.data ?? null);
    } catch (e) {
      console.warn('[Subscription] fetch failed:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Fetch once when user authenticates, clear on logout
  useEffect(() => {
    if (user?.id) {
      fetchSubscription();
    } else {
      setSubscription(null);
    }
  }, [user?.id]);

  // Refresh if app returns from 30+ minutes in background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState.match(/inactive|background/)) {
        backgroundTimeRef.current = Date.now();
      } else if (nextState === 'active' && backgroundTimeRef.current) {
        const elapsed = Date.now() - backgroundTimeRef.current;
        if (elapsed >= STALE_AFTER_MS && user?.id) {
          fetchSubscription();
        }
        backgroundTimeRef.current = null;
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [fetchSubscription, user?.id]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, refreshSubscription: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
