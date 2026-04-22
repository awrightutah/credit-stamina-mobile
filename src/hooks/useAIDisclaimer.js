import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { legalAPI } from '../services/api';

const DISCLAIMER_VERSION = '1.0';

/**
 * Tracks whether the current user has acknowledged the AI disclaimer.
 * Checks AsyncStorage first (fast path), then Supabase.
 * Acknowledgment is stored in both places for offline resilience.
 */
export const useAIDisclaimer = () => {
  const { user } = useAuth();
  const [hasAcknowledged, setHasAcknowledged] = useState(null); // null = still loading
  const [acknowledgedAt, setAcknowledgedAt] = useState(null);

  const cacheKey = user?.id ? `@cs_disclaimer_ack_${user.id}` : null;

  useEffect(() => {
    if (!cacheKey) return;
    (async () => {
      try {
        // Fast path: check local cache
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { date } = JSON.parse(cached);
          setHasAcknowledged(true);
          setAcknowledgedAt(date);
          return;
        }
        // Slow path: check Supabase
        const row = await legalAPI.getDisclaimerAck(user.id).catch(() => null);
        if (row) {
          setHasAcknowledged(true);
          setAcknowledgedAt(row.acknowledged_at);
          AsyncStorage.setItem(cacheKey, JSON.stringify({ date: row.acknowledged_at })).catch(() => null);
        } else {
          setHasAcknowledged(false);
        }
      } catch {
        setHasAcknowledged(false);
      }
    })();
  }, [cacheKey, user?.id]);

  const acknowledge = useCallback(async () => {
    if (!user?.id) return;
    const date = new Date().toISOString();
    // Optimistic update — banner hides immediately
    setHasAcknowledged(true);
    setAcknowledgedAt(date);
    if (cacheKey) {
      AsyncStorage.setItem(cacheKey, JSON.stringify({ date })).catch(() => null);
    }
    // Persist to Supabase in the background
    legalAPI.acknowledgeDisclaimer(user.id, DISCLAIMER_VERSION).catch(() => null);
  }, [user?.id, cacheKey]);

  return {
    hasAcknowledged,
    acknowledgedAt,
    acknowledge,
    loading: hasAcknowledged === null,
  };
};
