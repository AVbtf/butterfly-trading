import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KycStatus } from '../../services/kyc';

export default function KycResultScreen() {
  const { status } = useLocalSearchParams<{ status: KycStatus }>();
  const approved = status === 'approved';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={[styles.iconWrap, approved ? styles.iconWrapSuccess : styles.iconWrapFail]}>
          <Ionicons
            name={approved ? 'checkmark-circle' : 'close-circle'}
            size={56}
            color={approved ? '#34D399' : '#F87171'}
          />
        </View>

        <Text style={styles.title}>
          {approved ? 'Verification complete' : 'Verification failed'}
        </Text>
        <Text style={styles.subtitle}>
          {approved
            ? 'Your identity has been verified. Now let\'s set up your account.'
            : 'We were unable to verify your identity. Please try again or contact support.'}
        </Text>

        {approved ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(onboarding)/account-type')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Set up your account</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/(onboarding)/kyc-intro')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace('/(app)/home')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>Do this later</Text>
            </TouchableOpacity>
          </View>
        )}
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
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconWrapSuccess: { backgroundColor: 'rgba(52, 211, 153, 0.12)' },
  iconWrapFail: { backgroundColor: 'rgba(248, 113, 113, 0.12)' },
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
    marginBottom: 40,
  },
  actions: { width: '100%', gap: 12 },
  primaryButton: {
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  secondaryButton: {
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '500', color: '#9B9BB4' },
});