import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#64748B',
  border: '#374151',
  danger: '#DC2626',
  success: '#059669',
  purple: '#7C3AED',
  blue: '#1E40AF',
};

const Row = ({ icon, title, subtitle, onPress, danger, last }) => (
  <TouchableOpacity
    style={[styles.row, !last && styles.rowBorder]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.rowIcon, danger && { backgroundColor: COLORS.danger + '20' }]}>
      <Text style={styles.rowIconText}>{icon}</Text>
    </View>
    <View style={styles.rowContent}>
      <Text style={[styles.rowTitle, danger && { color: COLORS.danger }]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Text style={styles.rowChevron}>›</Text>
  </TouchableOpacity>
);

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionLabel}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const PrivacySecurityScreen = () => {
  const navigation = useNavigation();
  const { user, forgotPassword, logout } = useAuth();

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      `We'll send a password reset link to ${user?.email}. Check your inbox to set a new password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Reset Link',
          onPress: async () => {
            try {
              await forgotPassword(user?.email);
              Alert.alert('Email Sent', `Password reset link sent to ${user?.email}.`);
            } catch {
              Alert.alert('Error', 'Could not send reset email. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data including credit reports, letters, scores, and history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              `Type "DELETE" to confirm permanent deletion of your account for ${user?.email}.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await authAPI.deleteAccount();
                      await logout?.();
                    } catch (err) {
                      Alert.alert(
                        'Deletion Failed',
                        'We could not delete your account automatically. Please email support@creditstamina.com and we\'ll process your request within 48 hours.',
                        [
                          { text: 'OK' },
                          {
                            text: 'Email Support',
                            onPress: () => Linking.openURL('mailto:support@creditstamina.com?subject=Account%20Deletion%20Request').catch(() => {}),
                          },
                        ]
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy & Security</Text>
        <View style={{ minWidth: 50 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Account security info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔐 Your account is secured with Supabase Auth</Text>
          <Text style={styles.infoText}>
            Passwords are hashed and never stored in plain text. Sessions are encrypted and expire automatically. Face ID / Touch ID credentials never leave your device.
          </Text>
        </View>

        <Section title="ACCOUNT SECURITY">
          <Row
            icon="🔑"
            title="Change Password"
            subtitle="Send a reset link to your email"
            onPress={handleChangePassword}
          />
          <Row
            icon="🪪"
            title="Face ID / Touch ID"
            subtitle="Manage biometric login"
            onPress={() => navigation.navigate('Settings')}
            last
          />
        </Section>

        <Section title="YOUR DATA">
          <Row
            icon="📄"
            title="Privacy Policy"
            subtitle="How we handle your financial data"
            onPress={() => Linking.openURL('https://creditstamina.com/privacy').catch(() => {})}
          />
          <Row
            icon="📋"
            title="Terms of Service"
            subtitle="Your rights and our commitments"
            onPress={() => Linking.openURL('https://creditstamina.com/terms').catch(() => {})}
          />
          <Row
            icon="✉️"
            title="Data Requests"
            subtitle="Request a copy of your data"
            onPress={() => Linking.openURL('mailto:support@creditstamina.com?subject=Data%20Request').catch(() => {})}
            last
          />
        </Section>

        <Section title="DANGER ZONE">
          <Row
            icon="🗑️"
            title="Delete Account"
            subtitle="Permanently remove all data"
            onPress={handleDeleteAccount}
            danger
            last
          />
        </Section>

        <Text style={styles.footerNote}>
          Credit Stamina does not sell your personal or financial data to third parties. Your credit report data is used only to generate your personalized action plan and dispute letters.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  backBtn: { fontSize: 17, color: COLORS.purple, fontWeight: '500', minWidth: 50 },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  infoCard: {
    backgroundColor: COLORS.blue + '15',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.blue + '40',
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  section: { marginBottom: 20 },
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
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowIconText: { fontSize: 16 },
  rowContent: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: COLORS.text },
  rowSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rowChevron: { fontSize: 22, color: COLORS.textSecondary, lineHeight: 24 },
  footerNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 8,
  },
});

export default PrivacySecurityScreen;
