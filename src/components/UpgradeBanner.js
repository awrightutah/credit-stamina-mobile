import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSubscription } from '../context/SubscriptionContext';
import { BETA_BUILD } from '../config/env';
import COLORS from '../theme/colors';

const DISMISS_KEY = '@cs_upgrade_banner_dismissed_at';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Soft inline upgrade card for Dashboard / similar surfaces. Hidden when:
//   • user is paying (subscription.is_active === true), or
//   • user dismissed within the last 3 days.
// Shown for free + trial users.
const UpgradeBanner = () => {
  const navigation = useNavigation();
  const { subscription } = useSubscription();
  const [hidden, setHidden] = useState(true); // start hidden until we read storage

  const isPaid = subscription?.is_active === true;
  const price = BETA_BUILD ? 9.99 : 24.99;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPaid) {
        if (!cancelled) setHidden(true);
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(DISMISS_KEY);
        const dismissedAt = raw ? parseInt(raw, 10) : 0;
        const stillDismissed = dismissedAt && (Date.now() - dismissedAt) < DISMISS_TTL_MS;
        if (!cancelled) setHidden(!!stillDismissed);
      } catch {
        if (!cancelled) setHidden(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isPaid]);

  if (isPaid || hidden) return null;

  const handleDismiss = async () => {
    setHidden(true);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const handleUpgrade = () => {
    // Navigate to the Profile tab and open its existing subscription
    // upgrade modal via a route param. Profile reads openUpgrade and
    // clears it after consuming.
    navigation.navigate('MainTabs', { screen: 'Profile', params: { openUpgrade: true } });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconBubble}>
          <Text style={styles.iconText}>👑</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Unlock your full credit repair toolkit</Text>
          <Text style={styles.subtitle}>Generate AI dispute letters, get coaching and more.</Text>
          <TouchableOpacity style={styles.cta} onPress={handleUpgrade} activeOpacity={0.85}>
            <Text style={styles.ctaText}>Upgrade to Pro — ${price.toFixed(2)}/mo</Text>
          </TouchableOpacity>
        </View>
        <Pressable
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Dismiss upgrade banner"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(124, 58, 237, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 58, 237, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  body: { flex: 1, paddingRight: 16 },
  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.purple,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
});

export default UpgradeBanner;
