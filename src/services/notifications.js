import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import api from './api';
import { version as appVersion } from '../../package.json';

const TOKEN_KEY = '@push_device_token';

// ── Firebase availability guard ────────────────────────────────────────────────
// In tests, Storybook, or environments where the native Firebase module isn't
// linked, every push function silently no-ops instead of throwing.

const isFirebaseAvailable = () => {
  try {
    return typeof messaging === 'function' && !!messaging().app;
  } catch {
    return false;
  }
};

// ── PushNotificationIOS availability guard (LOCAL notifications only) ─────────
// Kept around for scheduleLocalNotification + badge management. iOS-only.

const isPushNotificationIOSAvailable = () => {
  try {
    return Platform.OS === 'ios' && !!NativeModules.RNCPushNotificationIOS;
  } catch {
    return false;
  }
};

let _PushNotificationIOS = null;
const getPushNotificationIOS = () => {
  if (!isPushNotificationIOSAvailable()) return null;
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

// ── Permission helpers ────────────────────────────────────────────────────────
// AuthorizationStatus enum (RNFB messaging):
//   -1 NOT_DETERMINED, 0 DENIED, 1 AUTHORIZED, 2 PROVISIONAL, 3 EPHEMERAL
// "Granted" = AUTHORIZED | PROVISIONAL | EPHEMERAL.

const isGrantedStatus = (status) => {
  const s = messaging.AuthorizationStatus;
  return status === s.AUTHORIZED || status === s.PROVISIONAL || status === s.EPHEMERAL;
};

const permissionsResult = (granted, status = null) => ({
  granted,
  alert: granted,
  badge: granted,
  sound: granted,
  status,
});

export const requestNotificationPermission = async () => {
  if (!isFirebaseAvailable()) return permissionsResult(false);
  try {
    const status = await messaging().requestPermission();
    return permissionsResult(isGrantedStatus(status), status);
  } catch (e) {
    console.warn('[Notifications] requestPermission error:', e?.message);
    return permissionsResult(false);
  }
};

export const checkNotificationPermissions = async () => {
  if (!isFirebaseAvailable()) return permissionsResult(false);
  try {
    const status = await messaging().hasPermission();
    return permissionsResult(isGrantedStatus(status), status);
  } catch (e) {
    console.warn('[Notifications] hasPermission error:', e?.message);
    return permissionsResult(false);
  }
};

// ── Device token (FCM) ────────────────────────────────────────────────────────

export const uploadTokenToBackend = async (token) => {
  if (!token) return;
  try {
    await api.post('/api/devices/register', {
      token,
      platform: Platform.OS,
      app_version: appVersion,
    });
  } catch (e) {
    console.warn('[Notifications] token upload failed:', e?.message);
  }
};

export const registerForPushNotifications = async () => {
  if (!isFirebaseAvailable()) return null;
  try {
    const token = await messaging().getToken();
    if (!token) return null;
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => null);
    await uploadTokenToBackend(token);
    return token;
  } catch (e) {
    console.warn('[Notifications] getToken error:', e?.message);
    return null;
  }
};

export const unregisterPushNotifications = async () => {
  try {
    const stored = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (stored) {
      await api.post('/api/devices/unregister', {
        token: stored,
        platform: Platform.OS,
      }).catch(() => null);
    }
    if (isFirebaseAvailable()) {
      await messaging().deleteToken().catch(() => null);
    }
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => null);
  } catch (e) {
    console.warn('[Notifications] unregister error:', e?.message);
  }
};

// Subscribe to FCM token rotation. Caller invokes the returned function to unsub.
export const onTokenRefresh = (callback) => {
  if (!isFirebaseAvailable() || typeof callback !== 'function') return () => {};
  try {
    return messaging().onTokenRefresh(async (newToken) => {
      try {
        await AsyncStorage.setItem(TOKEN_KEY, newToken).catch(() => null);
        await uploadTokenToBackend(newToken);
        callback(newToken);
      } catch (e) {
        console.warn('[Notifications] onTokenRefresh handler error:', e?.message);
      }
    });
  } catch (e) {
    console.warn('[Notifications] onTokenRefresh subscribe error:', e?.message);
    return () => {};
  }
};

// ── Global notification handlers ──────────────────────────────────────────────
// Subscribes to:
//   - Firebase foreground messages          → onNotification
//   - Firebase background-tap (warm)        → onOpen
//   - Firebase cold-start tap (one-shot)    → onOpen
//   - PushNotificationIOS local-notif tap   → onOpen  (letter reminders, etc.)

export const setupNotificationHandlers = ({ onNotification, onOpen } = {}) => {
  const unsubs = [];

  if (isFirebaseAvailable()) {
    try {
      unsubs.push(
        messaging().onMessage((remoteMessage) => {
          try { onNotification?.(formatRemoteMessage(remoteMessage)); }
          catch (e) { console.warn('[Notifications] onMessage handler error:', e?.message); }
        })
      );
      unsubs.push(
        messaging().onNotificationOpenedApp((remoteMessage) => {
          try { onOpen?.(formatRemoteMessage(remoteMessage)); }
          catch (e) { console.warn('[Notifications] onNotificationOpenedApp handler error:', e?.message); }
        })
      );
      messaging()
        .getInitialNotification()
        .then((remoteMessage) => {
          if (remoteMessage) {
            try { onOpen?.(formatRemoteMessage(remoteMessage)); }
            catch (e) { console.warn('[Notifications] getInitialNotification handler error:', e?.message); }
          }
        })
        .catch(() => null);
    } catch (e) {
      console.warn('[Notifications] Firebase handler setup error:', e?.message);
    }
  } else {
    console.log('[Notifications] Firebase not available — remote push disabled');
  }

  const lib = getPushNotificationIOS();
  if (lib) {
    try {
      lib.addEventListener('localNotification', (notification) => {
        try { onOpen?.(formatLocalNotification(notification)); }
        catch (e) { console.warn('[Notifications] localNotification handler error:', e?.message); }
      });
      unsubs.push(() => {
        try { lib.removeEventListener('localNotification'); } catch {}
      });
    } catch (e) {
      console.warn('[Notifications] local handler setup error:', e?.message);
    }
  }

  return () => {
    for (const u of unsubs) {
      try { u(); } catch {}
    }
  };
};

const formatRemoteMessage = (m) => {
  try {
    return {
      id:    m?.messageId ?? null,
      title: m?.notification?.title ?? '',
      body:  m?.notification?.body  ?? '',
      data:  m?.data ?? {},
      badge: 0,
    };
  } catch {
    return { id: null, title: '', body: '', data: {}, badge: 0 };
  }
};

const formatLocalNotification = (notification) => {
  try {
    return {
      id:    notification.getId?.()         ?? null,
      title: notification.getTitle?.()      ?? '',
      body:  notification.getMessage?.()    ?? '',
      data:  notification.getData?.()       ?? {},
      badge: notification.getBadgeCount?.() ?? 0,
    };
  } catch {
    return { id: null, title: '', body: '', data: {}, badge: 0 };
  }
};

// ── Badge management (iOS local) ──────────────────────────────────────────────

export const setBadgeCount = (count) => {
  const lib = getPushNotificationIOS();
  if (!lib) return;
  try { lib.setApplicationIconBadgeNumber(count); } catch {}
};

export const clearBadge = () => setBadgeCount(0);

// ── Local notifications (iOS only via PushNotificationIOS) ────────────────────

export const scheduleLocalNotification = (title, body, fireDate, userInfo = {}) => {
  const lib = getPushNotificationIOS();
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
    const lib = getPushNotificationIOS();
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
  } catch (e) {
    console.warn('[Notifications] cancelLetterReminder error:', e?.message);
  }
};
