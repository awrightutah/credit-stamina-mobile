import React, { useState, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { pointsAPI, billingAPI } from '../services/api';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  primary: '#1E40AF',
  growthGreen: '#059669',
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#F59E0B',
  success: '#059669',
  purple: '#7C3AED',
  amber: '#FBBF24',
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
const ProfileScreen = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const [points, setPoints] = useState(0);
  const [subscription, setSubscription] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  useEffect(() => {
    if (user?.id) fetchUserData();
  }, [user?.id]);

  const fetchUserData = async () => {
    try {
      const [pointsRes, billingRes] = await Promise.all([
        pointsAPI.get().catch(() => null),
        billingAPI.getInfo().catch(() => null),
      ]);
      const raw = pointsRes?.data || pointsRes;
      setPoints(raw?.points ?? raw?.total ?? 0);
      setSubscription(billingRes?.data || billingRes);
    } catch (err) {
      console.error('[Profile] fetch error:', err);
    }
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

  const planLabel = subscription?.plan_name || subscription?.plan || 'Free Plan';
  const isActive = subscription?.status === 'active';

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

        {/* Subscription Banner */}
        <View style={[
          styles.subBanner,
          isActive ? styles.subBannerActive : styles.subBannerFree,
        ]}>
          <View>
            <Text style={styles.subPlanLabel}>CURRENT PLAN</Text>
            <Text style={styles.subPlanName}>{planLabel}</Text>
          </View>
          {isActive ? (
            <View style={styles.subActiveBadge}>
              <Text style={styles.subActiveBadgeText}>✓ Active</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => Alert.alert('Upgrade', 'Subscription management coming soon.')}
            >
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Preferences */}
        <SectionCard title="PREFERENCES">
          <ToggleRow
            title="Push Notifications"
            subtitle="Credit alerts and action reminders"
            value={notificationsEnabled}
            onChange={setNotificationsEnabled}
          />
          <ToggleRow
            title="SMS Reminders"
            subtitle="Text message notifications"
            value={smsEnabled}
            onChange={setSmsEnabled}
            last
          />
        </SectionCard>

        {/* Account */}
        <SectionCard title="ACCOUNT">
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
            subtitle="Password, 2FA, data settings"
            onPress={() => Alert.alert('Coming Soon', 'Privacy settings will be available in the next update.')}
          />
          <MenuItem
            icon="💳"
            title="Subscription"
            subtitle={planLabel}
            onPress={() => Alert.alert('Coming Soon', 'Subscription management coming soon.')}
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
  // Subscription banner
  subBanner: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
  },
  subBannerActive: {
    backgroundColor: COLORS.purple + '15',
    borderColor: COLORS.purple + '40',
  },
  subBannerFree: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  subPlanLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 4,
  },
  subPlanName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
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
  upgradeBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  upgradeBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
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
});

export default ProfileScreen;
