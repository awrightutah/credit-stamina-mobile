import React from 'react';
import { Text, StyleSheet } from 'react-native';

export const AI_DISCLAIMER_TEXT =
  'AI-generated content may not always be accurate. Always verify important financial and legal information independently. Credit Stamina AI is not a substitute for professional legal or financial advice.';

/**
 * Small inline disclaimer shown at the bottom of every AI-generated response.
 * Keep it low-contrast / italic so it doesn't dominate, but is always present.
 */
const AIDisclaimer = ({ style }) => (
  <Text style={[styles.text, style]}>
    ⚠ {AI_DISCLAIMER_TEXT}
  </Text>
);

const styles = StyleSheet.create({
  text: {
    fontSize: 10,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 14,
  },
});

export default AIDisclaimer;
