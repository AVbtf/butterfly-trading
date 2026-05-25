/**
 * app/(onboarding)/payment-details.tsx
 *
 * OB-4 — Payment details capture (UI only at MVP).
 *
 * Flow position:
 *   risk-notice → payment-details → /(app)/home
 *
 * Per the MVP Development Schedule, payment integration (OB-5) is excluded
 * from MVP scope. This screen captures the UI fields only — no payment
 * gateway is called. The data is not persisted.
 *
 * PRODUCTION SWAP: integrate TrueLayer (recommended for UK open banking)
 * or GoCardless. See comments below.
 */

import { useState } from 'react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentForm {
  accountHolder: string;
  sortCode: string;
  accountNumber: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatSortCode = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  return parts.filter(Boolean).join('-');
};

const stripNonDigits = (val: string) => val.replace(/\D/g, '');

// ─── Validation ───────────────────────────────────────────────────────────────

const isValidSortCode = (val: string) => stripNonDigits(val).length === 6;
const isValidAccountNumber = (val: string) => /^\d{8}$/.test(val.trim());
const isValidHolder = (val: string) => val.trim().length > 1;

const isFormComplete = (form: PaymentForm) =>
  isValidHolder(form.accountHolder) &&
  isValidSortCode(form.sortCode) &&
  isValidAccountNumber(form.accountNumber);

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentDetailsScreen() {
  const [form, setForm] = useState<PaymentForm>({
    accountHolder: '',
    sortCode: '',
    accountNumber: '',
  });
  const [touched, setTouched] = useState<Partial<Record<keyof PaymentForm, boolean>>>({});
  const [loading, setLoading] = useState(false);

  const setField = (key: keyof PaymentForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const markTouched = (key: keyof PaymentForm) =>
    setTouched((t) => ({ ...t, [key]: true }));

  const handleSortCodeChange = (text: string) => {
    setField('sortCode', formatSortCode(text));
  };

  const handleAccountNumberChange = (text: string) => {
    setField('accountNumber', stripNonDigits(text).slice(0, 8));
  };

  const handleContinue = async () => {
    // Mark all fields touched to surface any errors
    setTouched({ accountHolder: true, sortCode: true, accountNumber: true });
    if (!isFormComplete(form)) return;

    setLoading(true);
    try {
      // MVP: UI capture only — no payment gateway called.
      //
      // PRODUCTION SWAP (TrueLayer open banking — recommended for UK):
      //   1. Initiate a TrueLayer AuthLink from your backend:
      //      POST /api/payments/truelayer/init → { auth_url }
      //   2. Open auth_url in WebBrowser.openAuthSessionAsync()
      //   3. Handle the redirect callback with the authorisation code
      //   4. Your backend exchanges the code for a mandate/payment token
      //   5. Store the mandate reference against the Account row
      //
      // PRODUCTION SWAP (GoCardless — Direct Debit alternative):
      //   POST /api/payments/gocardless/mandate
      //   { account_holder, sort_code, account_number, account_id }
      //   Returns a redirect_url → open in WebBrowser for bank authorisation
      //
      // Neither sort_code nor account_number should be stored in plain text
      // on the client. Pass them directly to your backend in a single call
      // and let the payment provider tokenise them server-side.

      console.log('[PaymentDetailsScreen] MVP: fields captured, no gateway called.');
      router.replace('/(app)/home');
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Add bank details later?',
      'You\'ll need to add your bank details before you can fund your account and start trading.',
      [
        { text: 'Add now', style: 'cancel' },
        {
          text: 'Skip for now',
          onPress: () => router.replace('/(app)/home'),
        },
      ]
    );
  };

  // ── Field error helpers ──

  const holderError = touched.accountHolder && !isValidHolder(form.accountHolder);
  const sortCodeError = touched.sortCode && !isValidSortCode(form.sortCode);
  const accountNumberError = touched.accountNumber && !isValidAccountNumber(form.accountNumber);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav — no progress label; this is the optional final step */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <TouchableOpacity onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skipLabel}>Skip</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.iconWrap}>
            <Ionicons name="card-outline" size={32} color="#7C6FFF" />
          </View>
          <Text style={styles.title}>Bank details</Text>
          <Text style={styles.subtitle}>
            Add your UK bank account so you can fund your investments.
            You can also do this later from your settings.
          </Text>

          {/* MVP badge */}
          <View style={styles.mvpBadge}>
            <Ionicons name="time-outline" size={13} color="#F59E0B" />
            <Text style={styles.mvpBadgeText}>
              Paper trading only at this stage — no money will be moved until payment integration is live.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Account holder */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Account holder name</Text>
              <TextInput
                style={[styles.fieldInput, holderError && styles.fieldInputError]}
                value={form.accountHolder}
                onChangeText={(t) => setField('accountHolder', t)}
                onBlur={() => markTouched('accountHolder')}
                placeholder="As it appears on your bank account"
                placeholderTextColor="#3D3D56"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />
              {holderError && (
                <Text style={styles.fieldError}>Please enter the account holder name.</Text>
              )}
            </View>

            <View style={styles.fieldDivider} />

            {/* Sort code + account number side by side */}
            <View style={styles.fieldRowHalf}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Sort code</Text>
                <TextInput
                  style={[styles.fieldInput, sortCodeError && styles.fieldInputError]}
                  value={form.sortCode}
                  onChangeText={handleSortCodeChange}
                  onBlur={() => markTouched('sortCode')}
                  placeholder="00-00-00"
                  placeholderTextColor="#3D3D56"
                  keyboardType="number-pad"
                  maxLength={8}
                  returnKeyType="next"
                />
                {sortCodeError && (
                  <Text style={styles.fieldError}>Invalid sort code.</Text>
                )}
              </View>

              <View style={styles.halfDivider} />

              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Account number</Text>
                <TextInput
                  style={[styles.fieldInput, accountNumberError && styles.fieldInputError]}
                  value={form.accountNumber}
                  onChangeText={handleAccountNumberChange}
                  onBlur={() => markTouched('accountNumber')}
                  placeholder="00000000"
                  placeholderTextColor="#3D3D56"
                  keyboardType="number-pad"
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                />
                {accountNumberError && (
                  <Text style={styles.fieldError}>Must be 8 digits.</Text>
                )}
              </View>
            </View>
          </View>

          {/* Security note */}
          <View style={styles.infoBox}>
            <Ionicons name="lock-closed-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
            <Text style={styles.infoText}>
              Your bank details are encrypted in transit and never stored in plain text.
              In production, they are tokenised directly by the payment provider.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, (!isFormComplete(form) || loading) && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!isFormComplete(form) || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Saving…' : 'Save and continue'}
          </Text>
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
  skipLabel: { fontSize: 14, color: '#9B9BB4', fontWeight: '500' },

  // ── Content ──
  container: { padding: 24, paddingBottom: 120 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(124, 111, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 20, lineHeight: 21 },

  // ── MVP badge ──
  mvpBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  mvpBadgeText: { flex: 1, fontSize: 12, color: '#D4A017', lineHeight: 17 },

  // ── Form ──
  formCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    overflow: 'hidden',
    padding: 20,
  },
  fieldRow: { marginBottom: 4 },
  fieldRowHalf: { flexDirection: 'row', gap: 0 },
  halfDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
    marginTop: 20,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  fieldInput: {
    fontSize: 16,
    color: '#FFFFFF',
    padding: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  fieldInputError: { borderBottomColor: 'rgba(255,107,107,0.5)' },
  fieldError: { fontSize: 11, color: '#FF6B6B', marginTop: 5 },

  // ── Info box ──
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