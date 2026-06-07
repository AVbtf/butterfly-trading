import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { kycService, KycStatus } from '../../services/kyc';

const STEPS = [
  'Uploading your documents securely',
  'Verifying document authenticity',
  'Running liveness check',
  'Checking against identity records',
  'Finalising your application',
];

export default function KycProcessingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const spinValue = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [spinValue]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 1400);
    return () => clearInterval(interval);
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    kycService.pollStatus().then((status: KycStatus) => {
      if (cancelled) return;
      setTimeout(() => {
        router.replace({
          pathname: '/(onboarding)/kyc-result',
          params: { status },
        });
      }, 600);
    });
    return () => { cancelled = true; };
  }, []);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.spinnerWrap}>
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />
          <View style={styles.spinnerInner}>
            <Ionicons name="shield-checkmark" size={32} color="#7C6FFF" />
          </View>
        </View>

        <Text style={styles.title}>Verifying your identity</Text>
        <Text style={styles.subtitle}>
          This usually takes under a minute. Please don't close the app.
        </Text>

        <Animated.View style={[styles.stepBadge, { opacity: fadeAnim }]}>
          <View style={styles.stepDot} />
          <Text style={styles.stepText}>{STEPS[currentStep]}</Text>
        </Animated.View>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i <= currentStep && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={14} color="#9B9BB4" />
          <Text style={styles.noticeText}>
            In some cases we may need additional information. You'll receive an email if we need anything else.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  spinnerWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  spinnerRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: '#7C6FFF',
    borderRightColor: 'rgba(124, 111, 255, 0.3)',
  },
  spinnerInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#9B9BB4',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 280,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141420',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7C6FFF',
  },
  stepText: { fontSize: 13, color: '#C4C4D4' },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 40,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotActive: { backgroundColor: '#7C6FFF' },
  noticeBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#9B9BB4',
    lineHeight: 17,
  },
});