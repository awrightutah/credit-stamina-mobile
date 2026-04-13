import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

/**
 * Slim banner that slides in from the top when the app loses connectivity.
 * Rendered once in App.tsx, driven by useNetworkStatus().
 */
const OfflineBanner = ({ visible }) => {
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:       visible ? 0 : -50,
      useNativeDriver: true,
      speed:         20,
      bounciness:    4,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>📡  No internet connection</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    zIndex:          9999,
    backgroundColor: '#7F1D1D',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems:      'center',
  },
  text: {
    color:      '#FEE2E2',
    fontSize:   13,
    fontWeight: '600',
  },
});

export default OfflineBanner;
