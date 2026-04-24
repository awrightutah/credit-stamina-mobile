import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BETA_BUILD } from '../config/env';
import COLORS from '../theme/colors';

const DEFAULT_PERKS = [
  'AI-generated dispute letters',
  'Mail letters via USPS',
  'Letter tracking',
  'Unlimited letters',
];

// Reusable "this is a Pro feature" upgrade gate. Opens via parent state
// when a free user taps a Pro-only action (e.g. Generate Letter).
//   <ProUpgradePrompt visible onClose={...} title="Pro Feature" />
const ProUpgradePrompt = ({
  visible,
  onClose,
  title = 'Dispute letters are a Pro feature',
  perks = DEFAULT_PERKS,
}) => {
  const navigation = useNavigation();
  const price = BETA_BUILD ? 9.99 : 24.99;

  const handleUpgrade = () => {
    onClose?.();
    navigation.navigate('MainTabs', { screen: 'Profile', params: { openUpgrade: true } });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.lockBubble}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>PRO FEATURE</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Upgrade to Pro and unlock everything you need to dispute and improve your credit.</Text>

          <View style={styles.perksList}>
            {perks.map((perk) => (
              <View key={perk} style={styles.perkRow}>
                <Text style={styles.perkCheck}>✓</Text>
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
            <Text style={styles.upgradeBtnText}>Upgrade to Pro — ${price.toFixed(2)}/mo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.6}>
            <Text style={styles.dismissText}>Maybe Later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockEmoji: { fontSize: 28 },
  badge: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
  },
  perksList: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkCheck: { color: COLORS.success, fontSize: 14, fontWeight: '800' },
  perkText: { color: COLORS.text, fontSize: 13, flex: 1 },
  upgradeBtn: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.purple,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dismissBtn: { paddingVertical: 10, alignItems: 'center', alignSelf: 'stretch' },
  dismissText: { color: COLORS.textSecondary, fontSize: 13 },
});

export default ProUpgradePrompt;
