import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { pointsAPI, billingAPI, smsAPI, notificationsAPI, adminAPI, POINTS_GOAL } from '../services/api';
// Lazy-load push helpers so a missing/unready native module never crashes this screen
const getPushHelpers = () => {
  try {
    const mod = require('../services/notifications');
    return {
      checkNotificationPermissions:  mod.checkNotificationPermissions  ?? (async () => ({ alert: false })),
      registerForPushNotifications:  mod.registerForPushNotifications  ?? (async () => null),
      unregisterPushNotifications:   mod.unregisterPushNotifications   ?? (async () => {}),
    };
  } catch {
    return {
      checkNotificationPermissions:  async () => ({ alert: false }),
      registerForPushNotifications:  async () => null,
      unregisterPushNotifications:   async () => {},
    };
  }
};
import PaymentModal from '../components/PaymentModal';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  background: '#0F172A',
  card: '#1E293B',
  surface: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F97316',
  success: '#059669',
  purple: '#7C3AED',
  amber: '#F97316',
};

// ─── Menu Row ──────────────────────────────────────────────────────────────────
const MenuItem = ({ icon, title, subtitle, onPress, danger, last }) => (
  <TouchableOpacity
    style={[styles.menuItem, !last && styles.menuItemBorder]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.menuIconWrap, danger && { backgroundColor: COLORS.danger + '20' }]}>
      <Text style={styles.menuIconText}>{icon}</Text>
    </View>
    <View style={styles.menuContent}>
      <Text style={[styles.menuTitle, danger && { color: COLORS.danger }]}>{title}</Text>
      {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
    </View>
    <Text style={styles.menuChevron}>›</Text>
  </TouchableOpacity>
);

// ─── Toggle Row ────────────────────────────────────────────────────────────────
const ToggleRow = ({ title, subtitle, value, onChange, last }) => (
  <View style={[styles.toggleRow, !last && styles.menuItemBorder]}>
    <View style={styles.menuContent}>
      <Text style={styles.menuTitle}>{title}</Text>
      {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: COLORS.border, true: COLORS.purple }}
      thumbColor={value ? '#FFFFFF' : COLORS.textSecondary}
      ios_backgroundColor={COLORS.border}
    />
  </View>
);

// ─── Section Card ──────────────────────────────────────────────────────────────
const SectionCard = ({ title, children }) => (
  <View style={styles.sectionBlock}>
    <Text style={styles.sectionLabel}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────
const ProfileScreen = ({ route }) => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { subscription, refreshSubscription } = useSubscription();
  const [points, setPoints] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);

  const UPGRADE_PLAN_ID = 'Monthly'; // matches PWA plan ID sent to /api/create-checkout

  useEffect(() => {
    if (user?.id) fetchUserData();
  }, [user?.id]);

  // Refresh subscription (and therefore promo_price) every time the screen
  // comes into focus. Covers the post-registration race where promoAPI.apply
  // finishes after SubscriptionContext's initial fetch has already run, plus
  // any later navigation back into Profile after cancel/pause/upgrade flows
  // in other screens.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) refreshSubscription();
    }, [user?.id, refreshSubscription])
  );

  // Deep-link: navigation.navigate('MainTabs', { screen: 'Profile', params: { openUpgrade: true } })
  // from UpgradeBanner / ProUpgradePrompt opens the Subscribe modal here.
  // Consume the param once so re-renders don't re-trigger.
  useEffect(() => {
    if (route?.params?.openUpgrade) {
      setUpgradeVisible(true);
      navigation.setParams?.({ openUpgrade: undefined });
    }
  }, [route?.params?.openUpgrade]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUserData = async () => {
    try {
      const [pointsRes, prefsRes] = await Promise.all([
        pointsAPI.get().catch(() => null),
        smsAPI.getPreferences().catch(() => null),
      ]);
      const raw = pointsRes?.data || pointsRes;
      setPoints(raw?.points ?? raw?.total ?? 0);
      const prefs = prefsRes?.data?.preferences ?? prefsRes?.data ?? {};
      if (typeof prefs.sms_enabled === 'boolean') setSmsEnabled(prefs.sms_enabled);

      // Admin check — read from auth user_metadata (no RLS issues) with DB fallback
      const metaAdmin = user?.user_metadata?.is_admin === true;
      if (metaAdmin) {
        setIsAdmin(true);
      } else {
        const dbAdmin = await adminAPI.isAdmin().catch(() => false);
        setIsAdmin(dbAdmin);
      }

      // Reflect actual iOS permission state for the toggle
      const { checkNotificationPermissions } = getPushHelpers();
      const { alert } = await checkNotificationPermissions().catch(() => ({ alert: false }));
      setNotificationsEnabled(alert);
    } catch (err) {
      console.error('[Profile] fetch error:', err);
    }
  };

  const handleRedeemPoints = () => {
    Alert.alert(
      'Redeem Free Month',
      `Redeem ${POINTS_GOAL} points for 1 free month of Credit Stamina Pro?\n\nYou have ${points} points. ${points - POINTS_GOAL} points will remain after redemption.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeemLoading(true);
            try {
              const res = await pointsAPI.redeem();
              if (res?.data?.success) {
                setPoints(res.data.remaining);
                Alert.alert('🎉 Redeemed!', 'Your free month has been applied. Your subscription will be extended by 30 days. Please contact support@creditstamina.com if you have questions.');
              } else {
                Alert.alert('Not Enough Points', res?.data?.message || `You need ${POINTS_GOAL} points to redeem a free month.`);
              }
            } catch {
              Alert.alert('Error', 'Could not process redemption. Please try again or contact support.');
            } finally {
              setRedeemLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleNotificationsToggle = async (val) => {
    if (val) {
      // User wants to enable — request permission + register token
      const { registerForPushNotifications } = getPushHelpers();
      const token = await registerForPushNotifications().catch(() => null);
      if (token) {
        setNotificationsEnabled(true);
        notificationsAPI.updatePreferences({ push_enabled: true }).catch(() => null);
      } else {
        // Permission denied — iOS won't prompt again, send user to Settings
        Alert.alert(
          'Notifications Blocked',
          'To receive Credit Stamina alerts, go to Settings → Credit Stamina → Notifications and enable them.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
          ]
        );
        // Leave toggle off
        setNotificationsEnabled(false);
      }
    } else {
      // User disabling — deregister token
      setNotificationsEnabled(false);
      const { unregisterPushNotifications } = getPushHelpers();
      await unregisterPushNotifications().catch(() => null);
      notificationsAPI.updatePreferences({ push_enabled: false }).catch(() => null);
    }
  };

  const handlePauseSubscription = () => {
    Alert.alert(
      'Pause Subscription',
      'Pausing will temporarily suspend your subscription. You can resume anytime.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Pause Subscription',
          onPress: async () => {
            try {
              await billingAPI.pauseSubscription();
              refreshSubscription();
              Alert.alert('Subscription Paused', 'Your subscription has been paused. You can resume it at any time from this screen.');
            } catch {
              Alert.alert('Contact Support', 'To pause your subscription, please email support@creditstamina.com.');
            }
          },
        },
      ]
    );
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription?',
      'You\'ll keep full access to all Credit Stamina features — AI analysis, dispute letters, and score tracking — until your current billing period ends.\n\nAfter that date your account will revert to the free plan and these features will no longer be available.',
      [
        { text: 'Keep My Subscription', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await billingAPI.cancelSubscription();
              refreshSubscription();
              Alert.alert(
                'Subscription Cancelled',
                'Your subscription has been cancelled. You\'ll retain full access until your current billing period ends.'
              );
            } catch {
              Alert.alert(
                'Contact Support',
                'We couldn\'t process your cancellation automatically. Please email support@creditstamina.com from your registered address and we\'ll take care of it within 1 business day.'
              );
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (err) {
            console.error('[Profile] logout error:', err);
          }
        },
      },
    ]);
  };

  const meta = user?.user_metadata ?? {};
  const displayName = meta.full_name || meta.name || user?.email?.split('@')[0] || 'Credit Stamina User';
  const initials = displayName.charAt(0).toUpperCase();

  // Build address string for subtitle
  const addressParts = [meta.address_street, meta.address_city, meta.address_state].filter(Boolean);
  const addressLine = addressParts.length > 0 ? addressParts.join(', ') : null;

  // is_active comes directly from /api/subscription (same field the PWA uses)
  const isActive = subscription?.is_active === true ||
    ['paid', 'active'].includes(subscription?.subscription_override?.toLowerCase() ?? '') ||
    ['active', 'trialing', 'paid'].includes(subscription?.status?.toLowerCase() ?? '');
  const planLabel = subscription?.plan_name || subscription?.plan || (isActive ? 'Credit Stamina Premium' : 'Free Plan');
  const promoPrice = subscription?.promo_price ?? null;
  const isTestUser = subscription?.is_test_user === true;
  const displayPrice = promoPrice != null ? promoPrice : 24.99;

  const PRO_FEATURES = [
    'Unlimited dispute letters',
    'AI-powered credit analysis',
    'Personalized 30/60/90 day plan',
    'Priority support',
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {addressLine ? (
              <Text style={styles.userAddress}>{addressLine}</Text>
            ) : null}
          </View>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsNumber}>{points}</Text>
            <Text style={styles.pointsLabel}>pts ⭐</Text>
          </View>
        </View>

        {/* Points Progress Card */}
        <View style={styles.pointsCard}>
          <View style={styles.pointsCardHeader}>
            <Text style={styles.pointsCardTitle}>⭐ Stamina Points</Text>
            <Text style={styles.pointsCardValue}>{points} / {POINTS_GOAL}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(100, (points / POINTS_GOAL) * 100)}%` }]} />
          </View>
          <View style={styles.pointsCardFooter}>
            <Text style={styles.pointsCardHint}>
              {points >= POINTS_GOAL
                ? '🎉 You earned a free month!'
                : `${POINTS_GOAL - points} more points for a free month`}
            </Text>
            {points >= POINTS_GOAL && (
              <TouchableOpacity
                style={[styles.redeemBtn, redeemLoading && { opacity: 0.6 }]}
                onPress={handleRedeemPoints}
                disabled={redeemLoading}
              >
                <Text style={styles.redeemBtnText}>Redeem</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Subscription Card */}
        {isActive ? (
          <View style={styles.subCardActive}>
            {/* Header */}
            <View style={styles.subCardHeader}>
              <View>
                <Text style={styles.subPlanLabel}>ACTIVE SUBSCRIPTION</Text>
                <Text style={styles.subPlanName}>{planLabel}</Text>
                <Text style={styles.subPlanPrice}>
                  ${displayPrice.toFixed(2)} / month{isTestUser ? ' · Beta Tester Rate' : ''}
                </Text>
                {isTestUser && (
                  <Text style={styles.subLockedBadge}>🔒 Locked in for life</Text>
                )}
              </View>
              <View style={styles.subActiveBadge}>
                <Text style={styles.subActiveBadgeText}>✓ Active</Text>
              </View>
            </View>
            {/* Features */}
            <View style={styles.subFeaturesList}>
              {PRO_FEATURES.map((f) => (
                <View key={f} style={styles.subFeatureRow}>
                  <Text style={styles.subFeatureCheck}>✓</Text>
                  <Text style={styles.subFeatureText}>{f}</Text>
                </View>
              ))}
            </View>
            {/* Actions */}
            <View style={styles.subActionRow}>
              <TouchableOpacity style={styles.subPauseBtn} onPress={handlePauseSubscription} activeOpacity={0.8}>
                <Text style={styles.subPauseBtnText}>Pause Subscription</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.subCancelBtn} onPress={handleCancelSubscription} activeOpacity={0.8}>
                <Text style={styles.subCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.subCardFree}>
            <View>
              <Text style={styles.subPlanLabel}>CURRENT PLAN</Text>
              <Text style={styles.subPlanName}>Free Plan</Text>
            </View>
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => setUpgradeVisible(true)}>
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Preferences */}
        <SectionCard title="PREFERENCES">
          <ToggleRow
            title="Push Notifications"
            subtitle="Credit alerts and action reminders"
            value={notificationsEnabled}
            onChange={handleNotificationsToggle}
          />
          <ToggleRow
            title="SMS Reminders"
            subtitle="Text message notifications"
            value={smsEnabled}
            onChange={(val) => {
              setSmsEnabled(val);
              smsAPI.updatePreferences({ sms_enabled: val }).catch(() => null);
            }}
            last
          />
        </SectionCard>

        {/* Admin Dashboard — only visible to admins */}
        {isAdmin && (
          <SectionCard title="ADMIN">
            <MenuItem
              icon="👑"
              title="Admin Dashboard"
              subtitle="Users, subscriptions, activity"
              onPress={() => navigation.navigate('Admin')}
              last
            />
          </SectionCard>
        )}

        {/* Account */}
        <SectionCard title="ACCOUNT">
          <MenuItem
            icon="👨‍👩‍👧"
            title="Family"
            subtitle="Invite a household member — they use your subscription"
            onPress={() => navigation.navigate('Family')}
          />
          <MenuItem
            icon="✏️"
            title="Edit Profile"
            subtitle="Name, phone, mailing address"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon="⚙️"
            title="Settings"
            subtitle="Notifications, display & data"
            onPress={() => navigation.navigate('Settings')}
          />
          <MenuItem
            icon="🔒"
            title="Privacy & Security"
            subtitle="Password, biometrics, data"
            onPress={() => navigation.navigate('PrivacySecurity')}
          />
          <MenuItem
            icon="💳"
            title="Billing & Payments"
            subtitle={isActive ? `${planLabel} · $${displayPrice.toFixed(2)}/mo` : 'Upgrade to Pro'}
            onPress={() => setUpgradeVisible(true)}
          />
          <MenuItem
            icon="🧾"
            title="Billing History"
            subtitle="View past charges and payments"
            onPress={() => navigation.navigate('BillingHistory')}
          />
          <MenuItem
            icon="⚖️"
            title="Dispute Tracker"
            subtitle="Track your bureau disputes"
            onPress={() => navigation.navigate('DisputeTracker')}
            last
          />
        </SectionCard>

        {/* App */}
        <SectionCard title="APP">
          <MenuItem
            icon="📤"
            title="Upload Credit Report"
            subtitle="Add a new PDF report"
            onPress={() => navigation.navigate('Upload')}
          />
          <MenuItem
            icon="📊"
            title="Score History"
            subtitle="View and log credit scores"
            onPress={() => navigation.navigate('Score')}
          />
          <MenuItem
            icon="📋"
            title="30/60/90 Day Plan"
            subtitle="Your AI action plan"
            onPress={() => navigation.navigate('ActionPlan')}
          />
          <MenuItem
            icon="💰"
            title="Budget Tracker"
            subtitle="Manage debt payments"
            onPress={() => navigation.navigate('Budget')}
            last
          />
        </SectionCard>

        {/* Support */}
        <SectionCard title="SUPPORT">
          <MenuItem
            icon="❓"
            title="Help Center"
            subtitle="FAQs and guides"
            onPress={() => Linking.openURL('https://creditstamina.com/help').catch(() => {})}
          />
          <MenuItem
            icon="✉️"
            title="Contact Support"
            subtitle="Get help from our team"
            onPress={() => Linking.openURL('mailto:support@creditstamina.com').catch(() => {})}
          />
          <MenuItem
            icon="🔏"
            title="Privacy Policy"
            onPress={() => Linking.openURL('https://creditstamina.com/privacy').catch(() => {})}
          />
          <MenuItem
            icon="📄"
            title="Terms of Service"
            onPress={() => Linking.openURL('https://creditstamina.com/terms').catch(() => {})}
            last
          />
        </SectionCard>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Credit Stamina v1.0.0</Text>
      </ScrollView>

      {/* Authorize.net subscription payment sheet */}
      <PaymentModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        onSuccess={() => {
          setUpgradeVisible(false);
          refreshSubscription();
          Alert.alert('Welcome to Pro!', 'Your subscription is now active. Enjoy full access to Credit Stamina.');
        }}
        amount={displayPrice}
        description="Credit Stamina Pro — Monthly Subscription"
        mode="subscribe"
        planId={UPGRADE_PLAN_ID}
        promoPrice={promoPrice}
        submitLabel={`Subscribe for $${displayPrice.toFixed(2)}/mo`}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // User card
  userCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  userAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pointsBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pointsNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.amber,
  },
  pointsLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  // Subscription card — active (paid)
  subCardActive: {
    backgroundColor: COLORS.purple + '12',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.purple + '50',
    padding: 18,
    marginBottom: 20,
  },
  subCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  subPlanLabel: {
    fontSize: 10,
    color: COLORS.success,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  subPlanName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subPlanPrice: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  subLockedBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.3,
  },
  subActiveBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
  },
  subActiveBadgeText: {
    color: COLORS.success,
    fontSize: 13,
    fontWeight: '600',
  },
  subFeaturesList: {
    marginBottom: 16,
    gap: 6,
  },
  subFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subFeatureCheck: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '700',
    width: 16,
  },
  subFeatureText: {
    color: COLORS.text,
    fontSize: 14,
  },
  subActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.purple + '30',
  },
  subPauseBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  subPauseBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  subCancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  subCancelBtnText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  // Subscription card — free plan
  subCardFree: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  upgradeBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  upgradeBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 13,
  },
  // Section
  sectionBlock: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconText: {
    fontSize: 16,
  },
  menuContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  menuChevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // Logout
  logoutBtn: {
    backgroundColor: COLORS.danger + '15',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  logoutBtnText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  // Points progress card
  pointsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.amber + '40',
  },
  pointsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pointsCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pointsCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.amber,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: COLORS.amber,
    borderRadius: 4,
  },
  pointsCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsCardHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  redeemBtn: {
    backgroundColor: COLORS.amber,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  redeemBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ProfileScreen;
