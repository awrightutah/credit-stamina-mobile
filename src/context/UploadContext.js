import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { creditReportsAPI } from '../services/api';

const POLL_INTERVAL_MS  = 5000;
const POLL_TIMEOUT_MS   = 8 * 60 * 1000; // 8 minutes hard cap (reports can take 2-5 min normally)
const COMPLETE_DISMISS_MS = 5000;        // auto-dismiss the green banner after 5s

const UploadContext = createContext({
  isProcessing: false,
  uploadId:     null,
  bureau:       null,
  status:       'idle', // 'idle' | 'processing' | 'complete' | 'error'
  laneCounts:   null,
  accountsFound: 0,
  errorMessage: null,
  startProcessing:    () => {},
  completeProcessing: () => {},
  dismissBanner:      () => {},
});

export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const [uploadId,     setUploadId]     = useState(null);
  const [bureau,       setBureau]       = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [laneCounts,   setLaneCounts]   = useState(null);
  const [accountsFound, setAccountsFound] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const intervalRef = useRef(null);
  const deadlineRef = useRef(0);
  const dismissTimerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Hard reset back to hidden state.
  const dismissBanner = useCallback(() => {
    stopPolling();
    clearDismissTimer();
    setUploadId(null);
    setBureau(null);
    setStatus('idle');
    setLaneCounts(null);
    setAccountsFound(0);
    setErrorMessage(null);
  }, [stopPolling, clearDismissTimer]);

  // Manual completion (used by callers that already have lane counts).
  const completeProcessing = useCallback((counts) => {
    stopPolling();
    if (counts) setLaneCounts(counts);
    setStatus('complete');
    clearDismissTimer();
    dismissTimerRef.current = setTimeout(dismissBanner, COMPLETE_DISMISS_MS);
  }, [stopPolling, clearDismissTimer, dismissBanner]);

  const startProcessing = useCallback((newUploadId, newBureau) => {
    if (!newUploadId) return;
    stopPolling();
    clearDismissTimer();
    setUploadId(newUploadId);
    setBureau(newBureau || null);
    setStatus('processing');
    setLaneCounts(null);
    setAccountsFound(0);
    setErrorMessage(null);
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;

    const tick = async () => {
      if (Date.now() > deadlineRef.current) {
        stopPolling();
        setStatus('error');
        setErrorMessage('Your report is still processing in the background. We will notify you when it is ready.');
        return;
      }
      try {
        const res = await creditReportsAPI.getUploadStatus(newUploadId);
        const payload = res?.data || {};
        if (payload.status === 'complete') {
          stopPolling();
          const d = payload.data || {};
          setLaneCounts({
            activeDamage:  d.active_damage_count ?? 0,
            removable:     d.removable_count ?? 0,
            agingMonitor:  d.aging_monitor_count ?? 0,
          });
          setAccountsFound(d.accounts_extracted ?? 0);
          setStatus('complete');
          clearDismissTimer();
          dismissTimerRef.current = setTimeout(dismissBanner, COMPLETE_DISMISS_MS);
        } else if (payload.status === 'error') {
          stopPolling();
          setStatus('error');
          setErrorMessage(payload.error || 'Analysis failed. Please try again.');
        }
      } catch (e) {
        // Network blip — keep polling until the deadline kicks in.
        console.warn('[UploadContext] poll error:', e?.message);
      }
    };

    tick(); // fire-once
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [stopPolling, clearDismissTimer, dismissBanner]);

  // Tear down on unmount (app shutdown / logout)
  useEffect(() => () => {
    stopPolling();
    clearDismissTimer();
  }, [stopPolling, clearDismissTimer]);

  return (
    <UploadContext.Provider
      value={{
        isProcessing: status === 'processing',
        uploadId,
        bureau,
        status,
        laneCounts,
        accountsFound,
        errorMessage,
        startProcessing,
        completeProcessing,
        dismissBanner,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};
