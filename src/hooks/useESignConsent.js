import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { legalAPI } from '../services/api';

const CONSENT_VERSION = '1.0';

/**
 * Tracks the current user's eSign consent status.
 * Reads from AsyncStorage first (fast path), then Supabase.
 * `consent === undefined` means still loading.
 * `consent === null`      means not consented (or withdrawn).
 * `consent === { ... }`   means active consent on record.
 */
export const useESignConsent = () => {
  const { user } = useAuth();
  const [consent, setConsent] = useState(undefined);

  const cacheKey = user?.id ? `@cs_esign_consent_${user.id}` : null;

  const load = useCallback(async () => {
    if (!user?.id) { setConsent(null); return; }
    try {
      const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (cached) {
        setConsent(JSON.parse(cached));
        return;
      }
      const row = await legalAPI.getESignConsent(user.id).catch(() => null);
      setConsent(row ?? null);
      if (row && cacheKey) {
        AsyncStorage.setItem(cacheKey, JSON.stringify(row)).catch(() => null);
      }
    } catch {
      setConsent(null);
    }
  }, [user?.id, cacheKey]);

  useEffect(() => { load(); }, [load]);

  const giveConsent = useCallback(async () => {
    if (!user?.id) throw new Error('Not authenticated');
    const row = await legalAPI.recordESignConsent(user.id, CONSENT_VERSION);
    setConsent(row);
    if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(row)).catch(() => null);
    return row;
  }, [user?.id, cacheKey]);

  const withdrawConsent = useCallback(async () => {
    if (!user?.id) return;
    await legalAPI.withdrawESignConsent(user.id);
    setConsent(null);
    if (cacheKey) AsyncStorage.removeItem(cacheKey).catch(() => null);
  }, [user?.id, cacheKey]);

  return {
    hasConsented: consent != null && consent !== undefined,
    consent,
    consentDate: consent?.consented_at ?? null,
    consentId: consent?.id ?? null,
    giveConsent,
    withdrawConsent,
    loading: consent === undefined,
    reload: load,
  };
};
