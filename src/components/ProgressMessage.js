import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import COLORS from '../theme/colors';

const DEFAULT_INTERVAL = 3000;
const FADE_MS = 350;

const ProgressMessage = ({
  messages = [],
  interval = DEFAULT_INTERVAL,
  loop = true,
  color = COLORS.purple,
  style,
  textStyle,
}) => {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  // Cycle through messages
  useEffect(() => {
    if (!messages.length) return;
    // Fade in the first message
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    }).start();

    const timer = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }).start(() => {
        setIndex((prev) => {
          const next = prev + 1;
          if (next >= messages.length) return loop ? 0 : prev;
          return next;
        });
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }).start();
      });
    }, interval);

    return () => clearInterval(timer);
  }, [messages, interval, loop, opacity]);

  // Subtle pulsing so it feels alive
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 1200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  if (!messages.length) return null;

  return (
    <View style={[styles.container, style]}>
      <Animated.Text
        style={[
          styles.message,
          { color, opacity, transform: [{ scale: pulse }] },
          textStyle,
        ]}
      >
        {messages[index]}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default ProgressMessage;
