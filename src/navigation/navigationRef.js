import { createRef } from 'react';

/**
 * Shared navigation ref — import this wherever you need to navigate outside of
 * a React component (e.g. push notification handlers, api interceptors).
 *
 * In App.tsx:   <NavigationContainer ref={navigationRef}>
 * Anywhere else: import { navigateTo } from './navigationRef';
 */

const navigationRef = createRef();

export const navigateTo = (screenName, params) => {
  if (navigationRef.current?.isReady()) {
    navigationRef.current.navigate(screenName, params);
  } else {
    console.warn('[navigationRef] Navigator not ready — skipping navigate to', screenName);
  }
};

export default navigationRef;
