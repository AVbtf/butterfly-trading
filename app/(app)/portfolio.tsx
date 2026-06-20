/**
 * app/(app)/portfolio.tsx
 *
 * Portfolio / holdings screen — the main investing surface.
 *
 * Reads live data via tradingService.getPortfolio (cash, holdings, and the
 * matched-donation impact per holding). Each holding shows quantity, cost
 * basis, value, and the impact it has generated — tying every position to its
 * Butterfly contribution.
 *
 * Live P&L needs a current price (tradingService.getLatestPrice). When the
 * market-data endpoint can't price a symbol (e.g. LSE tickers on the US paper
 * endpoint), the row falls back to cost basis and omits P&L rather than
 * showing a wrong number.
 *
 * Tapping a holding opens the Sell flow (app/(app)/sell/[id]).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tradingService, Holding, Portfolio } from '../../services/trading';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface HoldingView extends Holding {
  marketValue: number; // live (price × qty) when available, else cost basis
  pnl: number | null; // null when no live price
  pnlPct: number | null;
  priceLive: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [rows, setRows] = useState<HoldingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const accountId = await tradingService.getActiveAccountId();
      const p = await tradingService.getPortfolio(accountId);
      setPortfolio(p);

      // Try to price each holding for live value + P&L; fall back to cost basis.
      const priced = await Promise.all(
        p.holdings.map(async (h): Promise<HoldingView> => {
          const costBasis = h.avgCostGbp * h.quantity;
          const price = h.ticker ? await tradingService.getLatestPrice(h.ticker) : null;
          if (price != null) {
            const marketValue = price * h.quantity;
            const pnl = marketValue - costBasis;
            return {
              ...h,
              marketValue,
              pnl,
              pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : null,
              priceLive: true,
            };
          }
          return {
            ...h,
            marketValue: h.currentValueGbp && h.currentValueGbp > 0 ? h.currentValueGbp : costBasis,
            pnl: null,
            pnlPct: null,
            priceLive: false,
          };
        }),
      );
      setRows(priced);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your portfolio.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color="#7C6FFF" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color="#9B9BB4" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); load().then(() => setLoading(false)); }}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C6FFF" />
        }
      >
        <Text style={styles.heading}>Portfolio</Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Available cash</Text>
          <Text style={styles.summaryValue}>{gbp(portfolio?.cashBalance ?? 0)}</Text>

          <View style={styles.impactRow}>
            <View style={styles.impactDot} />
            <Text style={styles.impactLabel}>Impact raised</Text>
            <Text style={styles.impactValue}>{gbp(portfolio?.totalImpactGbp ?? 0)}</Text>
          </View>
        </View>

        {/* Holdings */}
        <Text style={styles.sectionTitle}>Open positions</Text>

        {rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="trending-up-outline" size={24} color="#9B9BB4" />
            <Text style={styles.emptyTitle}>No open positions</Text>
            <Text style={styles.emptyText}>
              Invest in a fund and Butterfly matches 5% of your profit as a charitable donation.
            </Text>
            <TouchableOpacity style={styles.emptyCta} onPress={() => router.push('/(app)/products')}>
              <Text style={styles.emptyCtaText}>Explore funds</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.holdingsGroup}>
            {rows.map((h) => {
              const positive = (h.pnl ?? 0) >= 0;
              const pnlColor = h.pnl == null ? '#9B9BB4' : positive ? '#3FD08A' : '#FF6B6B';
              return (
                <TouchableOpacity
                  key={h.positionId}
                  style={styles.holdingCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/sell/[id]',
                      params: {
                        id: h.positionId,
                        name: h.name ?? h.ticker ?? '',
                        ticker: h.ticker ?? '',
                        posQty: String(h.quantity),
                        avgCost: String(h.avgCostGbp),
                      },
                    })
                  }
                >
                  <View style={styles.holdingHeader}>
                    <View style={styles.tickerBadge}>
                      <Text style={styles.tickerText}>{h.ticker ?? '—'}</Text>
                    </View>
                    <View style={styles.holdingTitles}>
                      <Text style={styles.holdingName} numberOfLines={1}>{h.name ?? h.ticker ?? 'Holding'}</Text>
                      <Text style={styles.holdingSub}>
                        {h.quantity} {h.quantity === 1 ? 'share' : 'shares'} · avg {gbp(h.avgCostGbp)}
                      </Text>
                    </View>
                    <View style={styles.holdingFigures}>
                      <Text style={styles.holdingValue}>{gbp(h.marketValue)}</Text>
                      <Text style={[styles.holdingPnl, { color: pnlColor }]}>
                        {h.pnl == null
                          ? 'Live price unavailable'
                          : `${positive ? '+' : ''}${gbp(h.pnl)} (${positive ? '+' : ''}${(h.pnlPct ?? 0).toFixed(2)}%)`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.holdingImpactRow}>
                    <Ionicons name="heart-outline" size={13} color="#7C6FFF" />
                    <Text style={styles.holdingImpactText}>Impact raised</Text>
                    <Text style={styles.holdingImpactValue}>{gbp(h.impactGbp)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  container: { padding: 24, paddingBottom: 48 },

  heading: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4, marginBottom: 18 },

  // ── Summary ──
  summaryCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 28,
  },
  summaryLabel: { fontSize: 13, color: '#9B9BB4', marginBottom: 6 },
  summaryValue: { fontSize: 34, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5 },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  impactDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7C6FFF' },
  impactLabel: { flex: 1, fontSize: 13, color: '#C4C4D4' },
  impactValue: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  // ── Section ──
  sectionTitle: { fontSize: 13, color: '#9B9BB4', marginBottom: 12, letterSpacing: 0.2 },

  // ── Holdings ──
  holdingsGroup: { gap: 12 },
  holdingCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  holdingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(124,111,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickerText: { fontSize: 12, fontWeight: '700', color: '#7C6FFF' },
  holdingTitles: { flex: 1 },
  holdingName: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  holdingSub: { fontSize: 12, color: '#9B9BB4' },
  holdingFigures: { alignItems: 'flex-end' },
  holdingValue: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  holdingPnl: { fontSize: 12 },
  holdingImpactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  holdingImpactText: { flex: 1, fontSize: 12, color: '#9B9BB4' },
  holdingImpactValue: { fontSize: 13, fontWeight: '600', color: '#7C6FFF' },

  // ── Empty ──
  emptyCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginTop: 2 },
  emptyText: { fontSize: 13, color: '#9B9BB4', textAlign: 'center', lineHeight: 19 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C6FFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    height: 44,
    marginTop: 8,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  // ── Error ──
  errorText: { fontSize: 14, color: '#9B9BB4', textAlign: 'center', lineHeight: 20 },
  retryButton: {
    backgroundColor: '#141420',
    borderRadius: 12,
    paddingHorizontal: 20,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  retryText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});