/**
 * app/(app)/cash.tsx
 *
 * Phase 4 — Cash deposit / withdrawal (demo cash, no payment gateway).
 *
 * Mirrors the buy/sell machine: edit → review → submitting → success/error.
 * Deposit or withdraw against accounts.cash_balance via the adjust_cash edge
 * action (atomic RPC: balance update + cash_transactions audit row).
 *
 * Limits (mirrored server-side, which is authoritative): £1–£100,000 per
 * movement; withdrawals cannot exceed the available balance.
 *
 * Entry point: "Add or withdraw cash" on the portfolio summary card.
 * Design tokens mirror the Phase 3 screens (#0A0A0F / #141420 / #7C6FFF).
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tradingService } from '../../services/trading';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_GBP = 1;
const MAX_GBP = 100_000;

type Direction = 'deposit' | 'withdraw';
type Mode = 'edit' | 'review' | 'submitting' | 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatGbp = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : `£${n.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/** Parse the amount field: digits with optional decimal point, max 2 dp. */
const parseAmount = (raw: string): number | null => {
  const cleaned = raw.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CashScreen() {
  const [direction, setDirection] = useState<Direction>('deposit');
  const [amountText, setAmountText] = useState<string>('');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('edit');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  // Fetch the live balance on mount (never trust a stale param).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const accountId = await tradingService.getActiveAccountId();
        const p = await tradingService.getPortfolio(accountId);
        if (active) setBalance(p.cashBalance);
      } catch (err) {
        console.warn('[CashScreen] balance load failed', err);
      } finally {
        if (active) setBalanceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const amount = parseAmount(amountText);
  const isWithdraw = direction === 'withdraw';

  // Client-side validation (the edge action + RPC enforce independently).
  let validationMsg: string | null = null;
  if (amount != null) {
    if (amount < MIN_GBP || amount > MAX_GBP) {
      validationMsg = `Amount must be between ${formatGbp(MIN_GBP)} and ${formatGbp(MAX_GBP)}.`;
    } else if (isWithdraw && balance != null && amount > balance) {
      validationMsg = `You can withdraw up to ${formatGbp(balance)}.`;
    }
  }
  const canContinue = amount != null && validationMsg == null;

  const resultingBalance =
    amount != null && balance != null
      ? balance + (isWithdraw ? -amount : amount)
      : null;

  const submit = async () => {
    if (amount == null) return;
    setMode('submitting');
    setErrorMsg(null);
    try {
      const accountId = await tradingService.getActiveAccountId();
      const res = await tradingService.adjustCash(
        accountId,
        isWithdraw ? -amount : amount,
        `${direction} via app`,
      );
      setNewBalance(res.newBalance);
      setMode('success');
    } catch (err: any) {
      console.error('[CashScreen] adjustCash error:', err);
      setErrorMsg(err?.message ?? 'Something went wrong moving your cash.');
      setMode('error');
    }
  };

  // ── Success state ──
  if (mode === 'success') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.resultWrap}>
          <View style={[styles.resultIcon, styles.resultIconSuccess]}>
            <Ionicons name="checkmark" size={32} color="#34D399" />
          </View>
          <Text style={styles.resultTitle}>
            {isWithdraw ? 'Withdrawal complete' : 'Deposit complete'}
          </Text>
          <Text style={styles.resultBody}>
            {isWithdraw ? 'Withdrew' : 'Added'} {formatGbp(amount)}. Your available
            cash is now {formatGbp(newBalance)}.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, styles.resultButton]}
            activeOpacity={0.85}
            onPress={() => router.replace('/(app)/portfolio')}
          >
            <Text style={styles.primaryButtonText}>View portfolio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (mode === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.resultWrap}>
          <View style={[styles.resultIcon, styles.resultIconError]}>
            <Ionicons name="close" size={32} color="#FF6B6B" />
          </View>
          <Text style={styles.resultTitle}>Nothing was moved</Text>
          <Text style={styles.resultBody}>{errorMsg}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, styles.resultButton]}
            activeOpacity={0.85}
            onPress={() => setMode('review')}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.textButton}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Text style={styles.textButtonLabel}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const reviewing = mode === 'review' || mode === 'submitting';

  // ── Edit / Review ──
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Nav */}
        <View style={styles.nav}>
          <TouchableOpacity
            onPress={() => (reviewing ? setMode('edit') : router.back())}
            hitSlop={12}
            activeOpacity={0.7}
            disabled={mode === 'submitting'}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>
            {reviewing ? 'Review' : 'Manage cash'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Balance header ── */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available cash</Text>
            {balanceLoading ? (
              <ActivityIndicator size="small" color="#7C6FFF" />
            ) : (
              <Text style={styles.balanceValue}>{formatGbp(balance)}</Text>
            )}
          </View>

          {!reviewing ? (
            <>
              {/* ── Direction toggle ── */}
              <View style={styles.toggleRow}>
                {(['deposit', 'withdraw'] as Direction[]).map((d) => {
                  const active = d === direction;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.toggleTab, active && styles.toggleTabActive]}
                      onPress={() => setDirection(d)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={d === 'deposit' ? 'arrow-down' : 'arrow-up'}
                        size={14}
                        color={active ? '#7C6FFF' : '#9B9BB4'}
                      />
                      <Text
                        style={[styles.toggleText, active && styles.toggleTextActive]}
                      >
                        {d === 'deposit' ? 'Deposit' : 'Withdraw'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Amount entry ── */}
              <Text style={styles.sectionHeader}>Amount</Text>
              <View style={styles.amountCard}>
                <Text style={styles.amountCurrency}>£</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="0.00"
                  placeholderTextColor="#3D3D56"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  autoFocus
                />
              </View>

              {validationMsg ? (
                <Text style={styles.validationText}>{validationMsg}</Text>
              ) : (
                <Text style={styles.hintText}>
                  Between {formatGbp(MIN_GBP)} and {formatGbp(MAX_GBP)} per movement.
                  Demo cash — no real money moves.
                </Text>
              )}
            </>
          ) : (
            <>
              {/* ── Review breakdown ── */}
              <Text style={styles.sectionHeader}>Summary</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {isWithdraw ? 'Withdraw' : 'Deposit'}
                  </Text>
                  <Text style={styles.summaryValue}>{formatGbp(amount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Current balance</Text>
                  <Text style={styles.summaryValue}>{formatGbp(balance)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, styles.summaryLabelEmphasis]}>
                    New balance
                  </Text>
                  <Text style={[styles.summaryValue, styles.summaryValueEmphasis]}>
                    {formatGbp(resultingBalance)}
                  </Text>
                </View>
              </View>
              <Text style={styles.hintText}>
                Demo cash for paper trading — no payment is taken or sent.
              </Text>
            </>
          )}
        </ScrollView>

        {/* ── Fixed footer CTA ── */}
        <View style={styles.footer}>
          {reviewing && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setMode('edit')}
              disabled={mode === 'submitting'}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonLabel}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              mode === 'submitting' && styles.primaryButtonBusy,
              !canContinue && styles.primaryButtonDisabled,
            ]}
            activeOpacity={0.85}
            disabled={mode === 'submitting' || !canContinue}
            onPress={() => (reviewing ? submit() : setMode('review'))}
          >
            {mode === 'submitting' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {reviewing
                  ? isWithdraw
                    ? 'Confirm withdrawal'
                    : 'Confirm deposit'
                  : 'Review'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  navTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  // ── Content ──
  container: { padding: 20, paddingBottom: 40 },

  // ── Balance header ──
  balanceCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 24,
  },
  balanceLabel: { fontSize: 13, color: '#9B9BB4', marginBottom: 6 },
  balanceValue: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4 },

  // ── Direction toggle ──
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  toggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  toggleTabActive: {
    backgroundColor: 'rgba(124,111,255,0.15)',
    borderColor: '#7C6FFF',
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#9B9BB4' },
  toggleTextActive: { color: '#7C6FFF' },

  // ── Section header ──
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // ── Amount entry ──
  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 12,
  },
  amountCurrency: { fontSize: 28, fontWeight: '700', color: '#9B9BB4', marginRight: 8 },
  amountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingVertical: 12,
    letterSpacing: -0.5,
  },
  validationText: { fontSize: 12, color: '#FF6B6B', lineHeight: 18, paddingHorizontal: 4 },
  hintText: { fontSize: 12, color: '#3D3D56', lineHeight: 18, paddingHorizontal: 4 },

  // ── Review summary ──
  summaryCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: { fontSize: 14, color: '#9B9BB4' },
  summaryLabelEmphasis: { color: '#FFFFFF', fontWeight: '600' },
  summaryValue: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
  summaryValueEmphasis: { fontSize: 18, fontWeight: '700' },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0A0F',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonBusy: { opacity: 0.7 },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  editButton: {
    paddingHorizontal: 20,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  editButtonLabel: { fontSize: 15, fontWeight: '600', color: '#9B9BB4' },

  // ── Result (success / error) ──
  resultButton: { flex: 0, alignSelf: 'stretch' },
  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  resultIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  resultIconSuccess: { backgroundColor: 'rgba(52,211,153,0.12)' },
  resultIconError: { backgroundColor: 'rgba(255,107,107,0.12)' },
  resultTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  resultBody: {
    fontSize: 14,
    color: '#9B9BB4',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  textButton: { marginTop: 16, paddingVertical: 8 },
  textButtonLabel: { fontSize: 14, fontWeight: '600', color: '#9B9BB4' },
});
