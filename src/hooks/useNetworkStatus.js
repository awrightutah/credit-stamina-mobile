import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { API_URL } from '../config/env';

const PING_INTERVAL_MS = 15000; // check every 15 s while app is active
const PING_TIMEOUT_MS  = 5000;

/**
 * Returns { isOnline: boolean }.
 * Uses a lightweight fetch ping to the Railway health endpoint so we don't need
 * any new native dependencies.
 */
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);
  const timerRef    = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const ping = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      const res = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache:  'no-store',
      });
      clearTimeout(timeout);
      setIsOnline(res.ok || res.status < 500);
    } catch {
      setIsOnline(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    ping();
    timerRef.current = setInterval(ping, PING_INTERVAL_MS);
  }, [ping]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startPolling();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        startPolling();
      } else if (nextState.match(/inactive|background/)) {
        stopPolling();
      }
      appStateRef.current = nextState;
    });

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [startPolling, stopPolling]);

  return { isOnline };
};

export default useNetworkStatus;
