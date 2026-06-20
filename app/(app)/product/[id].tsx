/**
 * app/(app)/product/[id].tsx
 *
 * Phase 3 — Product detail screen.
 *
 * Shows full product information:
 *   - Hero: name, ticker, type, ESG index, latest price
 *   - Price chart (Phase 4): area/line chart with range selector
 *   - SDG alignment: each goal with number, name, and description
 *   - Screening gates: visual breakdown of all three gates
 *   - Key stats: AUM, TER/volatility, max drawdown
 *   - Trade CTA: Buy button → app/(app)/buy/[id] (Phase 4)
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
import { productService, Product } from '../../../services/products';
import { tradingService, PriceRange, PriceBar } from '../../../services/trading';
import { PriceChart, generateMockBars } from '../../../components/PriceChart';

// ─── SDG data ─────────────────────────────────────────────────────────────────

const SDG_DATA: Record<number, { name: string; description: string; colour: string }> = {
  1:  { name: 'No Poverty',                colour: '#E5243B', description: 'End poverty in all its forms everywhere. Companies and funds aligned to SDG 1 support financial inclusion, fair wages, and economic resilience for the world\'s most vulnerable populations.' },
  2:  { name: 'Zero Hunger',               colour: '#DDA63A', description: 'End hunger, achieve food security and improved nutrition, and promote sustainable agriculture. Investments here support sustainable food systems, smallholder farmers, and reducing food waste.' },
  3:  { name: 'Good Health & Wellbeing',   colour: '#4C9F38', description: 'Ensure healthy lives and promote wellbeing for all at all ages. Aligned investments support access to quality healthcare, mental health services, and medical innovation.' },
  4:  { name: 'Quality Education',         colour: '#C5192D', description: 'Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.' },
  5:  { name: 'Gender Equality',           colour: '#FF3A21', description: 'Achieve gender equality and empower all women and girls. Companies aligned to SDG 5 promote equal pay, leadership diversity, and support for women-owned businesses.' },
  6:  { name: 'Clean Water & Sanitation',  colour: '#26BDE2', description: 'Ensure availability and sustainable management of water and sanitation for all.' },
  7:  { name: 'Affordable Clean Energy',   colour: '#FCC30B', description: 'Ensure access to affordable, reliable, sustainable, and modern energy for all. Investments support renewable energy generation, energy efficiency, and the transition away from fossil fuels.' },
  8:  { name: 'Decent Work & Growth',      colour: '#A21942', description: 'Promote sustained, inclusive, and sustainable economic growth, full and productive employment, and decent work for all. Aligned funds screen for fair labour practices and sustainable business models.' },
  9:  { name: 'Industry & Innovation',     colour: '#FD6925', description: 'Build resilient infrastructure, promote inclusive and sustainable industrialisation, and foster innovation. Investments support clean technology, sustainable manufacturing, and digital infrastructure.' },
  10: { name: 'Reduced Inequalities',      colour: '#DD1367', description: 'Reduce inequality within and among countries. Companies aligned to SDG 10 promote fair taxation, inclusive financial services, and equitable access to opportunity.' },
  11: { name: 'Sustainable Cities',        colour: '#FD9D24', description: 'Make cities and human settlements inclusive, safe, resilient, and sustainable. Investments support affordable housing, clean transport, and sustainable urban development.' },
  12: { name: 'Responsible Consumption',   colour: '#BF8B2E', description: 'Ensure sustainable consumption and production patterns. Aligned companies commit to circular economy principles, reduced waste, and sustainable supply chains.' },
  13: { name: 'Climate Action',            colour: '#3F7E44', description: 'Take urgent action to combat climate change and its impacts. This is the most common SDG alignment for ESG funds — investments support net-zero commitments, carbon reduction, and climate resilience.' },
  14: { name: 'Life Below Water',          colour: '#0A97D9', description: 'Conserve and sustainably use the oceans, seas, and marine resources.' },
  15: { name: 'Life on Land',              colour: '#56C02B', description: 'Protect, restore, and promote sustainable use of terrestrial ecosystems.' },
  16: { name: 'Peace & Justice',           colour: '#00689D', description: 'Promote peaceful and inclusive societies, provide access to justice for all.' },
  17: { name: 'Partnerships for Goals',    colour: '#19486A', description: 'Strengthen the means of implementation and revitalise the global partnership for sustainable development.' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatAum = (aum: number | null): string => {
  if (!aum) return '—';
  if (aum >= 1_000_000_000) return `£${(aum / 1_000_000_000).toFixed(1)}bn`;
  if (aum >= 1_000_000) return `£${(aum / 1_000_000).toFixed(0)}m`;
  return `£${aum.toLocaleString()}`;
};

const formatPercent = (val: number | null): string => {
  if (val === null) return '—';
  return `${(val * 100).toFixed(2)}%`;
};

const formatGbpPrice = (n: number | null): string =>
  n == null
    ? '—'
    : `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function GateRow({
  number,
  label,
  description,
  passed,
}: {
  number: string;
  label: string;
  description: string;
  passed: boolean;
}) {
  return (
    <View style={styles.gateRow}>
      <View style={[styles.gateIconWrap, passed ? styles.gateIconPass : styles.gateIconFail]}>
        <Ionicons
          name={passed ? 'checkmark' : 'time-outline'}
          size={14}
          color={passed ? '#34D399' : '#9B9BB4'}
        />
      </View>
      <View style={styles.gateContent}>
        <View style={styles.gateTitle}>
          <Text style={styles.gateNumber}>{number}</Text>
          <Text style={styles.gateLabel}>{label}</Text>
          <View style={[styles.gateBadge, passed ? styles.gateBadgePass : styles.gateBadgePending]}>
            <Text style={[styles.gateBadgeText, passed ? styles.gateBadgeTextPass : styles.gateBadgeTextPending]}>
              {passed ? 'Passed' : 'Pending'}
            </Text>
          </View>
        </View>
        <Text style={styles.gateDescription}>{description}</Text>
      </View>
    </View>
  );
}

function SDGCard({ sdg }: { sdg: number }) {
  const data = SDG_DATA[sdg];
  if (!data) return null;
  return (
    <View style={styles.sdgCard}>
      <View style={styles.sdgCardHeader}>
        <View style={[styles.sdgNumber, { backgroundColor: data.colour }]}>
          <Text style={styles.sdgNumberText}>{sdg}</Text>
        </View>
        <Text style={styles.sdgName}>{data.name}</Text>
      </View>
      <Text style={styles.sdgDescription}>{data.description}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Price chart state
  const [range, setRange] = useState<PriceRange>('1M');
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) throw new Error('No product ID');
        const data = await productService.getProduct(id);
        if (!data) throw new Error('Product not found');
        setProduct(data);
      } catch (err) {
        console.error('[ProductDetail] load error:', err);
        setError('Unable to load product details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Fetch price bars for the chart whenever the product or range changes.
  useEffect(() => {
    if (!product?.ticker) return;
    let active = true;
    setChartLoading(true);
    (async () => {
      let data = await tradingService.getPriceHistory(product.ticker, range);
      // DEV-only mock fallback while the get_bars action isn't deployed and LSE
      // tickers can't be priced on the US endpoint. Remove once real bars flow.
      if (data.length === 0 && __DEV__) {
        data = generateMockBars(product.ticker, range, { annualVol: product.volatility12m });
      }
      if (active) {
        setBars(data);
        setChartLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [product?.ticker, product?.volatility12m, range]);

  const latestClose = bars.length ? bars[bars.length - 1].c : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color="#7C6FFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !product) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.centred}>
          <Ionicons name="alert-circle-outline" size={40} color="#FF6B6B" />
          <Text style={styles.errorText}>{error ?? 'Product not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEtf = product.type === 'ETF';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Product detail</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitles}>
              <Text style={styles.heroName}>{product.name}</Text>
              <View style={styles.heroMeta}>
                <Text style={styles.heroTicker}>{product.ticker}</Text>
                <View style={[styles.typeBadge, isEtf ? styles.typeBadgeEtf : styles.typeBadgeEquity]}>
                  <Text style={[styles.typeBadgeText, isEtf ? styles.typeBadgeTextEtf : styles.typeBadgeTextEquity]}>
                    {isEtf ? 'ETF' : 'Equity'}
                  </Text>
                </View>
              </View>
            </View>
            {/* Latest price (from chart bars) */}
            <View style={styles.priceWrap}>
              {chartLoading && bars.length === 0 ? (
                <ActivityIndicator size="small" color="#7C6FFF" />
              ) : latestClose != null ? (
                <>
                  <Text style={styles.priceValue}>{formatGbpPrice(latestClose)}</Text>
                  <Text style={styles.priceLabel}>Latest price</Text>
                </>
              ) : (
                <>
                  <Text style={styles.pricePlaceholder}>—</Text>
                  <Text style={styles.priceLabel}>Price{'\n'}unavailable</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.esgIndexRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#7C6FFF" />
            <Text style={styles.esgIndexText}>{product.esgIndex}</Text>
          </View>
        </View>

        {/* ── Price chart ── */}
        <SectionHeader title="Price" />
        <View style={styles.chartCard}>
          <PriceChart
            bars={bars}
            loading={chartLoading}
            range={range}
            onRangeChange={setRange}
          />
        </View>

        {/* ── Key stats ── */}
        <SectionHeader title="Key statistics" />
        <View style={styles.statsGrid}>
          <StatCard label="AUM" value={formatAum(product.aumGbp)} />
          {isEtf
            ? <StatCard label="TER" value={formatPercent(product.ter)} sub="Annual charge" />
            : <StatCard label="Volatility" value={formatPercent(product.volatility12m)} sub="12 month" />
          }
          <StatCard
            label="Max drawdown"
            value={formatPercent(product.maxDrawdown12m)}
            sub="12 month"
          />
        </View>

        {/* ── SDG alignment ── */}
        <SectionHeader title="SDG alignment" />
        <View style={styles.infoBox}>
          <Ionicons name="earth-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Every product on Butterfly is mapped to one or more UN Sustainable Development Goals.
            Your trades generate impact wallet funds that you direct to NGO campaigns working on these goals.
          </Text>
        </View>
        <View style={styles.sdgList}>
          {product.sdgTags.map((sdg) => (
            <SDGCard key={sdg} sdg={sdg} />
          ))}
        </View>

        {/* ── Screening gates ── */}
        <SectionHeader title="ESG screening" />
        <View style={styles.infoBox}>
          <Ionicons name="funnel-outline" size={14} color="#9B9BB4" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Every product passes three sequential gates before entering the Butterfly universe.
            Products that fail any gate are removed. Products in the live universe are continuously
            monitored via Gate 3.
          </Text>
        </View>
        <View style={styles.gatesCard}>
          <GateRow
            number="Gate 1"
            label="ESG eligibility"
            passed={product.esgGatePassed}
            description="Qualitative review confirming UCITS compliance, recognised ESG index tracking, documented exclusionary screens (weapons, fossil fuels, tobacco), and mappable SDG alignment."
          />
          <View style={styles.gateDivider} />
          <GateRow
            number="Gate 2"
            label="Price & volatility"
            passed={product.volGatePassed}
            description="Objective quantitative thresholds applied to 12-month market data: volatility ceiling, maximum drawdown limit, and minimum AUM requirement. Re-run monthly for all live products."
          />
          <View style={styles.gateDivider} />
          <GateRow
            number="Gate 3"
            label="AI monitoring"
            passed={product.aiGatePassed}
            description="Continuous AI-powered monitoring scanning for ESG controversies, SDG drift, and material changes in fund holdings. Runs weekly via the Claude API with human-in-the-loop review before any removal."
          />
        </View>

        {/* ── Trade CTA ── */}
        <View style={styles.tradeSection}>
          <TouchableOpacity
            style={styles.buyButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(app)/buy/[id]',
                params: { id: product.productId, name: product.name, ticker: product.ticker },
              })
            }
          >
            <Ionicons name="trending-up" size={18} color="#FFFFFF" />
            <Text style={styles.buyButtonText}>Buy {product.ticker}</Text>
          </TouchableOpacity>
          <Text style={styles.tradeNote}>
            Paper trading via the execution provider. Real LSE tickers may be rejected on
            the US paper endpoint.
          </Text>
        </View>
      </ScrollView>
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
  backButton: { padding: 4 },

  // ── Content ──
  container: { padding: 20, paddingBottom: 60 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: '#9B9BB4', marginTop: 12 },

  // ── Hero ──
  hero: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 24,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  heroTitles: { flex: 1, marginRight: 12 },
  heroName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
    marginBottom: 6,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTicker: { fontSize: 14, fontWeight: '700', color: '#9B9BB4' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  typeBadgeEtf: { backgroundColor: 'rgba(124,111,255,0.15)' },
  typeBadgeEquity: { backgroundColor: 'rgba(52,211,153,0.12)' },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  typeBadgeTextEtf: { color: '#7C6FFF' },
  typeBadgeTextEquity: { color: '#34D399' },
  priceWrap: { alignItems: 'flex-end', minWidth: 70 },
  priceValue: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  pricePlaceholder: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.2)' },
  priceLabel: { fontSize: 10, color: '#3D3D56', textAlign: 'right', marginTop: 2, lineHeight: 14 },
  esgIndexRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  esgIndexText: { fontSize: 12, color: '#9B9BB4' },

  // ── Section header ──
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // ── Price chart ──
  chartCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 28,
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141420',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: '#9B9BB4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  statSub: { fontSize: 10, color: '#3D3D56' },

  // ── Info box ──
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: { flex: 1, fontSize: 12, color: '#9B9BB4', lineHeight: 17 },

  // ── SDG cards ──
  sdgList: { gap: 10, marginBottom: 28 },
  sdgCard: {
    backgroundColor: '#141420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
  },
  sdgCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  sdgNumber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sdgNumberText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  sdgName: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  sdgDescription: { fontSize: 13, color: '#9B9BB4', lineHeight: 20 },

  // ── Gates ──
  gatesCard: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 28,
    overflow: 'hidden',
  },
  gateRow: { flexDirection: 'row', padding: 16, gap: 14, alignItems: 'flex-start' },
  gateDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  gateIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  gateIconPass: { backgroundColor: 'rgba(52,211,153,0.12)' },
  gateIconFail: { backgroundColor: 'rgba(255,255,255,0.06)' },
  gateContent: { flex: 1 },
  gateTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  gateNumber: { fontSize: 11, fontWeight: '700', color: '#9B9BB4', textTransform: 'uppercase', letterSpacing: 0.5 },
  gateLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  gateBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  gateBadgePass: { backgroundColor: 'rgba(52,211,153,0.12)' },
  gateBadgePending: { backgroundColor: 'rgba(255,255,255,0.06)' },
  gateBadgeText: { fontSize: 11, fontWeight: '600' },
  gateBadgeTextPass: { color: '#34D399' },
  gateBadgeTextPending: { color: '#9B9BB4' },
  gateDescription: { fontSize: 13, color: '#9B9BB4', lineHeight: 19 },

  // ── Trade CTA ──
  tradeSection: { gap: 12 },
  buyButton: {
    backgroundColor: '#7C6FFF',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tradeNote: {
    fontSize: 12,
    color: '#3D3D56',
    textAlign: 'center',
    lineHeight: 17,
  },
});