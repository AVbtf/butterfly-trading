import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const STEPS = [
  {
    icon: 'card-outline' as const,
    title: 'Photo ID',
    description: 'Passport, driving licence, or national ID card',
  },
  {
    icon: 'camera-outline' as const,
    title: 'Selfie check',
    description: 'A quick liveness check to confirm it\'s really you',
  },
  {
    icon: 'checkmark-circle-outline' as const,
    title: 'Instant review',
    description: 'We\'ll verify your identity and let you know straight away',
  },
];

export default function KycIntroScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={36} color="#7C6FFF" />
          </View>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.subtitle}>
            UK regulations require us to confirm who you are before you can invest.
            This takes around 2 minutes.
          </Text>
        </View>

        <View style={styles.stepsCard}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepLeft}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={step.icon} size={20} color="#7C6FFF" />
                </View>
                {index < STEPS.length - 1 && <View style={styles.stepConnector} />}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Your data is encrypted and processed in accordance with our privacy policy.
            We use it solely for regulatory verification.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/kyc-document')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Start verification</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>Do this later</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 36,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: '#9B9BB4',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  stepsCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  step: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  stepLeft: {
    alignItems: 'center',
    marginRight: 16,
    width: 36,
  },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepConnector: {
    width: 1,
    flex: 1,
    backgroundColor: 'rgba(124, 111, 255, 0.2)',
    marginVertical: 6,
    minHeight: 20,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 13,
    color: '#9B9BB4',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#9B9BB4',
    lineHeight: 17,
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
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    color: '#9B9BB4',
  },
});