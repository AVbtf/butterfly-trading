/**
 * app/(app)/products.tsx
 *
 * Phase 3 — Product list screen.
 *
 * Displays all active ESG-screened products from the Butterfly universe.
 * Each card shows: name, ticker, type badge, SDG tags, AUM, TER/volatility.
 *
 * Tapping a card navigates to /(app)/product/[id] (detail screen).
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productService, Product } from '../../services/products';

// ─── SDG label map ────────────────────────────────────────────────────────────

const SDG_LABELS: Record<number, string> = {
  1: 'No Poverty',
  2: 'Zero Hunger',
  3: 'Good Health',
  7: 'Clean Energy',
  8: 'Decent Work',
  9: 'Innovation',
  10: 'Reduced Inequalities',
  11: 'Sustainable Cities',
  12: 'Responsible Consumption',
  13: 'Climate Action',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatAum = (aum: number | null): string => {
  if (!aum) return '—';
  if (aum >= 1_000_000_000) return `£${(aum / 1_000_000_000).toFixed(1)}bn`;
  if (aum >= 1_000_000) return `£${(aum / 1_000_000).toFixed(0)}m`;
  return `£${aum.toLocaleString()}`;
};

const formatTer = (ter: number | null): string => {
  if (ter === null) return '—';
  return `${(ter * 100).toFixed(2)}%`;
};

const formatVolatility = (vol: number | null): string => {
  if (vol === null) return '—';
  return `${(vol * 100).toFixed(1)}%`;
};

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const isEtf = product.type === 'ETF';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/product/${product.productId}`)}
      activeOpacity={0.8}
    >
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={2}>{product.name}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardTicker}>{product.ticker}</Text>
            <View style={[styles.typeBadge, isEtf ? styles.typeBadgeEtf : styles.typeBadgeEquity]}>
              <Text style={[styles.typeBadgeText, isEtf ? styles.typeBadgeTextEtf : styles.typeBadgeTextEquity]}>
                {isEtf ? 'ETF' : 'Equity'}
              </Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#3D3D56" />
      </View>

      {/* ESG index */}
      <Text style={styles.esgIndex} numberOfLines={1}>{product.esgIndex}</Text>

      {/* SDG tags */}
      <View style={styles.sdgRow}>
        {product.sdgTags.slice(0, 3).map((sdg) => (
          <View key={sdg} style={styles.sdgTag}>
            <Text style={styles.sdgTagText}>SDG {sdg}</Text>
            {SDG_LABELS[sdg] && (
              <Text style={styles.sdgTagLabel}> · {SDG_LABELS[sdg]}</Text>
            )}
          </View>
        ))}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>AUM</Text>
          <Text style={styles.statValue}>{formatAum(product.aumGbp)}</Text>
        </View>
        <View style={styles.statDivider} />
        {isEtf ? (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>TER</Text>
            <Text style={styles.statValue}>{formatTer(product.ter)}</Text>
          </View>
        ) : (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Volatility</Text>
            <Text style={styles.statValue}>{formatVolatility(product.volatility12m)}</Text>
          </View>
        )}
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Gate</Text>
          <View style={styles.gateRow}>
            <View style={[styles.gateDot, product.esgGatePassed && styles.gateDotPass]} />
            <View style={[styles.gateDot, product.volGatePassed && styles.gateDotPass]} />
            <View style={[styles.gateDot, product.aiGatePassed && styles.gateDotPass]} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Filter tab ───────────────────────────────────────────────────────────────

type Filter = 'all' | 'ETF' | 'equity';

function FilterTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterTab, active && styles.filterTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await productService.getProducts();
      setProducts(data);
    } catch (err) {
      console.error('[ProductsScreen] load error:', err);
      setError('Unable to load products. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all'
    ? products
    : products.filter((p) => p.type === filter);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Investments</Text>
          <Text style={styles.subtitle}>
            {products.length} ESG-screened products
          </Text>
        </View>
        <View style={styles.headerIconWrap}>
          <Ionicons name="leaf" size={20} color="#7C6FFF" />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <FilterTab label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterTab label="ETFs" active={filter === 'ETF'} onPress={() => setFilter('ETF')} />
        <FilterTab label="Equities" active={filter === 'equity'} onPress={() => setFilter('equity')} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color="#7C6FFF" />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Ionicons name="alert-circle-outline" size={40} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} activeOpacity={0.7}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.productId}
          renderItem={({ item }) => <ProductCard product={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#7C6FFF"
            />
          }
          ListEmptyComponent={
            <View style={styles.centred}>
              <Text style={styles.emptyText}>No products found.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  subtitle: { fontSize: 13, color: '#9B9BB4' },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(124,111,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filter tabs ──
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(124,111,255,0.15)',
    borderColor: '#7C6FFF',
  },
  filterTabText: { fontSize: 13, color: '#9B9BB4', fontWeight: '500' },
  filterTabTextActive: { color: '#7C6FFF', fontWeight: '600' },

  // ── List ──
  list: { paddingHorizontal: 20, paddingBottom: 40 },

  // ── Card ──
  card: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleWrap: { flex: 1, marginRight: 8 },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 5,
    lineHeight: 20,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTicker: { fontSize: 13, color: '#9B9BB4', fontWeight: '600' },

  // ── Type badge ──
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeEtf: { backgroundColor: 'rgba(124,111,255,0.15)' },
  typeBadgeEquity: { backgroundColor: 'rgba(52,211,153,0.12)' },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  typeBadgeTextEtf: { color: '#7C6FFF' },
  typeBadgeTextEquity: { color: '#34D399' },

  // ── ESG index ──
  esgIndex: {
    fontSize: 12,
    color: '#9B9BB4',
    marginBottom: 12,
  },

  // ── SDG tags ──
  sdgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  sdgTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sdgTagText: { fontSize: 11, color: '#7C6FFF', fontWeight: '700' },
  sdgTagLabel: { fontSize: 11, color: '#9B9BB4' },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#9B9BB4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  statValue: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.06)' },

  // ── Gate dots ──
  gateRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  gateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  gateDotPass: { backgroundColor: '#34D399' },

  // ── States ──
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  errorText: { fontSize: 14, color: '#9B9BB4', marginTop: 12, textAlign: 'center' },
  retryText: { fontSize: 14, color: '#7C6FFF', marginTop: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#9B9BB4' },
});