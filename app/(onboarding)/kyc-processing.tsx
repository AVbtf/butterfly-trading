import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { kycService } from '../../services/kyc';

export default function KycProcessingScreen() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();

    kycService.pollStatus().then((status) => {
      animation.stop();
      router.replace({ pathname: '/(onboarding)/kyc-result', params: { status } });
    });

    return () => animation.stop();
  }, [pulse]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
          <Ionicons name="shield-checkmark-outline" size={52} color="#7C6FFF" />
        </Animated.View>

        <Text style={styles.title}>Checking your documents</Text>
        <Text style={styles.subtitle}>
          Our automated system is reviewing your submission. This usually takes a few
          seconds.
        </Text>

        <View style={styles.checklist}>
          {[
            'Verifying document authenticity',
            'Matching selfie to document',
            'Running compliance checks',
          ].map((item, i) => (
            <View key={i} style={styles.checkRow}>
              <View style={styles.spinner}>
                <Ionicons name="ellipse" size={8} color="#7C6FFF" />
              </View>
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
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
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: '#9B9BB4',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  checklist: { gap: 14, width: '100%' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spinner: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontSize: 14, color: '#9B9BB4' },
});
