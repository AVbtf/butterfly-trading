import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { kycService, DocumentType } from '../../services/kyc';

const DOCUMENT_TYPES: { type: DocumentType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'passport',        label: 'Passport',        icon: 'book-outline' },
  { type: 'driving_licence', label: 'Driving licence', icon: 'car-outline' },
  { type: 'national_id',     label: 'National ID card', icon: 'id-card-outline' },
];

export default function KycDocumentScreen() {
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [frontCaptured, setFrontCaptured] = useState(false);
  const [backCaptured, setBackCaptured] = useState(false);
  const [loading, setLoading] = useState(false);

  const needsBack = selectedType === 'driving_licence' || selectedType === 'national_id';

  const handleMockCapture = (side: 'front' | 'back') => {
    Alert.alert(
      'Mock capture',
      `Simulating ${side} of ${selectedType} — in production this opens the Onfido document camera.`,
      [
        {
          text: 'Simulate capture',
          onPress: () => {
            if (side === 'front') setFrontCaptured(true);
            else setBackCaptured(true);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleContinue = async () => {
    if (!selectedType) return;
    setLoading(true);
    try {
      await kycService.submitDocument({
        documentType: selectedType,
        frontCaptured,
        backCaptured: needsBack ? backCaptured : true,
      });
      router.push('/(onboarding)/kyc-selfie');
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isReadyToContinue =
    selectedType !== null &&
    frontCaptured &&
    (!needsBack || backCaptured);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '33%' }]} />
        </View>
        <Text style={styles.progressLabel}>1 of 3</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Choose your document</Text>
        <Text style={styles.subtitle}>Select the ID document you'd like to use</Text>

        <View style={styles.optionsGroup}>
          {DOCUMENT_TYPES.map((doc) => (
            <TouchableOpacity
              key={doc.type}
              style={[styles.optionRow, selectedType === doc.type && styles.optionRowSelected]}
              onPress={() => {
                setSelectedType(doc.type);
                setFrontCaptured(false);
                setBackCaptured(false);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name={doc.icon} size={20} color={selectedType === doc.type ? '#7C6FFF' : '#9B9BB4'} />
              </View>
              <Text style={[styles.optionLabel, selectedType === doc.type && styles.optionLabelSelected]}>
                {doc.label}
              </Text>
              <View style={[styles.radio, selectedType === doc.type && styles.radioSelected]}>
                {selectedType === doc.type && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {selectedType && (
          <View style={styles.captureSection}>
            <Text style={styles.sectionLabel}>Capture your document</Text>

            <TouchableOpacity
              style={[styles.captureCard, frontCaptured && styles.captureCardDone]}
              onPress={() => handleMockCapture('front')}
              activeOpacity={0.8}
            >
              {frontCaptured ? (
                <Ionicons name="checkmark-circle" size={28} color="#34D399" />
              ) : (
                <Ionicons name="camera-outline" size={28} color="#7C6FFF" />
              )}
              <View style={styles.captureText}>
                <Text style={styles.captureTitle}>
                  {frontCaptured ? 'Front captured ✓' : 'Front of document'}
                </Text>
                <Text style={styles.captureSubtitle}>
                  {frontCaptured ? 'Tap to retake' : 'Ensure all four corners are visible'}
                </Text>
              </View>
            </TouchableOpacity>

            {needsBack && (
              <TouchableOpacity
                style={[styles.captureCard, backCaptured && styles.captureCardDone]}
                onPress={() => handleMockCapture('back')}
                activeOpacity={0.8}
              >
                {backCaptured ? (
                  <Ionicons name="checkmark-circle" size={28} color="#34D399" />
                ) : (
                  <Ionicons name="camera-reverse-outline" size={28} color="#7C6FFF" />
                )}
                <View style={styles.captureText}>
                  <Text style={styles.captureTitle}>
                    {backCaptured ? 'Back captured ✓' : 'Back of document'}
                  </Text>
                  <Text style={styles.captureSubtitle}>
                    {backCaptured ? 'Tap to retake' : 'Flip the document over'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.tipBox}>
          <Ionicons name="bulb-outline" size={14} color="#F59E0B" style={{ marginTop: 1 }} />
          <Text style={styles.tipText}>
            Make sure the document is well-lit, flat, and not blurry. Reflections or glare will cause the check to fail.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, !isReadyToContinue && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!isReadyToContinue || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Uploading…' : 'Continue to selfie'}
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
  container: { padding: 24, paddingBottom: 120 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 28, lineHeight: 21 },
  optionsGroup: { gap: 10, marginBottom: 28 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  optionRowSelected: {
    borderColor: '#7C6FFF',
    backgroundColor: 'rgba(124, 111, 255, 0.08)',
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { flex: 1, fontSize: 15, color: '#9B9BB4', fontWeight: '500' },
  optionLabelSelected: { color: '#FFFFFF' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#7C6FFF' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C6FFF' },
  captureSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    color: '#9B9BB4',
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  captureCardDone: { borderColor: '#34D399', backgroundColor: 'rgba(52, 211, 153, 0.06)' },
  captureText: { flex: 1 },
  captureTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  captureSubtitle: { fontSize: 13, color: '#9B9BB4' },
  tipBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  tipText: { flex: 1, fontSize: 12, color: '#D4A017', lineHeight: 17 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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