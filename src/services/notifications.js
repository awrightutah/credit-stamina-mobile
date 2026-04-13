import { Platform, NativeModules, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const TOKEN_KEY = '@push_device_token';

// ── Guard: only use PushNotificationIOS if the native module is actually present ──
// The NativeEventEmitter inside the library throws if RNCPushNotificationIOS is null,
// which happens in the simulator on cold boot or when the app loads before the bridge
// is fully ready. All exported functions check this before touching the library.

const isNativeModuleAvailable = () => {
  try {
    return (
      Platform.OS === 'ios' &&
      !!NativeModules.RNCPushNotificationIOS
    );
  } catch {
    return false;
  }
};

// Lazy accessor so we never import the module at the top level on unsupported platforms.
// This avoids the NativeEventEmitter construction happening at require-time.
let _PushNotificationIOS = null;
const getPushLib = () => {
  if (!isNativeModuleAvailable()) return null;
  if (!_PushNotificationIOS) {
    try {
      _PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
    } catch (e) {
      console.warn('[Notifications] could not load PushNotificationIOS:', e?.message);
      return null;
    }
  }
  return _PushNotificationIOS;
};

// ── Permission request ────────────────────────────────────────────────────────

export const requestNotificationPermission = () =>
  new Promise((resolve) => {
    const lib = getPushLib();
    if (!lib) { resolve({ granted: false }); return; }
    try {
      lib.requestPermissions({ alert: true, badge: true, sound: true })
        .then((perms) => resolve({ granted: !!(perms.alert || perms.badge || perms.sound) }))
        .catch(() => resolve({ granted: false }));
    } catch (e) {
      console.warn('[Notifications] requestPermissions error:', e?.message);
      resolve({ granted: false });
    }
  });

export const checkNotificationPermissions = () =>
  new Promise((resolve) => {
    const lib = getPushLib();
    if (!lib) { resolve({ alert: false, badge: false, sound: false }); return; }
    try {
      lib.checkPermissions((perms) =>
        resolve({ alert: !!perms.alert, badge: !!perms.badge, sound: !!perms.sound })
      );
    } catch (e) {
      console.warn('[Notifications] checkPermissions error:', e?.message);
      resolve({ alert: false, badge: false, sound: false });
    }
  });

// ── Device token ──────────────────────────────────────────────────────────────

export const getStoredDeviceToken = async () => {
  try { return await AsyncStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const registerForPushNotifications = () =>
  new Promise((resolve) => {
    const lib = getPushLib();
    if (!lib) { resolve(null); return; }

    let settled = false;
    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { lib.removeEventListener('register'); } catch {}
      resolve(token);
    };

    const timer = setTimeout(() => finish(null), 10000);

    try {
      lib.addEventListener('register', (deviceToken) => {
        AsyncStorage.setItem(TOKEN_KEY, deviceToken).catch(() => null);
        uploadTokenToBackend(deviceToken).catch(() => null);
        finish(deviceToken);
      });

      lib.requestPermissions({ alert: true, badge: true, sound: true })
        .catch(() => finish(null));
    } catch (e) {
      console.warn('[Notifications] register error:', e?.message);
      finish(null);
    }
  });

export const uploadTokenToBackend = async (token) => {
  if (!token) return;
  try {
    await api.post('/api/notifications/register-token', { device_token: token, platform: 'ios' });
  } catch (e) {
    console.warn('[Notifications] token upload failed:', e?.message);
  }
};

export const unregisterPushNotifications = async () => {
  try {
    const token = await getStoredDeviceToken();
    if (token) {
      await api.post('/api/notifications/unregister-token', { device_token: token, platform: 'ios' })
        .catch(() => null);
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('[Notifications] unregister error:', e?.message);
  }
};

// ── Global notification handlers ──────────────────────────────────────────────
// Call once at app startup (index.js). Safe to call even if native module is absent.

export const setupNotificationHandlers = ({ onNotification, onOpen } = {}) => {
  const lib = getPushLib();
  if (!lib) {
    console.log('[Notifications] native module not available — push notifications disabled');
    return () => {}; // no-op cleanup
  }

  try {
    lib.addEventListener('notification', (notification) => {
      try {
        notification.finish(lib.FetchResult?.NoData ?? 'noData');
        onNotification?.(formatNotification(notification));
      } catch (e) {
        console.warn('[Notifications] notification handler error:', e?.message);
      }
    });

    lib.addEventListener('localNotification', (notification) => {
      try {
        onOpen?.(formatNotification(notification));
      } catch (e) {
        console.warn('[Notifications] localNotification handler error:', e?.message);
      }
    });

    lib.addEventListener('registrationError', (err) => {
      console.warn('[Notifications] registration error:', err?.message);
    });
  } catch (e) {
    console.warn('[Notifications] setupNotificationHandlers error:', e?.message);
    return () => {};
  }

  return () => {
    try {
      lib.removeEventListener('notification');
      lib.removeEventListener('localNotification');
      lib.removeEventListener('registrationError');
    } catch {}
  };
};

const formatNotification = (notification) => {
  try {
    return {
      id:    notification.getId?.()          ?? null,
      title: notification.getTitle?.()       ?? '',
      body:  notification.getMessage?.()     ?? '',
      data:  notification.getData?.()        ?? {},
      badge: notification.getBadgeCount?.()  ?? 0,
    };
  } catch {
    return { id: null, title: '', body: '', data: {}, badge: 0 };
  }
};

// ── Badge management ──────────────────────────────────────────────────────────

export const setBadgeCount = (count) => {
  const lib = getPushLib();
  if (!lib) return;
  try { lib.setApplicationIconBadgeNumber(count); } catch {}
};

export const clearBadge = () => setBadgeCount(0);

// ── Local notifications ───────────────────────────────────────────────────────

export const scheduleLocalNotification = (title, body, fireDate, userInfo = {}) => {
  const lib = getPushLib();
  if (!lib) return;
  try {
    lib.scheduleLocalNotification({
      alertTitle: title,
      alertBody:  body,
      fireDate:   (fireDate ?? new Date(Date.now() + 5000)).toISOString(),
      userInfo,
      isSilent:   false,
    });
  } catch (e) {
    console.warn('[Notifications] scheduleLocalNotification error:', e?.message);
  }
};

// ── Letter follow-up reminders ────────────────────────────────────────────────
// isBureau=true  → 30-day window (FCRA bureau dispute timeline)
// isBureau=false → 14-day window (creditor response window)

const letterReminderKey = (id) => `@letter_reminder_${id}`;

export const scheduleLetterReminder = async (letterId, recipientName, isBureau = true) => {
  const daysOut  = isBureau ? 30 : 14;
  const fireDate = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000);
  const body     = `It has been ${daysOut} days since your letter to ${recipientName}. Time to follow up — tap to send a stronger letter.`;

  try {
    await AsyncStorage.setItem(letterReminderKey(letterId), fireDate.toISOString());
    const lib = getPushLib();
    if (!lib) return;
    lib.scheduleLocalNotification({
      alertTitle: 'Letter Follow-Up Reminder',
      alertBody:  body,
      fireDate:   fireDate.toISOString(),
      userInfo:   { screen: 'Letters', letterId, action: 'follow_up' },
      isSilent:   false,
    });
  } catch (e) {
    console.warn('[Notifications] scheduleLetterReminder error:', e?.message);
  }
};

export const cancelLetterReminder = async (letterId) => {
  try {
    await AsyncStorage.removeItem(letterReminderKey(letterId));
    // PushNotificationIOS doesn't support cancel-by-userInfo, but removing from
    // storage prevents any deep-link action if the notification still fires.
  } catch (e) {
    console.warn('[Notifications] cancelLetterReminder error:', e?.message);
  }
};
