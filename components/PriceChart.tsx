 /**
 * components/PriceChart.tsx
 *
 * Phase 4 — product price chart.
 *
 * Presentational area+line chart drawn with react-native-svg, styled to the
 * Phase 3 tokens. Controlled: the parent owns `range` + `bars` and refetches
 * on range change. Renders loading / empty / unavailable states.
 *
 * Bars arrive live from the `get_bars` edge action, already normalised to GBP.
 *
 * Install dependency:  npx expo install react-native-svg
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { PriceBar, PriceRange } from '../services/trading';

const RANGES: PriceRange[] = ['1W', '1M', '3M', '1Y'];
const CHART_HEIGHT = 160;
const PAD_Y = 12;

const UP = '#34D399';
const DOWN = '#FF6B6B';
const ACCENT = '#7C6FFF';

// Currency: bars arrive already normalised to GBP by the edge function
// (USD→£ via USD_PER_GBP inside get_bars / get_latest_bar). This component
// only ever sees pounds. TODO(fx): static rate → live feed post-investment.
const formatGbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Component ────────────────────────────────────────────────────────────────

export function PriceChart({
  bars,
  loading,
  range,
  onRangeChange,
}: {
  bars: PriceBar[];
  loading: boolean;
  range: PriceRange;
  onRangeChange: (r: PriceRange) => void;
}) {
  const [width, setWidth] = useState(0);

  const closes = bars.map((b) => b.c);
  const hasData = closes.length > 1;

  const first = hasData ? closes[0] : 0;
  const last = hasData ? closes[closes.length - 1] : 0;
  const change = last - first;
  const pct = first !== 0 ? (change / first) * 100 : 0;
  const up = change >= 0;
  const lineColor = up ? UP : DOWN;

  // Build the SVG paths once we have a measured width.
  let linePath = '';
  let areaPath = '';
  if (hasData && width > 0) {
    const n = closes.length;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const usableH = CHART_HEIGHT - PAD_Y * 2;
    const x = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
    const y = (c: number) => PAD_Y + (1 - (c - min) / span) * usableH;
    linePath = closes
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(c).toFixed(2)}`)
      .join(' ');
    areaPath = `${linePath} L ${x(n - 1).toFixed(2)} ${CHART_HEIGHT} L ${x(0).toFixed(2)} ${CHART_HEIGHT} Z`;
  }

  return (
    <View>
      {/* Latest + change */}
      <View style={styles.header}>
        {hasData ? (
          <View>
            <Text style={styles.price}>{formatGbp(last)}</Text>
            <View style={styles.changeRow}>
              <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={13} color={lineColor} />
              <Text style={[styles.change, { color: lineColor }]}>
                {formatGbp(Math.abs(change))} ({up ? '+' : '−'}
                {Math.abs(pct).toFixed(2)}%)
              </Text>
              <Text style={styles.changeRange}> · {range}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.price}>—</Text>
        )}
      </View>

      {/* Chart */}
      <View
        style={styles.chartArea}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {loading ? (
          <ActivityIndicator size="small" color={ACCENT} />
        ) : hasData && width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.22} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#priceFill)" />
            <Path
              d={linePath}
              stroke={lineColor}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        ) : (
          <Text style={styles.emptyText}>
            Price history isn't available for this ticker yet.
          </Text>
        )}
      </View>

      {/* Range selector */}
      <View style={styles.ranges}>
        {RANGES.map((r) => {
          const active = r === range;
          return (
            <TouchableOpacity
              key={r}
              style={[styles.rangeTab, active && styles.rangeTabActive]}
              onPress={() => onRangeChange(r)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  price: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  change: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  changeRange: { fontSize: 13, color: '#9B9BB4', fontWeight: '500' },

  chartArea: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, color: '#9B9BB4', textAlign: 'center', paddingHorizontal: 20 },

  ranges: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rangeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  rangeTabActive: { backgroundColor: 'rgba(124,111,255,0.15)', borderColor: ACCENT },
  rangeText: { fontSize: 13, color: '#9B9BB4', fontWeight: '600' },
  rangeTextActive: { color: ACCENT },
});
