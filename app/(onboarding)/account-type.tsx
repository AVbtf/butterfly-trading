/**
 * app/(onboarding)/account-type.tsx
 *
 * OB-4 — Account type selection screen.
 *
 * Flow position:
 *   kyc-result (approved) → account-type → ni-number (ISA) | address (GIA)
 *
 * Renders two selectable cards (ISA / GIA) with plain-language explanations
 * suited to a first-time retail investor audience. On confirmation, creates
 * the Account row via accountService and routes to the next OB-4 step.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { accountService, AccountType } from '../../services/account';

// ─── Account type definitions ─────────────────────────────────────────────────

interface AccountTypeOption {
  type: AccountType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tagline: string;
  bullets: string[];
  caveat: string;
}

const ACCOUNT_OPTIONS: AccountTypeOption[] = [
  {
    type: 'ISA',
    label: 'Stocks & Shares ISA',
    icon: 'shield-checkmark-outline',
    tagline: 'Tax-free investing',
    bullets: [
      'Invest up to £20,000 per tax year',
      'No tax on gains or dividends',
      'Your allowance resets every April',
    ],
    caveat: 'Requires your National Insurance number',
  },
  {
    type: 'GIA',
    label: 'General Investment Account',
    icon: 'trending-up-outline',
    tagline: 'No limits, full flexibility',
    bullets: [
      'No annual contribution limit',
      'Open alongside an ISA at any time',
      'Gains and dividends may be taxable',
    ],
    caveat: 'No National Insurance number needed',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountTypeScreen() {
  const [selected, setSelected] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const alreadyExists = await accountService.hasAccountOfType(selected);
      if (!alreadyExists) {
        await accountService.createAccount({ type: selected });
      }
      if (selected === 'ISA') {
        router.push('/(onboarding)/ni-number');
      } else {
        router.push('/(onboarding)/address');
      }
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
          <View style={[styles.progressFill, { width: '25%' }]} />
        </View>
        <Text style={styles.progressLabel}>1 of 4</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Choose your account type</Text>
        <Text style={styles.subtitle}>
          You can open an additional account at any time from your settings.
        </Text>

        {/* Cards */}
        <View style={styles.optionsGroup}>
          {ACCOUNT_OPTIONS.map((option) => {
            const isSelected = selected === option.type;
            return (
              <TouchableOpacity
                key={option.type}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelected(option.type)}
                activeOpacity={0.8}
              >
                {/* Card header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconWrap}>
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={isSelected ? '#7C6FFF' : '#9B9BB4'}
                    />
                  </View>
                  <View style={styles.cardTitles}>
                    <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.cardTagline}>{option.tagline}</Text>
                  </View>
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </View>

                {/* Bullets */}
                <View style={styles.bullets}>
                  {option.bullets.map((bullet) => (
                    <View key={bullet} style={styles.bulletRow}>
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color={isSelected ? '#7C6FFF' : '#3D3D56'}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={[styles.bulletText, isSelected && styles.bulletTextSelected]}>
                        {bullet}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Caveat */}
                <View style={styles.caveatRow}>
                  <Ionicons name="information-circle-outline" size={13} color="#9B9BB4" />
                  <Text style={styles.caveatText}>{option.caveat}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Eligibility note */}
        <View style={styles.infoBox}>
          <Ionicons name="lock-closed-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            To open a Stocks & Shares ISA you must be a UK resident aged 18 or over.
            Capital at risk — the value of investments can go down as well as up.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, (!selected || loading) && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!selected || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Setting up…' : 'Continue'}
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

  // ── Cards ──
  optionsGroup: { gap: 12, marginBottom: 24 },
  card: {
    backgroundColor: '#141420',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardSelected: {
    borderColor: '#7C6FFF',
    backgroundColor: 'rgba(124, 111, 255, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitles: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: '#9B9BB4', marginBottom: 1 },
  cardLabelSelected: { color: '#FFFFFF' },
  cardTagline: { fontSize: 12, color: '#9B9BB4' },

  // ── Radio ──
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

  // ── Bullets ──
  bullets: { gap: 7, marginBottom: 14, paddingLeft: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 13, color: '#9B9BB4', lineHeight: 19 },
  bulletTextSelected: { color: '#FFFFFF' },

  // ── Caveat ──
  caveatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  caveatText: { fontSize: 12, color: '#9B9BB4' },

  // ── Info box ──
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
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