/**
 * app/(onboarding)/risk-notice.tsx
 *
 * OB-4 — Capital risk notice & acceptance.
 *
 * Flow position:
 *   address → risk-notice → payment-details
 *
 * Regulatory requirement: the user must be shown a clear capital-at-risk
 * warning before they can proceed to invest. Their acceptance is logged
 * with a timestamp — this is the record of informed consent.
 *
 * Data model note: acceptance should be persisted against the User row.
 * PRODUCTION SWAP comments below show the Supabase write.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// ─── Risk statements ──────────────────────────────────────────────────────────

const RISK_ITEMS: { icon: keyof typeof Ionicons.glyphMap; heading: string; body: string }[] = [
  {
    icon: 'trending-down-outline',
    heading: 'Your capital is at risk',
    body: 'The value of your investments can go down as well as up. You may get back less than you invest.',
  },
  {
    icon: 'time-outline',
    heading: 'Past performance is not a guide',
    body: 'Historical returns do not guarantee future results. Markets can be volatile over short periods.',
  },
  {
    icon: 'swap-horizontal-outline',
    heading: 'Liquidity risk',
    body: 'ETFs are generally liquid, but in exceptional market conditions you may not be able to sell immediately at the expected price.',
  },
  {
    icon: 'calculator-outline',
    heading: 'Tax treatment may vary',
    body: 'Tax rules can change. The value of any tax benefits depends on your personal circumstances.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RiskNoticeScreen() {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Unlock the checkbox once the user has scrolled to the bottom of the notice
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom < 40) setHasScrolledToBottom(true);
  };

  const handleContinue = async () => {
    if (!accepted) return;
    setLoading(true);
    try {
      // PRODUCTION SWAP:
      //   const { error } = await supabase
      //     .from('users')
      //     .update({
      //       risk_notice_accepted: true,
      //       risk_notice_accepted_at: new Date().toISOString(),
      //     })
      //     .eq('user_id', userId);
      //   if (error) throw error;
      console.log('[RiskNoticeScreen] Acceptance logged at:', new Date().toISOString());
      router.push('/(onboarding)/payment-details');
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canAccept = hasScrolledToBottom;
  const canContinue = accepted && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.progressLabel}>4 of 4</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {/* Header */}
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={32} color="#F59E0B" />
        </View>
        <Text style={styles.title}>Important risk information</Text>
        <Text style={styles.subtitle}>
          Please read the following carefully before you start investing.
        </Text>

        {/* Risk items */}
        <View style={styles.riskCard}>
          {RISK_ITEMS.map((item, index) => (
            <View
              key={item.heading}
              style={[styles.riskRow, index < RISK_ITEMS.length - 1 && styles.riskRowBorder]}
            >
              <View style={styles.riskIconWrap}>
                <Ionicons name={item.icon} size={18} color="#F59E0B" />
              </View>
              <View style={styles.riskText}>
                <Text style={styles.riskHeading}>{item.heading}</Text>
                <Text style={styles.riskBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Regulatory blurb */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Butterfly Trading is not a financial adviser. Nothing in this app
            constitutes personal financial advice. If you are unsure whether
            investing is right for you, please seek independent financial advice.
          </Text>
        </View>

        {/* Scroll-to-unlock hint */}
        {!hasScrolledToBottom && (
          <View style={styles.scrollHint}>
            <Ionicons name="chevron-down" size={14} color="#9B9BB4" />
            <Text style={styles.scrollHintText}>Scroll down to confirm you have read this</Text>
          </View>
        )}

        {/* Acceptance checkbox */}
        <TouchableOpacity
          style={[styles.checkRow, !canAccept && styles.checkRowDisabled]}
          onPress={() => canAccept && setAccepted((v) => !v)}
          activeOpacity={canAccept ? 0.7 : 1}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted, disabled: !canAccept }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && <Ionicons name="checkmark" size={14} color="#0A0A0F" />}
          </View>
          <Text style={[styles.checkLabel, !canAccept && styles.checkLabelDisabled]}>
            I have read and understood the risk information above and accept that the
            value of my investments can go down as well as up.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Saving…' : 'I understand, continue'}
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
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
  subtitle: { fontSize: 15, color: '#9B9BB4', marginBottom: 28, lineHeight: 21 },

  // ── Risk card ──
  riskCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  riskRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  riskRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  riskIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  riskText: { flex: 1 },
  riskHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  riskBody: { fontSize: 13, color: '#9B9BB4', lineHeight: 19 },

  // ── Info box ──
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: { flex: 1, fontSize: 12, color: '#9B9BB4', lineHeight: 17 },

  // ── Scroll hint ──
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  scrollHintText: { fontSize: 12, color: '#9B9BB4' },

  // ── Checkbox ──
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  checkRowDisabled: { opacity: 0.4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#7C6FFF',
    borderColor: '#7C6FFF',
  },
  checkLabel: { flex: 1, fontSize: 13, color: '#FFFFFF', lineHeight: 20 },
  checkLabelDisabled: { color: '#9B9BB4' },

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