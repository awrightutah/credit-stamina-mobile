import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const COLORS = {
  staminaBlue: '#1E40AF',
  powerPurple: '#7C3AED',
  growthGreen: '#059669',
  alertAmber: '#F59E0B',
  background: '#0f172a',
  card: '#111827',
  surface: '#1e293b',
  text: '#FFFFFF',
  textSecondary: '#94A3B8',
  border: '#374151',
};

const SLIDES = [
  {
    key: 'welcome',
    emoji: '💳',
    title: 'Welcome to\nCredit Stamina',
    subtitle: 'Your AI-powered credit repair companion. Take control of your credit score and build the financial future you deserve.',
    color: COLORS.powerPurple,
  },
  {
    key: 'upload',
    emoji: '📄',
    title: 'Upload Your\nCredit Report',
    subtitle: 'Import your PDF credit report from Equifax, Experian, or TransUnion. Our AI reads every account and dispute item instantly.',
    color: COLORS.staminaBlue,
  },
  {
    key: 'ai',
    emoji: '🤖',
    title: 'AI Builds\nYour Plan',
    subtitle: 'Get a personalized 30/60/90 day action plan. The AI identifies what\'s hurting your score and the fastest path to fix it.',
    color: COLORS.powerPurple,
  },
  {
    key: 'letters',
    emoji: '✉️',
    title: 'Generate\nDispute Letters',
    subtitle: 'AI-drafted bureau dispute letters, goodwill letters, and pay-for-delete requests — ready to send in seconds.',
    color: COLORS.staminaBlue,
  },
  {
    key: 'track',
    emoji: '📈',
    title: 'Track Your\nProgress',
    subtitle: 'Log score updates, watch your credit health improve, and stay on top of every action with your personal dashboard.',
    color: COLORS.growthGreen,
  },
];

const ONBOARDING_KEY = '@credit_stamina_onboarded';

export const markOnboardingComplete = async () => {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
};

export const hasSeenOnboarding = async () => {
  const val = await AsyncStorage.getItem(ONBOARDING_KEY);
  return val === 'true';
};

// ─── Dot Indicator ────────────────────────────────────────────────────────────
const Dots = ({ count, active }) => (
  <View style={styles.dots}>
    {Array.from({ length: count }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.dot,
          i === active && styles.dotActive,
          { backgroundColor: i === active ? SLIDES[active].color : COLORS.border },
        ]}
      />
    ))}
  </View>
);

// ─── Single Slide ─────────────────────────────────────────────────────────────
const Slide = ({ slide }) => (
  <View style={[styles.slide]}>
    <View style={[styles.emojiCircle, { backgroundColor: slide.color + '20', borderColor: slide.color + '40' }]}>
      <Text style={styles.emoji}>{slide.emoji}</Text>
    </View>
    <Text style={styles.slideTitle}>{slide.title}</Text>
    <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
const OnboardingScreen = ({ navigation }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

  const isLast = activeIndex === SLIDES.length - 1;

  const handleScroll = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const goNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
    }
  };

  const handleFinish = async () => {
    await markOnboardingComplete();
    navigation.replace('AuthStack');
  };

  const activeColor = SLIDES[activeIndex].color;

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((slide) => (
          <Slide key={slide.key} slide={slide} />
        ))}
      </ScrollView>

      {/* Dots */}
      <Dots count={SLIDES.length} active={activeIndex} />

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: activeColor }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

        {isLast && (
          <TouchableOpacity style={styles.signinLink} onPress={handleFinish}>
            <Text style={styles.signinLinkText}>
              Already have an account? <Text style={[styles.signinLinkBold, { color: activeColor }]}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 20,
  },
  emojiCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  emoji: {
    fontSize: 56,
  },
  slideTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 20,
  },
  slideSubtitle: {
    fontSize: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 14,
  },
  nextBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  signinLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signinLinkText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  signinLinkBold: {
    fontWeight: '600',
  },
});

export default OnboardingScreen;
