/**
 * app/(app)/buy/[id].tsx
 *
 * Phase 4 — Buy order flow.
 *
 * Single scrollable screen, four modes driven by `mode` state:
 *   - edit      → quantity stepper + estimated-cost line + match note
 *   - review    → itemised breakdown (est. cost + £5 commission + total)
 *   - submitting→ placing the order
 *   - success / error → confirmation, then back to Portfolio
 *
 * Entry point: the Buy CTA on app/(app)/product/[id].tsx, which passes
 * { id, name, ticker } as route params. If those display params are absent
 * (e.g. a deep link straight to /buy/<id>), the product is re-fetched by id.
 *
 * Submits via tradingService.placeOrder({ accountId, symbol, qty, side, notionalGbp }).
 *
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tradingService } from '../../../services/trading';
import { productService } from '../../../services/products';

// ─── Constants ────────────────────────────────────────────────────────────────

// Flat per-order commission. NOTE: hardcoded here for now — same two-sources-of-truth
// caveat the handover flags for DONATION_RATE. Lift to a shared config/service if the
// fee ever becomes configurable.
const COMMISSION_GBP = 5;

// "A sentence, not a feature." Understated single line — do not promote to a card.
const MATCH_COPY =
  'Butterfly matches 5% of any profit you make, donated to your chosen cause.';

type Mode = 'edit' | 'review' | 'submitting' | 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatGbp = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : `£${n.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/**
 * ASSUMPTION: tradingService.getLatestPrice(symbol) resolves to a GBP price as a
 * plain number (or throws / returns null when the symbol isn't tradable on the
 * current endpoint — e.g. LSE/UCITS tickers on the US paper endpoint, per the
 * handover "Known issues"). If your service returns an object like
 * { price, currency }, this coercion is the single line to adjust.
 */
const coercePrice = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && 'price' in raw) {
    const p = (raw as { price: unknown }).price;
    return typeof p === 'number' && Number.isFinite(p) ? p : null;
  }
  return null;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryLabelEmphasis]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, emphasis && styles.summaryValueEmphasis]}>
        {value}
      </Text>
    </View>
  );
}

function MatchNote() {
  return (
    <View style={styles.matchRow}>
      <Ionicons name="heart-outline" size={13} color="#7C6FFF" style={{ marginTop: 1 }} />
      <Text style={styles.matchText}>{MATCH_COPY}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BuyScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; ticker?: string }>();
  const id = params.id;

  const [name, setName] = useState<string>(params.name ?? '');
  const [ticker, setTicker] = useState<string>(params.ticker ?? '');
  const [qty, setQty] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState<boolean>(true);
  const [mode, setMode] = useState<Mode>('edit');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cashBalance, setCashBalance] = useState<number | null>(null);

  // Fetch available cash for the pre-trade gate (server enforces it too —
  // this just surfaces the problem before the broker call).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const accountId = await tradingService.getActiveAccountId();
        const p = await tradingService.getPortfolio(accountId);
        if (active) setCashBalance(p.cashBalance);
      } catch (err) {
        console.warn('[BuyScreen] cash balance load failed', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Re-fetch product only if we arrived without display params (e.g. deep link).
  useEffect(() => {
    if ((name && ticker) || !id) return;
    let active = true;
    (async () => {
      try {
        const p = await productService.getProduct(id);
        if (active && p) {
          setName(p.name);
          setTicker(p.ticker);
        }
      } catch (err) {
        console.error('[BuyScreen] product load error:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, name, ticker]);

  // Fetch the latest price once we know the ticker. Degrades gracefully when the
  // symbol isn't tradable on the current endpoint — the flow still walks fully and
  // the broker error (if any) surfaces on submit.
  useEffect(() => {
    if (!ticker) return;
    let active = true;
    setPriceLoading(true);
    (async () => {
      try {
        const raw = await tradingService.getLatestPrice(ticker);
        if (active) setUnitPrice(coercePrice(raw));
      } catch (err) {
        console.warn('[BuyScreen] price unavailable for', ticker, err);
        if (active) setUnitPrice(null);
      } finally {
        if (active) setPriceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ticker]);

  const estCost = unitPrice != null ? qty * unitPrice : null; // notional, ex-commission
  const total = estCost != null ? estCost + COMMISSION_GBP : null;
  // True only when we have BOTH a live total and a known balance that can't cover it —
  // unknown balance never blocks (the server gate is authoritative).
  const insufficientCash =
    total != null && cashBalance != null && total > cashBalance;
  const canPlace = estCost != null && !insufficientCash;

  const inc = () => setQty((q) => q + 1); // TODO: position-size cap (Section 4) goes here once resolved
  const dec = () => setQty((q) => Math.max(1, q - 1));

  const submit = async () => {
    // notionalGbp is required by the service — without a live price we can't compute it.
    // The Place order button is disabled in that case; this guard is belt-and-braces
    // (and narrows estCost to a number for the call below).
    if (estCost == null) return;
    setMode('submitting');
    setErrorMsg(null);
    try {
      // getActiveAccountId is pinned to DEV_ACCOUNT_ID during solo testing (see handover).
      // Awaited in case the real per-user session logic is async.
      const accountId = await tradingService.getActiveAccountId();
      await tradingService.placeOrder({
        accountId,
        symbol: ticker,
        qty,
        side: 'buy',
        notionalGbp: estCost,
      });
      setMode('success');
    } catch (err: any) {
      console.error('[BuyScreen] placeOrder error:', err);
      setErrorMsg(err?.message ?? 'Something went wrong placing your order.');
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
          <Text style={styles.resultTitle}>Order placed</Text>
          <Text style={styles.resultBody}>
            Buy {qty} {ticker}. We'll update your portfolio when it fills.
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
          <Text style={styles.resultTitle}>Order not placed</Text>
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
            <Text style={styles.textButtonLabel}>Back to product</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const reviewing = mode === 'review' || mode === 'submitting';

  // ── Edit / Review ──
  return (
    <SafeAreaView style={styles.safe}>
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
        <Text style={styles.navTitle}>{reviewing ? 'Review order' : 'Buy'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Product header ── */}
        <View style={styles.productCard}>
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {name || ticker}
            </Text>
            <Text style={styles.productTicker}>{ticker}</Text>
          </View>
          <View style={styles.priceWrap}>
            {priceLoading ? (
              <ActivityIndicator size="small" color="#7C6FFF" />
            ) : (
              <>
                <Text style={styles.priceValue}>
                  {unitPrice != null ? formatGbp(unitPrice) : 'At market'}
                </Text>
                <Text style={styles.priceLabel}>
                  {unitPrice != null ? 'Latest price' : 'Price unavailable'}
                </Text>
              </>
            )}
          </View>
        </View>

        {!reviewing ? (
          <>
            {/* ── Quantity stepper ── */}
            <Text style={styles.sectionHeader}>Quantity</Text>
            <View style={styles.stepperCard}>
              <TouchableOpacity
                style={[styles.stepButton, qty <= 1 && styles.stepButtonDisabled]}
                onPress={dec}
                disabled={qty <= 1}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="remove"
                  size={22}
                  color={qty <= 1 ? '#3D3D56' : '#FFFFFF'}
                />
              </TouchableOpacity>
              <View style={styles.qtyWrap}>
                <Text style={styles.qtyValue}>{qty}</Text>
                <Text style={styles.qtyUnit}>{qty === 1 ? 'share' : 'shares'}</Text>
              </View>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={inc}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* ── Estimated cost line ── */}
            <View style={styles.estLine}>
              <View>
                <Text style={styles.estLabel}>Estimated cost</Text>
                <Text style={styles.estSub}>
                  Plus {formatGbp(COMMISSION_GBP)} commission
                </Text>
              </View>
              <Text style={styles.estValue}>
                {estCost != null
                  ? formatGbp(estCost)
                  : priceLoading
                  ? '…'
                  : 'At market'}
              </Text>
            </View>

            <MatchNote />
          </>
        ) : (
          <>
            {/* ── Review breakdown ── */}
            <Text style={styles.sectionHeader}>Order summary</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Order" value={`Buy ${qty} ${ticker}`} />
              <SummaryRow
                label="Unit price"
                value={unitPrice != null ? formatGbp(unitPrice) : 'At market'}
              />
              <SummaryRow
                label="Estimated cost"
                value={estCost != null ? formatGbp(estCost) : '—'}
              />
              <SummaryRow label="Commission" value={formatGbp(COMMISSION_GBP)} />
              <View style={styles.summaryDivider} />
              <SummaryRow
                label="Estimated total"
                value={total != null ? formatGbp(total) : '—'}
                emphasis
              />
            </View>

            <MatchNote />

            {insufficientCash && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/(app)/cash')}
              >
                <Text style={styles.noticeText}>
                  Not enough cash: this order needs {formatGbp(total)} and you have{' '}
                  {formatGbp(cashBalance)} available. Tap to add cash.
                </Text>
              </TouchableOpacity>
            )}

            {estCost == null && (
              <Text style={styles.noticeText}>
                A live price isn't available for {ticker} on the current endpoint, so the
                order can't be placed here. Positions for this ticker stay testable via the
                webhook-simulation harness.
              </Text>
            )}
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
            <Text style={styles.editButtonLabel}>Edit order</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            mode === 'submitting' && styles.primaryButtonBusy,
            reviewing && !canPlace && styles.primaryButtonDisabled,
          ]}
          activeOpacity={0.85}
          disabled={mode === 'submitting' || qty < 1 || (reviewing && !canPlace)}
          onPress={() => (reviewing ? submit() : setMode('review'))}
        >
          {mode === 'submitting' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {reviewing ? 'Place order' : 'Review order'}
            </Text>
          )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  navTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  // ── Content ──
  container: { padding: 20, paddingBottom: 40 },

  // ── Product header card ──
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 28,
  },
  productInfo: { flex: 1, marginRight: 12 },
  productName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22, marginBottom: 4 },
  productTicker: { fontSize: 13, fontWeight: '600', color: '#9B9BB4' },
  priceWrap: { alignItems: 'flex-end', minWidth: 70 },
  priceValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  priceLabel: { fontSize: 10, color: '#3D3D56', marginTop: 2 },

  // ── Section header ──
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // ── Quantity stepper ──
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 20,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.02)' },
  qtyWrap: { alignItems: 'center' },
  qtyValue: { fontSize: 30, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5 },
  qtyUnit: { fontSize: 12, color: '#9B9BB4', marginTop: 2 },

  // ── Estimated cost line ──
  estLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  estLabel: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  estSub: { fontSize: 12, color: '#9B9BB4', marginTop: 2 },
  estValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },

  // ── Review summary ──
  summaryCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 20,
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

  // ── Match note ──
  matchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginBottom: 8 },
  matchText: { flex: 1, fontSize: 12, color: '#9B9BB4', lineHeight: 18 },

  // ── Notice ──
  noticeText: {
    fontSize: 12,
    color: '#3D3D56',
    lineHeight: 18,
    paddingHorizontal: 4,
    marginTop: 4,
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