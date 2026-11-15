/**
 * app/(app)/admin.tsx
 *
 * Dev-only cross-account admin screen. Reads the `get_admin_overview` edge
 * action (service-role, bypasses RLS) to show every account, order and open
 * position in the system in one place — used for sanity checks during build.
 *
 * TODO: gate behind an admin role before production.
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
import { tradingService, AdminOverview } from '../../services/trading';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const gbpSigned = (n: number) => `${n >= 0 ? '+' : '−'}${gbp(Math.abs(n))}`;

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const shortId = (id: string) => (id.length > 8 ? id.slice(0, 8) + '…' : id);

const statusColor = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'filled') return '#3FD08A';
  if (s === 'cancelled' || s === 'canceled' || s === 'failed' || s === 'rejected') return '#FF6B6B';
  return '#FFB020';
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const o = await tradingService.getAdminOverview();
      setData(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin overview.');
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
          <Text style={styles.navTitle}>Admin</Text>
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
          <Text style={styles.navTitle}>Admin</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color="#9B9BB4" />
          <Text style={styles.errorText}>{error ?? 'No admin data.'}</Text>
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

  const { summary, accounts, orders, positions } = data;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Admin</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Dev banner ── */}
        <View style={styles.devBanner}>
          <Ionicons name="construct-outline" size={14} color="#FFB020" />
          <Text style={styles.devBannerText}>Dev admin — not for production</Text>
        </View>

        {/* ── Summary grid ── */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Accounts</Text>
            <Text style={styles.statValue}>{summary.accountCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Orders</Text>
            <Text style={styles.statValue}>{summary.orderCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Positions</Text>
            <Text style={styles.statValue}>{summary.positionCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total donated</Text>
            <Text style={[styles.statValue, { color: '#7C6FFF' }]}>{gbp(summary.totalDonated)}</Text>
          </View>
        </View>

        {/* ── Accounts ── */}
        <Text style={styles.sectionTitle}>Accounts</Text>
        {accounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No accounts.</Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {accounts.map((a) => (
              <View key={a.accountId} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{shortId(a.accountId)}</Text>
                  <Text style={styles.rowSub}>
                    {a.type}  ·  {a.status}
                  </Text>
                </View>
                <Text style={styles.rowValue}>{gbp(a.cashBalance)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Orders ── */}
        <Text style={styles.sectionTitle}>Orders</Text>
        {orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No orders.</Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {orders.map((o) => {
              const c = statusColor(o.status);
              const isSell = o.side === 'sell';
              const pnlPos = (o.pnlGbp ?? 0) >= 0;
              return (
                <View key={o.orderId} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${c}22`, borderColor: `${c}66` },
                      ]}
                    >
                      <Text style={[styles.statusBadgeText, { color: c }]}>
                        {o.status.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.orderTitles}>
                      <Text style={styles.orderTicker} numberOfLines={1}>
                        {o.side.toUpperCase()}  ·  {o.ticker ?? '—'}
                      </Text>
                      <Text style={styles.orderSub}>
                        acct {shortId(o.accountId)}  ·  {formatDate(o.date)}
                      </Text>
                    </View>
                    <View style={styles.orderFigures}>
                      <Text style={styles.orderNotional}>
                        {o.notionalGbp != null ? gbp(o.notionalGbp) : '—'}
                      </Text>
                      <Text style={styles.orderSub}>
                        {o.quantity} × {o.fillPrice != null ? gbp(o.fillPrice) : '—'}
                      </Text>
                    </View>
                  </View>
                  {isSell && o.pnlGbp != null && (
                    <View style={styles.orderPnlRow}>
                      <Text style={styles.orderPnlLabel}>Realised P&amp;L</Text>
                      <Text
                        style={[
                          styles.orderPnlValue,
                          { color: pnlPos ? '#3FD08A' : '#FF6B6B' },
                        ]}
                      >
                        {gbpSigned(o.pnlGbp)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Positions ── */}
        <Text style={styles.sectionTitle}>Positions</Text>
        {positions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No open positions.</Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {positions.map((p) => (
              <View key={p.positionId} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{p.ticker ?? '—'}</Text>
                  <Text style={styles.rowSub}>
                    acct {shortId(p.accountId)}  ·  {p.quantity} × avg {gbp(p.avgCostGbp)}
                  </Text>
                </View>
                <Text style={styles.rowValue}>
                  {p.currentValueGbp != null ? gbp(p.currentValueGbp) : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footerNote}>
          Generated {formatDate(data.generatedAt)}
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

  // ── Dev banner ──
  devBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,176,32,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.25)',
    marginBottom: 20,
  },
  devBannerText: { fontSize: 12, fontWeight: '600', color: '#FFB020' },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
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

  // ── Section ──
  sectionTitle: {
    fontSize: 13,
    color: '#9B9BB4',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.2,
    fontWeight: '600',
  },

  // ── Grouped list (accounts, positions) ──
  groupedList: { gap: 10, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  rowSub: { fontSize: 11, color: '#9B9BB4', marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  // ── Orders ──
  orderCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  orderTitles: { flex: 1 },
  orderTicker: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  orderSub: { fontSize: 11, color: '#9B9BB4', marginTop: 2 },
  orderFigures: { alignItems: 'flex-end' },
  orderNotional: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  orderPnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  orderPnlLabel: { fontSize: 12, color: '#9B9BB4' },
  orderPnlValue: { fontSize: 13, fontWeight: '700' },

  // ── Empty / misc ──
  emptyCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
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
