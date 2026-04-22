import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAIDisclaimer } from '../hooks/useAIDisclaimer';

/**
 * One-time dismissible banner shown the first time a user reaches any AI feature.
 * After the user taps "Got it", it records the acknowledgment in Supabase and
 * never shows again (checked via useAIDisclaimer hook).
 */
const AIDisclaimerBanner = () => {
  const { hasAcknowledged, acknowledge, loading } = useAIDisclaimer();

  // Don't render while loading (avoids flash) or once acknowledged
  if (loading || hasAcknowledged) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Text style={styles.icon}>ℹ️</Text>
        <View style={styles.body}>
          <Text style={styles.title}>About AI-Generated Content</Text>
          <Text style={styles.text}>
            AI-generated content may not always be accurate. Always verify important financial and
            legal information independently. Credit Stamina AI is not a substitute for professional
            legal or financial advice.
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.btn} onPress={acknowledge} activeOpacity={0.75}>
        <Text style={styles.btnText}>Got it</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1C2940',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.35)',
    borderLeftWidth: 3,
    borderLeftColor: '#64748B',
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  icon: {
    fontSize: 16,
    marginTop: 1,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    lineHeight: 17,
  },
  btn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});

export default AIDisclaimerBanner;
