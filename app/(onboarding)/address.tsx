/**
 * app/(onboarding)/address.tsx
 *
 * OB-4 — Address input with postcode lookup.
 *
 * Flow position:
 *   ni-number (ISA) → address
 *   account-type (GIA) → address
 *   address → risk-notice
 *
 * Postcode lookup uses the Ideal Postcodes API (MVP Development Schedule, OB-4).
 * Mocked here — see PRODUCTION SWAP comment on lookupPostcode().
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressSuggestion {
  id: string;
  line1: string;
  line2?: string;
  town: string;
  county?: string;
  postcode: string;
}

interface AddressForm {
  line1: string;
  line2: string;
  town: string;
  county: string;
  postcode: string;
}

type ScreenMode = 'lookup' | 'results' | 'manual' | 'confirm';

// ─── Mock postcode lookup ─────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * PRODUCTION SWAP (Ideal Postcodes):
 *   const res = await fetch(
 *     `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(postcode)}`,
 *     { headers: { Authorization: `api_key="${process.env.IDEAL_POSTCODES_KEY}"` } }
 *   );
 *   const { result } = await res.json();
 *   return result.map((r: any) => ({
 *     id: r.udprn,
 *     line1: r.line_1,
 *     line2: r.line_2 || undefined,
 *     town: r.post_town,
 *     county: r.county || undefined,
 *     postcode: r.postcode,
 *   }));
 *
 * Store the API key in app.config.js / EAS secrets — never hard-coded.
 */
async function lookupPostcode(postcode: string): Promise<AddressSuggestion[]> {
  await delay(800);
  if (postcode.replace(/\s/g, '').length < 5) return [];
  const pc = postcode.toUpperCase();
  return [
    { id: '1', line1: '14 Monarch Way', town: 'London', postcode: pc },
    { id: '2', line1: '15 Monarch Way', town: 'London', postcode: pc },
    { id: '3', line1: 'Flat 2, 15 Monarch Way', town: 'London', postcode: pc },
  ];
}

// ─── Validation ───────────────────────────────────────────────────────────────

const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

const isFormComplete = (form: AddressForm) =>
  form.line1.trim().length > 0 &&
  form.town.trim().length > 0 &&
  UK_POSTCODE_REGEX.test(form.postcode.trim());

// ─── Field config ─────────────────────────────────────────────────────────────

const FIELDS: {
  key: keyof AddressForm;
  label: string;
  placeholder: string;
  capitalize: 'words' | 'characters' | 'none';
}[] = [
  { key: 'line1',    label: 'Address line 1', placeholder: '14 Monarch Way',  capitalize: 'words' },
  { key: 'line2',    label: 'Address line 2', placeholder: 'Optional',         capitalize: 'words' },
  { key: 'town',     label: 'Town / city',    placeholder: 'London',           capitalize: 'words' },
  { key: 'county',   label: 'County',         placeholder: 'Optional',         capitalize: 'words' },
  { key: 'postcode', label: 'Postcode',        placeholder: 'SW1A 1AA',         capitalize: 'characters' },
];

// ─── Progress per mode ────────────────────────────────────────────────────────

// OB-4 step 3 of 4 (GIA) or 3 of 4 (ISA, after ni-number)
const PROGRESS = '75%';
const PROGRESS_LABEL = '3 of 4';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddressScreen() {
  const [mode, setMode] = useState<ScreenMode>('lookup');
  const [postcode, setPostcode] = useState('');
  const [postcodeError, setPostcodeError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [form, setForm] = useState<AddressForm>({ line1: '', line2: '', town: '', county: '', postcode: '' });
  const [saveLoading, setSaveLoading] = useState(false);

  // ── Postcode lookup ──

  const handleLookup = async () => {
    const clean = postcode.trim();
    if (!UK_POSTCODE_REGEX.test(clean)) {
      setPostcodeError('Please enter a valid UK postcode.');
      return;
    }
    setPostcodeError('');
    setLookupLoading(true);
    try {
      const results = await lookupPostcode(clean);
      if (results.length === 0) {
        setPostcodeError('No addresses found. Try entering your address manually.');
        return;
      }
      setSuggestions(results);
      setMode('results');
    } catch {
      setPostcodeError('Lookup failed. Please try again or enter manually.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSelectSuggestion = (s: AddressSuggestion) => {
    setForm({ line1: s.line1, line2: s.line2 ?? '', town: s.town, county: s.county ?? '', postcode: s.postcode });
    setMode('confirm');
  };

  const handleEnterManually = () => {
    setForm((f) => ({ ...f, postcode: postcode.trim().toUpperCase() }));
    setMode('manual');
  };

  // ── Save & continue ──

  const handleContinue = async () => {
    setSaveLoading(true);
    try {
      // PRODUCTION SWAP:
      //   const { error } = await supabase.from('users').update({
      //     address_line1: form.line1, address_line2: form.line2 || null,
      //     address_town: form.town, address_county: form.county || null,
      //     address_postcode: form.postcode,
      //   }).eq('user_id', userId);
      //   if (error) throw error;
      console.log('[AddressScreen] Address saved:', form);
      router.push('/(onboarding)/risk-notice');
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Back handler (context-aware) ──

  const handleBack = () => {
    if (mode === 'results' || mode === 'manual') setMode('lookup');
    else if (mode === 'confirm') setMode('results');
    else router.back();
  };

  // ── Sub-renders ──

  const renderLookup = () => (
    <>
      <Text style={styles.title}>Your address</Text>
      <Text style={styles.subtitle}>
        We need your current UK residential address for regulatory purposes.
      </Text>

      <View style={styles.card}>
        <Text style={styles.inputLabel}>Postcode</Text>
        <View style={styles.postcodeRow}>
          <TextInput
            style={[styles.postcodeInput, !!postcodeError && styles.inputBorderError]}
            value={postcode}
            onChangeText={(t) => { setPostcode(t); setPostcodeError(''); }}
            placeholder="e.g. SW1A 1AA"
            placeholderTextColor="#3D3D56"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleLookup}
          />
          <TouchableOpacity
            style={[styles.findButton, lookupLoading && styles.findButtonDisabled]}
            onPress={handleLookup}
            disabled={lookupLoading}
            activeOpacity={0.85}
          >
            {lookupLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.findButtonText}>Find</Text>
            }
          </TouchableOpacity>
        </View>
        {!!postcodeError && <Text style={styles.errorText}>{postcodeError}</Text>}
      </View>

      <TouchableOpacity onPress={handleEnterManually} activeOpacity={0.7} style={styles.linkWrap}>
        <Text style={styles.link}>Enter address manually</Text>
      </TouchableOpacity>
    </>
  );

  const renderResults = () => (
    <>
      <Text style={styles.title}>Select your address</Text>
      <Text style={styles.subtitle}>{postcode.toUpperCase()}</Text>

      <View style={styles.listCard}>
        {suggestions.map((s, index) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.suggestionRow, index < suggestions.length - 1 && styles.suggestionRowBorder]}
            onPress={() => handleSelectSuggestion(s)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestionLine1}>{s.line1}</Text>
              {s.line2 ? <Text style={styles.suggestionLine2}>{s.line2}</Text> : null}
              <Text style={styles.suggestionLine2}>{s.town}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#3D3D56" />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={handleEnterManually} activeOpacity={0.7} style={styles.linkWrap}>
        <Text style={styles.link}>My address isn't listed</Text>
      </TouchableOpacity>
    </>
  );

  const renderForm = (isConfirm: boolean) => (
    <>
      <Text style={styles.title}>{isConfirm ? 'Confirm your address' : 'Enter your address'}</Text>
      {isConfirm && (
        <Text style={styles.subtitle}>Please check the details below are correct.</Text>
      )}

      <View style={styles.fieldsCard}>
        {FIELDS.map(({ key, label, placeholder, capitalize }, index) => (
          <View
            key={key}
            style={[styles.fieldRow, index < FIELDS.length - 1 && styles.fieldRowBorder]}
          >
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              style={styles.fieldInput}
              value={form[key]}
              onChangeText={(t) => setForm((f) => ({ ...f, [key]: t }))}
              placeholder={placeholder}
              placeholderTextColor="#3D3D56"
              autoCapitalize={capitalize}
              autoCorrect={false}
            />
          </View>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="lock-closed-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
        <Text style={styles.infoText}>
          Your address is used solely for regulatory identity verification and
          stored securely in accordance with our privacy policy.
        </Text>
      </View>
    </>
  );

  const showFooterCTA = mode === 'manual' || mode === 'confirm';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={handleBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: PROGRESS }]} />
        </View>
        <Text style={styles.progressLabel}>{PROGRESS_LABEL}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, showFooterCTA && { paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'lookup'  && renderLookup()}
          {mode === 'results' && renderResults()}
          {mode === 'manual'  && renderForm(false)}
          {mode === 'confirm' && renderForm(true)}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed footer — only on form modes */}
      {showFooterCTA && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, (!isFormComplete(form) || saveLoading) && styles.primaryButtonDisabled]}
            onPress={handleContinue}
            disabled={!isFormComplete(form) || saveLoading}
            activeOpacity={0.85}
          >
            {saveLoading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
            }
          </TouchableOpacity>
        </View>
      )}
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
  container: { padding: 24, paddingBottom: 40 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 28, lineHeight: 21 },

  // ── Postcode lookup ──
  card: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  postcodeRow: { flexDirection: 'row', gap: 10 },
  postcodeInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  inputBorderError: { borderColor: 'rgba(255,107,107,0.4)' },
  findButton: {
    backgroundColor: '#7C6FFF',
    borderRadius: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  findButtonDisabled: { opacity: 0.5 },
  findButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  errorText: { fontSize: 12, color: '#FF6B6B', marginTop: 8 },
  linkWrap: { alignItems: 'center', paddingVertical: 12 },
  link: { fontSize: 14, color: '#7C6FFF' },

  // ── Results list ──
  listCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  suggestionRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  suggestionLine1: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  suggestionLine2: { fontSize: 13, color: '#9B9BB4' },

  // ── Manual / confirm fields ──
  fieldsCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  fieldRow: { paddingHorizontal: 18, paddingVertical: 14 },
  fieldRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  fieldInput: { fontSize: 15, color: '#FFFFFF', padding: 0 },

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