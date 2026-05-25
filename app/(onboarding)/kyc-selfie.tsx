import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { kycService } from '../../services/kyc';

export default function KycSelfieScreen() {
  const [captured, setCaptured] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleMockCapture = () => {
    Alert.alert(
      'Mock capture',
      'Simulating selfie — in production this opens the Onfido face capture SDK.',
      [
        { text: 'Simulate capture', onPress: () => setCaptured(true) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await kycService.submitSelfie();
      router.push('/(onboarding)/kyc-processing');
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '66%' }]} />
        </View>
        <Text style={styles.progressLabel}>2 of 3</Text>
      </View>

      <View style={styles.container}>
        <Text style={styles.title}>Take a selfie</Text>
        <Text style={styles.subtitle}>
          We need a clear photo of your face to match against your ID document.
        </Text>

        <TouchableOpacity
          style={[styles.captureArea, captured && styles.captureAreaDone]}
          onPress={handleMockCapture}
          activeOpacity={0.8}
        >
          {captured ? (
            <Ionicons name="checkmark-circle" size={48} color="#34D399" />
          ) : (
            <Ionicons name="person-circle-outline" size={72} color="#7C6FFF" />
          )}
          <Text style={[styles.captureLabel, captured && styles.captureLabelDone]}>
            {captured ? 'Selfie captured — tap to retake' : 'Tap to take selfie'}
          </Text>
        </TouchableOpacity>

        <View style={styles.tips}>
          {[
            'Face the camera directly',
            'Make sure your face is well-lit',
            'Remove sunglasses or hats',
          ].map((tip, i) => (
            <View key={i} style={styles.tip}>
              <Ionicons name="checkmark" size={14} color="#7C6FFF" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, !captured && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!captured || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Uploading…' : 'Continue'}
          </Text>
          {!loading && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#7C6FFF', borderRadius: 2 },
  progressLabel: { fontSize: 12, color: '#9B9BB4', width: 32, textAlign: 'right' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 32, lineHeight: 21 },
  captureArea: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(124, 111, 255, 0.3)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(124, 111, 255, 0.06)',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
  },
  captureAreaDone: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.06)',
  },
  captureLabel: { fontSize: 15, color: '#7C6FFF', fontWeight: '500' },
  captureLabelDone: { color: '#34D399' },
  tips: { gap: 10 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { fontSize: 14, color: '#9B9BB4' },
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
  primaryButtonDisabled: { backgroundColor: 'rgba(124, 111, 255, 0.35)' },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
