import 'react-native-url-polyfill/auto';
/**
 * @format
 */

import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
// Push notifications are initialized lazily — the native module may not be ready
// on cold boot in the simulator, so we wrap in try/catch and never let it block startup.
try {
  const { setupNotificationHandlers, clearBadge } = require('./src/services/notifications');
  setupNotificationHandlers({
    onNotification: (notification) => {
      console.log('[Push] received:', notification.title);
      clearBadge();
    },
    onOpen: (notification) => {
      console.log('[Push] opened:', notification.title, notification.data);
      clearBadge();
    },
  });
} catch (e) {
  console.warn('[Push] notification setup skipped:', e?.message);
}

AppRegistry.registerComponent(appName, () => App);
