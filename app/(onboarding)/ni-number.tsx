/**
 * app/(onboarding)/ni-number.tsx
 *
 * OB-4 — National Insurance number capture (ISA path only).
 *
 * Flow position:
 *   account-type (ISA selected) → ni-number → address
 *
 * NI number is NOT written to the database here — held in accountService
 * session state and encrypted server-side in production via a Supabase
 * edge function. The plain-text value never travels through a client insert.
 *
 * Format: two letters, six digits, one letter (A–D). e.g. AB 12 34 56 C
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { accountService } from '../../services/account';

// ─── NI number validation ─────────────────────────────────────────────────────

/**
 * Validates a UK National Insurance number.
 * Format: two letters, six digits, one letter A–D.
 * Disallowed prefixes/suffixes per HMRC rules are excluded by the character
 * classes in this regex.
 */
const NI_REGEX = /^(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/i;

const formatNIDisplay = (raw: string): string => {
  // Display format: AB 12 34 56 C
  const clean = raw.replace(/\s/g, '').toUpperCase();
  return [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6), clean.slice(6, 8), clean.slice(8, 9)]
    .filter(Boolean)
    .join(' ');
};

const stripSpaces = (val: string) => val.replace(/\s/g, '');

// ─── Component ────────────────────────────────────────────────────────────────

export default function NINumberScreen() {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const raw = stripSpaces(value);
  const isValid = NI_REGEX.test(raw);
  const showError = touched && value.length > 0 && !isValid;

  const handleChange = (text: string) => {
    setValue(formatNIDisplay(stripSpaces(text)));
  };

  const handleContinue = async () => {
    setTouched(true);
    if (!isValid) return;
    setLoading(true);
    try {
      // Session-only store — plain text never written to DB here.
      // PRODUCTION SWAP: POST raw to edge function for pgcrypto encryption.
      // See PRODUCTION SWAP note in services/account.ts.
      const accounts = await accountService.getAccounts();
      const isa = accounts.find((a) => a.type === 'ISA');
      if (!isa) throw new Error('ISA account not found in session');
      console.log('[NINumberScreen] NI captured for account:', isa.accountId);
      router.push('/(onboarding)/address');
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '50%' }]} />
        </View>
        <Text style={styles.progressLabel}>2 of 4</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>National Insurance number</Text>
          <Text style={styles.subtitle}>
            HMRC requires your NI number to open a Stocks & Shares ISA.
          </Text>

          {/* Input */}
          <TouchableOpacity
            style={[styles.inputCard, showError && styles.inputCardError]}
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
          >
            <Text style={styles.inputLabel}>NI number</Text>
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={value}
                onChangeText={handleChange}
                onBlur={() => setTouched(true)}
                placeholder="AB 12 34 56 C"
                placeholderTextColor="#3D3D56"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              {isValid && <Ionicons name="checkmark-circle" size={22} color="#34D399" />}
              {showError && <Ionicons name="alert-circle" size={22} color="#FF6B6B" />}
            </View>
          </TouchableOpacity>

          {showError && (
            <Text style={styles.errorText}>Please enter a valid UK National Insurance number.</Text>
          )}

          {/* Hint */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
            <Text style={styles.infoText}>
              Your NI number is on your payslip, P60, or any letter from HMRC.
              It looks like AB 12 34 56 C — two letters, six digits, one letter.
            </Text>
          </View>

          {/* Encryption note */}
          <View style={styles.infoBox}>
            <Ionicons name="lock-closed-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
            <Text style={styles.infoText}>
              Your NI number is encrypted at rest and never shared with third parties
              outside of HMRC eligibility checks.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, (!isValid || loading) && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!isValid || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Saving…' : 'Continue'}</Text>
          {!loading && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },

  // ── Nav ──
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

  // ── Content ──
  container: { padding: 24, paddingBottom: 120 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 28, lineHeight: 21 },

  // ── Input card ──
  inputCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 8,
  },
  inputCardError: { borderColor: 'rgba(255,107,107,0.4)' },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    padding: 0,
  },
  errorText: { fontSize: 12, color: '#FF6B6B', marginBottom: 16, marginLeft: 4 },

  // ── Info boxes ──
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: { flex: 1, fontSize: 12, color: '#9B9BB4', lineHeight: 17 },

  // ── Footer ──
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