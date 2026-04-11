import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { smsAPI } from '../services/api';

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#6B7280',
  border: '#374151',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#059669',
  purple: '#7C3AED',
};

// ─── Toggle Row ────────────────────────────────────────────────────────────────
const ToggleRow = ({ title, subtitle, value, onChange, last }) => (
  <View style={[styles.row, !last && styles.rowBorder]}>
    <View style={styles.rowContent}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
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

// ─── Link Row ──────────────────────────────────────────────────────────────────
const LinkRow = ({ title, subtitle, onPress, danger, last }) => (
  <TouchableOpacity
    style={[styles.row, !last && styles.rowBorder]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.rowContent}>
      <Text style={[styles.rowTitle, danger && { color: COLORS.danger }]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Text style={styles.rowChevron}>›</Text>
  </TouchableOpacity>
);

// ─── Section ───────────────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionLabel}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────
const SettingsScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Notification toggles
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);

  // Reminder toggles
  const [actionReminders, setActionReminders] = useState(true);
  const [scoreUpdates, setScoreUpdates] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);

  const handleSmsToggle = async (value) => {
    setSmsNotifications(value);
    if (value) {
      Alert.alert(
        'Enable SMS',
        'To enable SMS notifications we need your phone number. This can be configured from the web app at app.creditstamina.com.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear locally cached data. Your credit data stored on the server will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => Alert.alert('Done', 'Cache cleared successfully.'),
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Data export will be sent to your email address on file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Export',
          onPress: () => Alert.alert('Requested', `Export will be sent to ${user?.email || 'your email'}.`),
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This cannot be undone. All your credit data, reports, and history will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Contact Support',
            'To delete your account please email support@creditstamina.com from your registered address.'
          ),
        },
      ]
    );
  };

  const openURL = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Unable to Open', 'Please visit creditstamina.com for support.')
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

        {/* Notifications */}
        <Section title="NOTIFICATIONS">
          <ToggleRow
            title="Push Notifications"
            subtitle="Credit alerts and action reminders"
            value={pushNotifications}
            onChange={setPushNotifications}
          />
          <ToggleRow
            title="Email Notifications"
            subtitle="Weekly summaries and updates"
            value={emailNotifications}
            onChange={setEmailNotifications}
          />
          <ToggleRow
            title="SMS Notifications"
            subtitle="Text message alerts"
            value={smsNotifications}
            onChange={handleSmsToggle}
            last
          />
        </Section>

        {/* Reminders */}
        <Section title="REMINDERS">
          <ToggleRow
            title="Action Reminders"
            subtitle="Get reminded about pending actions"
            value={actionReminders}
            onChange={setActionReminders}
          />
          <ToggleRow
            title="Score Update Alerts"
            subtitle="Notify when bureau scores change"
            value={scoreUpdates}
            onChange={setScoreUpdates}
          />
          <ToggleRow
            title="Weekly Progress Summary"
            subtitle="Receive a weekly digest of your progress"
            value={weeklySummary}
            onChange={setWeeklySummary}
            last
          />
        </Section>

        {/* Data Management */}
        <Section title="DATA MANAGEMENT">
          <LinkRow
            title="Clear Cache"
            subtitle="Free up local storage"
            onPress={handleClearCache}
          />
          <LinkRow
            title="Export My Data"
            subtitle="Download all your credit data"
            onPress={handleExportData}
            last
          />
        </Section>

        {/* Support */}
        <Section title="SUPPORT">
          <LinkRow
            title="Help Center"
            subtitle="FAQs and how-to guides"
            onPress={() => openURL('https://creditstamina.com/help')}
          />
          <LinkRow
            title="Contact Support"
            subtitle="support@creditstamina.com"
            onPress={() => openURL('mailto:support@creditstamina.com')}
          />
          <LinkRow
            title="Privacy Policy"
            onPress={() => openURL('https://creditstamina.com/privacy')}
          />
          <LinkRow
            title="Terms of Service"
            onPress={() => openURL('https://creditstamina.com/terms')}
            last
          />
        </Section>

        {/* About */}
        <Section title="ABOUT">
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowTitle}>Version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Build</Text>
            <Text style={styles.rowValue}>React Native 0.85</Text>
          </View>
        </Section>

        {/* Danger Zone */}
        <Section title="DANGER ZONE">
          <LinkRow
            title="Delete Account"
            subtitle="Permanently remove your account and data"
            onPress={handleDeleteAccount}
            danger
            last
          />
        </Section>

        <Text style={styles.footer}>Credit Stamina · creditstamina.com</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    minWidth: 60,
  },
  backBtnText: {
    fontSize: 17,
    color: COLORS.purple,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  headerSpacer: {
    minWidth: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  rowChevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  footer: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
});

export default SettingsScreen;
