import React, { useEffect, useRef } from 'react';
import { Animated, ActivityIndicator, Pressable, StyleSheet, Text, View, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpload } from '../context/UploadContext';
import { navigateTo } from '../navigation/navigationRef';
import ProgressMessage from './ProgressMessage';

const BANNER_HEIGHT = 44;

const PROCESSING_MESSAGES = (bureau) => [
  `Analyzing your ${bureau || 'credit'} report...`,
  'Detecting negative items...',
  'Building your action plan...',
];

// Floats above the navigation stack. Reads upload state from UploadContext;
// invisible (translateY=-full) when status='idle', slides down for
// processing/complete/error.
const ProcessingBanner = () => {
  const insets = useSafeAreaInsets();
  const { status, bureau, accountsFound, errorMessage, dismissBanner } = useUpload();
  const visible = status !== 'idle';

  const translateY = useRef(new Animated.Value(-(BANNER_HEIGHT + 60))).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -(BANNER_HEIGHT + insets.top + 20),
      useNativeDriver: true,
      bounciness: 6,
      speed: 14,
    }).start();
  }, [visible, insets.top, translateY]);

  // Don't take pointer events when off-screen so the banner doesn't block
  // taps near the top of the screen while hidden.
  const pointerEvents = visible ? 'auto' : 'none';

  // Tap routes vary by state.
  const handlePress = () => {
    if (status === 'complete') {
      navigateTo('Accounts');
    } else if (status === 'error') {
      navigateTo('Upload');
    } else {
      navigateTo('Upload');
    }
  };

  // Visual config per state
  const config = (() => {
    if (status === 'complete') {
      return {
        bg: '#1D9E75',
        accent: '#0F6E51',
        leftIcon: <Text style={styles.staticIcon}>✅</Text>,
        text: `Your analysis is ready! ${accountsFound ? `${accountsFound} account${accountsFound === 1 ? '' : 's'} found · ` : ''}Tap to view`,
        textColor: '#FFFFFF',
      };
    }
    if (status === 'error') {
      return {
        bg: '#B91C1C',
        accent: '#7F1D1D',
        leftIcon: <Text style={styles.staticIcon}>⚠️</Text>,
        text: errorMessage || 'Analysis failed. Tap to try again',
        textColor: '#FFFFFF',
      };
    }
    return {
      bg: '#0A1628',
      accent: '#7C3AED',
      leftIcon: <ActivityIndicator size="small" color="#48CAE4" />,
      text: null,
      textColor: '#F1F5F9',
    };
  })();

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[
        styles.wrap,
        { paddingTop: insets.top, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={[styles.banner, { backgroundColor: config.bg, borderLeftColor: config.accent }]}
        android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      >
        <View style={styles.leftCol}>{config.leftIcon}</View>

        {status === 'processing' ? (
          <ProgressMessage
            messages={PROCESSING_MESSAGES(bureau)}
            interval={3000}
            color={config.textColor}
            style={styles.messageWrap}
            textStyle={styles.messageText}
          />
        ) : (
          <Text numberOfLines={1} style={[styles.staticText, { color: config.textColor }]}>
            {config.text}
          </Text>
        )}

        {status === 'processing' ? (
          <Text style={styles.tapHint}>Tap to view</Text>
        ) : status === 'complete' ? (
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation?.(); dismissBanner(); }}
            style={styles.dismissBtn}
          >
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 12,
  },
  banner: {
    height: BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  leftCol: { width: 24, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  staticIcon: { fontSize: 18 },
  messageWrap: { flex: 1, marginTop: 0, paddingHorizontal: 0, alignItems: 'flex-start' },
  messageText: { fontSize: 13, fontWeight: '500', textAlign: 'left' },
  staticText: { flex: 1, fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  tapHint: { color: '#48CAE4', fontSize: 12, fontWeight: '700', marginLeft: 10, letterSpacing: 0.3 },
  dismissBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  dismissText: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '700' },
});

export default ProcessingBanner;
