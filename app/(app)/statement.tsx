/**
 * app/(app)/statement.tsx
 *
 * Combined account + impact statement — the full history of what you deposited,
 * invested, realised, and raised for good. Reads the `get_statement_data` edge
 * action (a single payload with summary, cash movements, trades, donations).
 *
 * The screen leads with the impact hero (total raised for good) because that's
 * the headline Butterfly wants users to feel every time they open a statement.
 * PDF export is stubbed — it will be wired to expo-print in a later phase.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tradingService, StatementData } from '../../services/trading';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const gbpSigned = (n: number) => `${n >= 0 ? '+' : '−'}${gbp(Math.abs(n))}`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const titleCase = (s: string) =>
  s
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatementScreen() {
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const accountId = await tradingService.getActiveAccountId();
      const s = await tradingService.getStatementData(accountId);
      setData(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your statement.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await load();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Statement</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color="#7C6FFF" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Statement</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color="#9B9BB4" />
          <Text style={styles.errorText}>{error ?? 'No statement data.'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              load().then(() => setLoading(false));
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { summary, trades, donations, cashMovements } = data;
  const pnlPositive = summary.totalRealisedPnl >= 0;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Statement</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Impact hero ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Raised for good</Text>
          <Text style={styles.heroValue}>{gbp(summary.totalDonated)}</Text>
          <View style={styles.heroSubRow}>
            <Ionicons name="heart" size={13} color="#7C6FFF" />
            <Text style={styles.heroSubText}>
              {summary.donationCount} {summary.donationCount === 1 ? 'donation' : 'donations'} across your trades
            </Text>
          </View>
        </View>

        {/* ── Summary grid ── */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Deposited</Text>
            <Text style={styles.statValue}>{gbp(summary.totalDeposited)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invested</Text>
            <Text style={styles.statValue}>{gbp(summary.totalInvested)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Realised P&amp;L</Text>
            <Text
              style={[
                styles.statValue,
                { color: pnlPositive ? '#3FD08A' : '#FF6B6B' },
              ]}
            >
              {gbpSigned(summary.totalRealisedPnl)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Donated</Text>
            <Text style={[styles.statValue, { color: '#7C6FFF' }]}>{gbp(summary.totalDonated)}</Text>
          </View>
        </View>

        {/* ── PDF export (stub) ── */}
        <View style={styles.exportBtn}>
          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
          <Text style={styles.exportBtnText}>Export PDF</Text>
          <Text style={styles.exportBtnBadge}>Coming soon</Text>
        </View>

        {/* ── Activity (trades) ── */}
        <Text style={styles.sectionTitle}>Activity</Text>
        {trades.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="trending-up-outline" size={22} color="#9B9BB4" />
            <Text style={styles.emptyText}>No trades yet.</Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {trades.map((t, i) => {
              const isSell = t.side === 'sell';
              const pnlPos = (t.pnlGbp ?? 0) >= 0;
              return (
                <View key={`t-${i}`} style={styles.tradeCard}>
                  <View style={styles.tradeHeader}>
                    <View
                      style={[
                        styles.sideBadge,
                        isSell ? styles.sideBadgeSell : styles.sideBadgeBuy,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sideBadgeText,
                          isSell ? styles.sideBadgeTextSell : styles.sideBadgeTextBuy,
                        ]}
                      >
                        {isSell ? 'SELL' : 'BUY'}
                      </Text>
                    </View>
                    <View style={styles.tradeTitles}>
                      <Text style={styles.tradeTicker} numberOfLines={1}>
                        {t.ticker ?? '—'}
                        {t.name ? <Text style={styles.tradeName}>  ·  {t.name}</Text> : null}
                      </Text>
                      <Text style={styles.tradeSub}>{formatDate(t.date)}</Text>
                    </View>
                    <View style={styles.tradeFigures}>
                      <Text style={styles.tradeNotional}>
                        {t.notionalGbp != null ? gbp(t.notionalGbp) : '—'}
                      </Text>
                      <Text style={styles.tradeSub}>
                        {t.quantity} × {t.fillPrice != null ? gbp(t.fillPrice) : '—'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tradeMetaRow}>
                    <Text style={styles.tradeMetaLabel}>Commission</Text>
                    <Text style={styles.tradeMetaValue}>
                      {t.commissionGbp != null ? gbp(t.commissionGbp) : '—'}
                    </Text>
                  </View>

                  {isSell && t.pnlGbp != null && (
                    <View style={styles.tradeMetaRow}>
                      <Text style={styles.tradeMetaLabel}>Realised P&amp;L</Text>
                      <Text
                        style={[
                          styles.tradeMetaValue,
                          { color: pnlPos ? '#3FD08A' : '#FF6B6B' },
                        ]}
                      >
                        {gbpSigned(t.pnlGbp)}
                      </Text>
                    </View>
                  )}

                  {isSell && t.donation && (
                    <View style={styles.tradeImpact}>
                      <Ionicons name="heart" size={12} color="#7C6FFF" />
                      <Text style={styles.tradeImpactText}>
                        Generated {gbp(t.donation.amountGbp)} for good ({t.donation.trigger})
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Donations (your impact) ── */}
        <Text style={styles.sectionTitle}>Your impact</Text>
        {donations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="heart-outline" size={22} color="#9B9BB4" />
            <Text style={styles.emptyText}>No donations yet. Close a position to raise funds.</Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {donations.map((d, i) => (
              <View key={`d-${i}`} style={styles.donationRow}>
                <View style={styles.donationMain}>
                  <Text style={styles.donationAmount}>{gbp(d.amountGbp)}</Text>
                  <Text style={styles.donationSub}>
                    {d.ticker ? `${d.ticker}  ·  ` : ''}
                    {titleCase(d.trigger)}  ·  {formatDate(d.date)}
                  </Text>
                </View>
                <Text style={styles.donationCause}>Cause: pending</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Cash movements ── */}
        <Text style={styles.sectionTitle}>Cash activity</Text>
        {cashMovements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="swap-vertical-outline" size={22} color="#9B9BB4" />
            <Text style={styles.emptyText}>No cash movements yet.</Text>
          </View>
        ) : (
          <View style={styles.cashList}>
            {cashMovements.map((m, i) => {
              const pos = m.amountGbp >= 0;
              return (
                <View key={`c-${i}`} style={styles.cashRow}>
                  <View style={styles.cashMain}>
                    <Text style={styles.cashKind}>{titleCase(m.kind)}</Text>
                    <Text style={styles.cashDate}>{formatDate(m.date)}</Text>
                  </View>
                  <View style={styles.cashFigures}>
                    <Text
                      style={[
                        styles.cashAmount,
                        { color: pos ? '#3FD08A' : '#FF6B6B' },
                      ]}
                    >
                      {gbpSigned(m.amountGbp)}
                    </Text>
                    <Text style={styles.cashBalance}>Bal {gbp(m.balanceAfterGbp)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.footerNote}>
          Generated {formatDate(data.generatedAt)} · Demo paper account
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  container: { padding: 20, paddingBottom: 48 },

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

  // ── Impact hero ──
  heroCard: {
    backgroundColor: '#141420',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(124,111,255,0.25)',
    marginBottom: 20,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 12,
    color: '#9B9BB4',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    color: '#7C6FFF',
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  heroSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroSubText: { fontSize: 13, color: '#C4C4D4' },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: '#141420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  statLabel: { fontSize: 11, color: '#9B9BB4', marginBottom: 6, letterSpacing: 0.2 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },

  // ── Export PDF (disabled stub) ──
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 50,
    marginBottom: 28,
    opacity: 0.4,
  },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  exportBtnBadge: {
    fontSize: 11,
    color: '#FFFFFF',
    opacity: 0.85,
    marginLeft: 4,
    fontWeight: '600',
  },

  // ── Section ──
  sectionTitle: {
    fontSize: 13,
    color: '#9B9BB4',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.2,
    fontWeight: '600',
  },

  // ── Trades ──
  groupedList: { gap: 10, marginBottom: 24 },
  tradeCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tradeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sideBadgeBuy: { backgroundColor: 'rgba(124,111,255,0.14)' },
  sideBadgeSell: { backgroundColor: 'rgba(63,208,138,0.14)' },
  sideBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  sideBadgeTextBuy: { color: '#7C6FFF' },
  sideBadgeTextSell: { color: '#3FD08A' },
  tradeTitles: { flex: 1 },
  tradeTicker: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  tradeName: { fontSize: 12, color: '#9B9BB4', fontWeight: '400' },
  tradeSub: { fontSize: 11, color: '#9B9BB4', marginTop: 2 },
  tradeFigures: { alignItems: 'flex-end' },
  tradeNotional: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  tradeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tradeMetaLabel: { fontSize: 12, color: '#9B9BB4' },
  tradeMetaValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },

  tradeImpact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(124,111,255,0.10)',
  },
  tradeImpactText: { fontSize: 12, color: '#7C6FFF', fontWeight: '600' },

  // ── Donations ──
  donationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  donationMain: { flex: 1 },
  donationAmount: { fontSize: 15, fontWeight: '700', color: '#7C6FFF', marginBottom: 2 },
  donationSub: { fontSize: 12, color: '#9B9BB4' },
  donationCause: { fontSize: 11, color: '#3D3D56', fontStyle: 'italic' },

  // ── Cash list ──
  cashList: { gap: 8, marginBottom: 20 },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cashMain: { flex: 1 },
  cashKind: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  cashDate: { fontSize: 11, color: '#9B9BB4', marginTop: 2 },
  cashFigures: { alignItems: 'flex-end' },
  cashAmount: { fontSize: 14, fontWeight: '700' },
  cashBalance: { fontSize: 11, color: '#9B9BB4', marginTop: 2 },

  // ── Empty / misc ──
  emptyCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  emptyText: { fontSize: 13, color: '#9B9BB4', textAlign: 'center' },

  footerNote: {
    fontSize: 11,
    color: '#3D3D56',
    textAlign: 'center',
    marginTop: 8,
  },

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
