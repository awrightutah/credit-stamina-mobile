import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

const SettingsScreen = () => {
  const navigation = useNavigation();
  
  // Notification Settings
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  
  // Reminder Settings
  const [actionReminders, setActionReminders] = useState(true);
  const [scoreUpdates, setScoreUpdates] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  
  // Display Settings
  const [darkMode, setDarkMode] = useState(true);
  const [compactView, setCompactView] = useState(false);

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. You may need to re-download some content.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // Implement cache clearing logic
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'This will export all your credit data to a file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => {
            // Implement data export logic
            Alert.alert('Success', 'Data exported successfully');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Implement account deletion logic
            Alert.alert('Account Deleted', 'Your account has been deleted');
          },
        },
      ]
    );
  };

  const settingsSections = [
    {
      title: 'Notifications',
      items: [
        {
          id: 'push',
          title: 'Push Notifications',
          subtitle: 'Receive alerts on your device',
          value: pushNotifications,
          onValueChange: setPushNotifications,
        },
        {
          id: 'email',
          title: 'Email Notifications',
          subtitle: 'Get updates via email',
          value: emailNotifications,
          onValueChange: setEmailNotifications,
        },
        {
          id: 'sms',
          title: 'SMS Notifications',
          subtitle: 'Receive text message alerts',
          value: smsNotifications,
          onValueChange: setSmsNotifications,
        },
      ],
    },
    {
      title: 'Reminders',
      items: [
        {
          id: 'actions',
          title: 'Action Reminders',
          subtitle: 'Get reminded about pending actions',
          value: actionReminders,
          onValueChange: setActionReminders,
        },
        {
          id: 'scores',
          title: 'Score Updates',
          subtitle: 'Notify when scores change',
          value: scoreUpdates,
          onValueChange: setScoreUpdates,
        },
        {
          id: 'weekly',
          title: 'Weekly Summary',
          subtitle: 'Receive weekly progress reports',
          value: weeklySummary,
          onValueChange: setWeeklySummary,
        },
      ],
    },
    {
      title: 'Display',
      items: [
        {
          id: 'darkmode',
          title: 'Dark Mode',
          subtitle: 'Use dark theme',
          value: darkMode,
          onValueChange: setDarkMode,
        },
        {
          id: 'compact',
          title: 'Compact View',
          subtitle: 'Show more content on screen',
          value: compactView,
          onValueChange: setCompactView,
        },
      ],
    },
  ];

  const renderSettingItem = (item) => (
    <View key={item.id} style={styles.settingItem}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{item.title}</Text>
        <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
      </View>
      <Switch
        value={item.value}
        onValueChange={item.onValueChange}
        trackColor={{ false: '#374151', true: '#8B5CF6' }}
        thumbColor={item.value ? '#FFFFFF' : '#9CA3AF'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.content}>
        {settingsSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map(renderSettingItem)}
            </View>
          </View>
        ))}

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.actionItem} onPress={handleClearCache}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Clear Cache</Text>
                <Text style={styles.actionSubtitle}>
                  Free up storage space
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={handleExportData}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Export Data</Text>
                <Text style={styles.actionSubtitle}>
                  Download all your data
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Help Center</Text>
                <Text style={styles.actionSubtitle}>
                  FAQs and guides
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Contact Support</Text>
                <Text style={styles.actionSubtitle}>
                  Get help from our team
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Privacy Policy</Text>
                <Text style={styles.actionSubtitle}>
                  Learn how we protect your data
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Terms of Service</Text>
                <Text style={styles.actionSubtitle}>
                  Terms and conditions
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.dangerButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>Credit Stamina v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F3D',
  },
  backButton: {
    fontSize: 16,
    color: '#8B5CF6',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D4A',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D4A',
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actionArrow: {
    fontSize: 24,
    color: '#6B7280',
  },
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 24,
  },
});

export default SettingsScreen;