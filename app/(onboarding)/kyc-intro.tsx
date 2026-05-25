import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const STEPS = [
  { icon: 'card-outline' as const, label: 'Scan your ID document' },
  { icon: 'camera-outline' as const, label: 'Take a quick selfie' },
  { icon: 'checkmark-circle-outline' as const, label: 'Instant automated review' },
];

export default function KycIntroScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={52} color="#7C6FFF" />
        </View>

        <Text style={styles.title}>Verify your identity</Text>
        <Text style={styles.subtitle}>
          UK regulations require us to confirm who you are before you can trade. It takes
          under two minutes.
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={20} color="#7C6FFF" />
              </View>
              <Text style={styles.stepLabel}>{step.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Your data is encrypted and only used for identity verification in accordance with
          our{' '}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/kyc-document')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Get started</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: '#9B9BB4',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  steps: { width: '100%', gap: 12, marginBottom: 36 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 15, color: '#FFFFFF', fontWeight: '500' },
  note: { fontSize: 12, color: '#5C5C7A', textAlign: 'center', lineHeight: 18 },
  link: { color: '#7C6FFF' },
  footer: {
    padding: 24,
    paddingBottom: 36,
    backgroundColor: '#0A0A0F',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  primaryButton: {
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
