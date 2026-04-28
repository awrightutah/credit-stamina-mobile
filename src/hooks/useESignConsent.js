import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { legalAPI } from '../services/api';

// 1.1 — adds explicit 15 U.S.C. §7001 et seq. citation to the consent copy.
// Existing 1.0 consents remain valid (the substantive agreement is unchanged;
// the citation is a clarifying legal reference), so we don't re-prompt users
// who already consented under 1.0.
const CONSENT_VERSION = '1.1';

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
      // Network-first: always check API for the authoritative state.
      // The cache is a fast-path for status display only and must not gate
      // signing decisions when stale (see commit 5415f85 / today's ESIGN audit).
      const row = await legalAPI.getESignConsent(user.id).catch(() => undefined);
      if (row !== undefined) {
        setConsent(row ?? null);
        if (cacheKey) {
          if (row) {
            AsyncStorage.setItem(cacheKey, JSON.stringify(row)).catch(() => null);
          } else {
            // No active consent server-side — clear cache to prevent stale
            // hasConsented=true on next mount.
            AsyncStorage.removeItem(cacheKey).catch(() => null);
          }
        }
        return;
      }
      // Network failed (not a 4xx — those return null/row). Fall back to cache
      // for offline resilience. The per-sign revalidation in handleOpenSignFlow
      // is the actual gate; this cache is best-effort.
      const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (cached) {
        setConsent(JSON.parse(cached));
        return;
      }
      setConsent(null);
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
