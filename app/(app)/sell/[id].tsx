/**
 * app/(app)/sell/[id].tsx
 *
 * Phase 4 — Sell order flow.
 *
 * Mirrors the buy flow (edit → review → submitting → success/error) but is
 * position-aware:
 *   - quantity is bounded by the holding (min 1, max position qty) with Sell all
 *   - the money line inverts: net proceeds = (qty × price) − £5 commission
 *   - shows an INDICATIVE estimated gain (qty × (price − avg cost))
 *
 * The real matched-donation figure is NOT computed here. The win/loss split and
 * per-position cap live in record_fill_and_donation (single source of truth) and
 * the actual amount lands on the Phase 5 post-trade confirmation screen.
 *
 * Entry point: the holding card on app/(app)/portfolio.tsx, which passes
 * { id: positionId, name, ticker, posQty, avgCost }. If those are absent (deep
 * link), the position is recovered from getPortfolio().
 *
 * Submits via tradingService.placeOrder({ ..., side: 'sell', notionalGbp }).
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

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMISSION_GBP = 5; // flat per-order fee (see buy flow — same single-source-of-truth caveat)

const MATCH_COPY =
  'Butterfly matches a share of any profit on this sale, donated to your chosen cause. ' +
  'The exact amount is confirmed when the trade fills.';

type Mode = 'edit' | 'review' | 'submitting' | 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatGbp = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : `£${n.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const signedGbp = (n: number): string => `${n >= 0 ? '+' : '−'}${formatGbp(Math.abs(n))}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  emphasis,
  color,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  color?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryLabelEmphasis]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          emphasis && styles.summaryValueEmphasis,
          color ? { color } : null,
        ]}
      >
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

export default function SellScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    ticker?: string;
    posQty?: string;
    avgCost?: string;
  }>();
  const positionId = params.id;

  const [name, setName] = useState<string>(params.name ?? '');
  const [ticker, setTicker] = useState<string>(params.ticker ?? '');
  const [maxQty, setMaxQty] = useState<number>(params.posQty ? Number(params.posQty) : 0);
  const [avgCost, setAvgCost] = useState<number>(params.avgCost ? Number(params.avgCost) : 0);

  const [qty, setQty] = useState<number>(params.posQty ? Number(params.posQty) : 1); // default: full position
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState<boolean>(true);
  const [mode, setMode] = useState<Mode>('edit');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Recover the position from the portfolio if we arrived without params (deep link).
  useEffect(() => {
    if ((ticker && maxQty > 0) || !positionId) return;
    let active = true;
    (async () => {
      try {
        const accountId = await tradingService.getActiveAccountId();
        const p = await tradingService.getPortfolio(accountId);
        const h = p.holdings.find((x) => x.positionId === positionId);
        if (active && h) {
          setName(h.name ?? h.ticker ?? '');
          setTicker(h.ticker ?? '');
          setMaxQty(h.quantity);
          setAvgCost(h.avgCostGbp);
          setQty(h.quantity);
        }
      } catch (err) {
        console.error('[SellScreen] position load error:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [positionId, ticker, maxQty]);

  // Latest price for proceeds + gain. Degrades gracefully when the symbol can't
  // be priced on the current endpoint (same LSE wall as the buy flow).
  useEffect(() => {
    if (!ticker) {
      setPriceLoading(false);
      return;
    }
    let active = true;
    setPriceLoading(true);
    (async () => {
      const price = await tradingService.getLatestPrice(ticker);
      if (active) {
        setUnitPrice(price);
        setPriceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ticker]);

  const grossProceeds = unitPrice != null ? qty * unitPrice : null; // notional, ex-commission
  const netProceeds = grossProceeds != null ? grossProceeds - COMMISSION_GBP : null;
  const estGain = unitPrice != null ? (unitPrice - avgCost) * qty : null; // indicative, vs cost basis
  const canPlace = grossProceeds != null; // placeOrder requires notionalGbp — gate on a real price

  const inc = () => setQty((q) => Math.min(maxQty || q, q + 1));
  const dec = () => setQty((q) => Math.max(1, q - 1));
  const sellAll = () => setQty(maxQty || 1);

  const gainColor = estGain == null ? '#9B9BB4' : estGain >= 0 ? '#34D399' : '#FF6B6B';

  const submit = async () => {
    if (grossProceeds == null) return; // gated by the disabled button; narrows the type below
    setMode('submitting');
    setErrorMsg(null);
    try {
      const accountId = await tradingService.getActiveAccountId();
      await tradingService.placeOrder({
        accountId,
        symbol: ticker,
        qty,
        side: 'sell',
        notionalGbp: grossProceeds,
      });
      setMode('success');
    } catch (err: any) {
      console.error('[SellScreen] placeOrder error:', err);
      setErrorMsg(err?.message ?? 'Something went wrong placing your order.');
      setMode('error');
    }
  };

  // ── Success ──
  if (mode === 'success') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.resultWrap}>
          <View style={[styles.resultIcon, styles.resultIconSuccess]}>
            <Ionicons name="checkmark" size={32} color="#34D399" />
          </View>
          <Text style={styles.resultTitle}>Order placed</Text>
          <Text style={styles.resultBody}>
            Sell {qty} {ticker}. We'll update your portfolio when it fills.
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

  // ── Error ──
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
          <TouchableOpacity style={styles.textButton} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.textButtonLabel}>Back to portfolio</Text>
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
        <Text style={styles.navTitle}>{reviewing ? 'Review order' : 'Sell'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Position header */}
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
            {/* Quantity (bounded by the position) */}
            <Text style={styles.sectionHeader}>Quantity</Text>
            <View style={styles.stepperCard}>
              <TouchableOpacity
                style={[styles.stepButton, qty <= 1 && styles.stepButtonDisabled]}
                onPress={dec}
                disabled={qty <= 1}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={22} color={qty <= 1 ? '#3D3D56' : '#FFFFFF'} />
              </TouchableOpacity>
              <View style={styles.qtyWrap}>
                <Text style={styles.qtyValue}>{qty}</Text>
                <Text style={styles.qtyUnit}>{qty === 1 ? 'share' : 'shares'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.stepButton, qty >= maxQty && styles.stepButtonDisabled]}
                onPress={inc}
                disabled={qty >= maxQty}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={22} color={qty >= maxQty ? '#3D3D56' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>

            <View style={styles.posRow}>
              <Text style={styles.posMeta}>
                of {maxQty} {maxQty === 1 ? 'share' : 'shares'} · avg {formatGbp(avgCost)}
              </Text>
              <TouchableOpacity onPress={sellAll} activeOpacity={0.7} disabled={qty >= maxQty}>
                <Text style={[styles.sellAll, qty >= maxQty && styles.sellAllDisabled]}>Sell all</Text>
              </TouchableOpacity>
            </View>

            {/* Estimated proceeds */}
            <View style={styles.estLine}>
              <View>
                <Text style={styles.estLabel}>Estimated proceeds</Text>
                <Text style={styles.estSub}>After {formatGbp(COMMISSION_GBP)} commission</Text>
              </View>
              <Text style={styles.estValue}>
                {netProceeds != null ? formatGbp(netProceeds) : priceLoading ? '…' : 'At market'}
              </Text>
            </View>

            {/* Indicative gain */}
            <View style={styles.gainLine}>
              <Text style={styles.gainLabel}>Estimated gain</Text>
              <Text style={[styles.gainValue, { color: gainColor }]}>
                {estGain != null ? signedGbp(estGain) : '—'}
              </Text>
            </View>

            <MatchNote />
          </>
        ) : (
          <>
            {/* Review breakdown */}
            <Text style={styles.sectionHeader}>Order summary</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Order" value={`Sell ${qty} ${ticker}`} />
              <SummaryRow
                label="Unit price"
                value={unitPrice != null ? formatGbp(unitPrice) : 'At market'}
              />
              <SummaryRow
                label="Gross proceeds"
                value={grossProceeds != null ? formatGbp(grossProceeds) : '—'}
              />
              <SummaryRow label="Commission" value={`−${formatGbp(COMMISSION_GBP)}`} />
              <View style={styles.summaryDivider} />
              <SummaryRow
                label="Net proceeds"
                value={netProceeds != null ? formatGbp(netProceeds) : '—'}
                emphasis
              />
              <SummaryRow
                label="Estimated gain"
                value={estGain != null ? signedGbp(estGain) : '—'}
                color={gainColor}
              />
            </View>

            <Text style={styles.indicativeNote}>
              Estimated gain is indicative, based on the latest price against your average cost.
            </Text>

            <MatchNote />

            {!canPlace && (
              <Text style={styles.noticeText}>
                A live price isn't available for {ticker} on the current endpoint, so the order
                can't be placed here. Sells for this ticker stay testable via the
                webhook-simulation harness.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Fixed footer */}
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
          disabled={mode === 'submitting' || qty < 1 || maxQty < 1 || (reviewing && !canPlace)}
          onPress={() => (reviewing ? submit() : setMode('review'))}
        >
          {mode === 'submitting' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{reviewing ? 'Place order' : 'Review order'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  navTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  container: { padding: 20, paddingBottom: 40 },

  // Position header
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

  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Stepper
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
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

  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  posMeta: { fontSize: 12, color: '#9B9BB4' },
  sellAll: { fontSize: 13, fontWeight: '600', color: '#7C6FFF' },
  sellAllDisabled: { color: '#3D3D56' },

  // Estimated proceeds
  estLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  estLabel: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  estSub: { fontSize: 12, color: '#9B9BB4', marginTop: 2 },
  estValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },

  gainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  gainLabel: { fontSize: 13, color: '#9B9BB4' },
  gainValue: { fontSize: 14, fontWeight: '600' },

  // Review summary
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
  summaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8 },

  indicativeNote: { fontSize: 12, color: '#3D3D56', lineHeight: 18, paddingHorizontal: 4, marginBottom: 16 },

  // Match note
  matchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginBottom: 8 },
  matchText: { flex: 1, fontSize: 12, color: '#9B9BB4', lineHeight: 18 },

  noticeText: { fontSize: 12, color: '#3D3D56', lineHeight: 18, paddingHorizontal: 4, marginTop: 4 },

  // Footer
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

  // Result
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
  resultBody: { fontSize: 14, color: '#9B9BB4', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  textButton: { marginTop: 16, paddingVertical: 8 },
  textButtonLabel: { fontSize: 14, fontWeight: '600', color: '#9B9BB4' },
});
