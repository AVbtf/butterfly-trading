/**
 * app/(intro)/index.tsx  (or app/intro.tsx if using a single file)
 *
 * First-launch intro screens for Butterfly Trading.
 *
 * Flow:
 *   First visit  → intro → /(auth)/register
 *   Return visit → skipped entirely (AsyncStorage flag)
 *
 * Two screens:
 *   1. What Butterfly Trading is
 *   2. Impact wallet & directed giving
 *
 * On "Get started" → sets 'hasSeenIntro' in AsyncStorage → routes to register.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const INTRO_SEEN_KEY = 'hasSeenIntro';

// ─── Slide definitions ────────────────────────────────────────────────────────

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  iconColour: string;
  iconBg: string;
  label: string;
  title: string;
  body: string[];
  closing: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'leaf-outline',
    iconColour: '#7C6FFF',
    iconBg: 'rgba(124, 111, 255, 0.12)',
    label: 'RESPONSIBLE INVESTING',
    title: 'Trade, invest, and drive change in the world',
    body: [
      'Most investment platforms stop at the return. Butterfly starts there.',
      'We believe capital should be a force for good — so every equity and ETF on the platform is held to a standard. No fossil fuels, no weapons, no exploitation. Only investments that pass our ESG screening make it through.',
    ],
    closing: 'Your portfolio. Your values. Uncompromised.',
  },
  {
    icon: 'heart-outline',
    iconColour: '#34D399',
    iconBg: 'rgba(52, 211, 153, 0.12)',
    label: 'YOUR IMPACT WALLET',
    title: 'You decide where the change happens',
    body: [
      'Every trade you make generates funds in your personal impact wallet — yours to direct, entirely on your terms.',
      'Butterfly partners with NGOs working across the UN Sustainable Development Goals. At any time, a curated selection of their campaigns is open for funding. You choose which causes receive your impact, and how much.',
    ],
    closing: 'No algorithms. No automatic donations. Just you, deciding where your money does good in the world.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntroScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = activeIndex === SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (isLast) {
      handleGetStarted();
    } else {
      scrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
    }
  };

  const handleGetStarted = async () => {
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    } catch {
      // Non-fatal — worst case they see intro again next launch
      console.warn('[Intro] Failed to persist hasSeenIntro');
    }
    router.replace('/(auth)/register');
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    } catch {
      console.warn('[Intro] Failed to persist hasSeenIntro');
    }
    router.replace('/(auth)/register');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Skip — top right, visible on first slide only */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        {!isLast && (
          <TouchableOpacity onPress={handleSkip} hitSlop={12} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        onScroll={handleScroll}
        scrollEventThrottle={1}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={styles.slide}>
            <ScrollView
              contentContainerStyle={styles.slideContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Icon */}
              <View style={[styles.iconWrap, { backgroundColor: slide.iconBg }]}>
                <Ionicons name={slide.icon} size={36} color={slide.iconColour} />
              </View>

              {/* Label */}
              <Text style={styles.label}>{slide.label}</Text>

              {/* Title */}
              <Text style={styles.title}>{slide.title}</Text>

              {/* Body paragraphs */}
              <View style={styles.bodyWrap}>
                {slide.body.map((para, i) => (
                  <Text key={i} style={styles.body}>{para}</Text>
                ))}
              </View>

              {/* Closing line */}
              <View style={styles.closingWrap}>
                <View style={[styles.closingBar, { backgroundColor: slide.iconColour }]} />
                <Text style={[styles.closing, { color: slide.iconColour }]}>
                  {slide.closing}
                </Text>
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      {/* Footer — dots + CTA */}
      <View style={styles.footer}>
        {/* Pagination dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {isLast ? 'Get started' : 'Next'}
          </Text>
          <Ionicons
            name={isLast ? 'arrow-forward' : 'chevron-forward'}
            size={18}
            color="#fff"
          />
        </TouchableOpacity>

        {/* Already have an account */}
        {isLast && (
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={styles.loginLinkAccent}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  skipText: { fontSize: 14, color: '#9B9BB4', fontWeight: '500' },

  // ── Slide ──
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  slideContent: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9B9BB4',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  bodyWrap: { gap: 16, marginBottom: 32 },
  body: {
    fontSize: 16,
    color: '#9B9BB4',
    lineHeight: 25,
  },
  closingWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  closingBar: {
    width: 3,
    borderRadius: 2,
    marginTop: 3,
    alignSelf: 'stretch',
    minHeight: 18,
  },
  closing: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0A0F',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#7C6FFF',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  primaryButton: {
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginLinkText: { fontSize: 14, color: '#9B9BB4' },
  loginLinkAccent: { color: '#7C6FFF', fontWeight: '600' },
});