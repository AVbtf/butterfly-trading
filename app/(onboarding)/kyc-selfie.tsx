import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { kycService } from '../../services/kyc';

type CaptureState = 'idle' | 'captured';

const TIPS = [
  'Look directly at the camera',
  'Ensure your face is well-lit',
  'Remove glasses or hats if possible',
  'Keep a neutral expression',
];

export default function KycSelfieScreen() {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [loading, setLoading] = useState(false);

  const handleMockSelfie = () => {
    Alert.alert(
      'Mock selfie',
      'In production this launches the Onfido liveness check. Simulating success.',
      [
        {
          text: 'Simulate liveness check',
          onPress: () => setCaptureState('captured'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await kycService.submitSelfie();
      router.push('/(onboarding)/kyc-processing');
    } catch (e) {
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
        <Text style={styles.title}>Selfie check</Text>
        <Text style={styles.subtitle}>
          We need a quick liveness check to confirm this is you, not a photo.
        </Text>

        <TouchableOpacity
          style={[styles.cameraFrame, captureState === 'captured' && styles.cameraFrameDone]}
          onPress={captureState === 'idle' ? handleMockSelfie : undefined}
          activeOpacity={captureState === 'idle' ? 0.85 : 1}
        >
          {captureState === 'captured' ? (
            <>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={44} color="#fff" />
              </View>
              <Text style={styles.cameraLabel}>Liveness check passed</Text>
              <TouchableOpacity onPress={handleMockSelfie} style={styles.retakeLink}>
                <Text style={styles.retakeLinkText}>Retake</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.faceOval} />
              <View style={styles.cameraButton}>
                <Ionicons name="camera" size={28} color="#7C6FFF" />
              </View>
              <Text style={styles.cameraLabel}>Tap to start liveness check</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.tipsCard}>
          {TIPS.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="checkmark-circle" size={15} color="#7C6FFF" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, captureState !== 'captured' && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={captureState !== 'captured' || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Submitting…' : 'Submit for review'}
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
  container: { flex: 1, padding: 24 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 28, lineHeight: 21 },
  cameraFrame: {
    height: 300,
    backgroundColor: '#141420',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    gap: 16,
  },
  cameraFrameDone: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.06)',
  },
  faceOval: {
    width: 140,
    height: 180,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(124, 111, 255, 0.5)',
    borderStyle: 'dashed',
    position: 'absolute',
    top: 40,
  },
  cameraButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124, 111, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 140,
  },
  cameraLabel: {
    fontSize: 14,
    color: '#9B9BB4',
    textAlign: 'center',
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  retakeLink: { marginTop: 4 },
  retakeLinkText: { fontSize: 13, color: '#7C6FFF' },
  tipsCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { fontSize: 14, color: '#9B9BB4' },
  footer: {
    padding: 24,
    paddingBottom: 36,
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