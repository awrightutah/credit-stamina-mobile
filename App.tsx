/**
 * Credit Stamina Mobile App
 * React Native with TypeScript
 */

import React from 'react';
import { StatusBar, StyleSheet, useColorScheme, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import AppNavigator from './src/navigation/AppNavigator';
import navigationRef from './src/navigation/navigationRef';
import useNetworkStatus from './src/hooks/useNetworkStatus';
import OfflineBanner from './src/components/OfflineBanner';

function AppContent() {
  const { loading, isAuthenticated } = useAuth();
  const isDarkMode = useColorScheme() === 'dark';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  // Universal linking config. The creditstamina:// scheme is registered in
  // ios/CreditStamina/Info.plist. Accept-invite deep link:
  //   creditstamina://accept?token=XYZ  → AcceptInvite screen with { token }
  const linking = {
    prefixes: ['creditstamina://'],
    config: {
      screens: {
        AcceptInvite: 'accept',
      },
    },
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <AppNavigator />
    </NavigationContainer>
  );
}

function App() {
  const { isOnline } = useNetworkStatus();

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
        <AuthProvider>
          <SubscriptionProvider>
            <AppContent />
          </SubscriptionProvider>
        </AuthProvider>
        <OfflineBanner visible={!isOnline} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F1A',
  },
});

export default App;