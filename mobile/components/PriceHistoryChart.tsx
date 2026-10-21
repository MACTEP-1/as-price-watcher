import { useState } from 'react'
import { View, Text, StyleSheet, type LayoutChangeEvent, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import type { PriceCheck } from '../../types'
import { formatCash, formatMiles } from '../../lib/format'
import {
  buildSeries,
  cashTick,
  milesTick,
  nearestIndex,
  shortDate,
  xFor,
  yFor,
  type Series,
} from '../lib/price-chart'

/**
 * Mobile equivalent of components/PriceHistoryChart.tsx (web, Recharts —
 * a DOM library, unusable in React Native). Same content: cash on its own
 * scale (left labels, blue) and miles on its own scale (right labels,
 * green), checks evenly spaced oldest → newest, gaps joined. Geometry lives
 * in lib/price-chart.ts so it can be tested without RN.
 *
 * Web shows values in a hover tooltip; phones have no hover, so a readout
 * row above the chart shows one check — the latest by default, or whichever
 * one you touch (drag along the chart to scrub). The touch handler gives
 * way to the surrounding ScrollView on a vertical swipe, so the chart
 * doesn't trap scrolling.
 *
 * Width is measured with onLayout, the same approach as PriceSparkline.
 */

interface Props {
  history: PriceCheck[] // oldest → newest, as getWatchDetail returns it
}

const HEIGHT = 190
const TOP = 10
const BOTTOM = 22 // room for the date labels
const CASH_GUTTER = 46
const MILES_GUTTER = 42
const CASH_COLOR = '#0060ac'
const MILES_COLOR = '#00a551'
const GRID_COLOR = '#e2e8f0'
const LABEL_COLOR = '#94a3b8'

export default function PriceHistoryChart({ history }: Props) {
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)

  const cash = buildSeries(history, 'cash_price')
  const miles = buildSeries(history, 'miles_price')

  if (!cash && !miles) {
    return (
      <Text style={styles.empty}>
        No price history yet — check back after the next daily check.
      </Text>
    )
  }

  const n = history.length
  const left = cash ? CASH_GUTTER : 8
  const right = miles ? MILES_GUTTER : 8
  const plotW = Math.max(0, width - left - right)
  const plotH = HEIGHT - TOP - BOTTOM
  const active = selected ?? n - 1
  const activeCheck = history[active]

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width)
  }
  function pick(e: GestureResponderEvent) {
    setSelected(nearestIndex(e.nativeEvent.locationX, n, left, plotW))
  }

  const gridValues = [0, 0.5, 1] // fractions of the plot height, top → bottom
  const dateLabels =
    n >= 5
      ? [0, Math.floor((n - 1) / 2), n - 1]
      : n >= 2
        ? [0, n - 1]
        : [0]

  function polyline(series: Series): string {
    return series.points
      .map((p) => `${xFor(p.index, n, left, plotW)},${yFor(p.value, series, TOP, plotH)}`)
      .join(' ')
  }
  function valueAt(series: Series | null, i: number): number | null {
    return series?.points.find((p) => p.index === i)?.value ?? null
  }

  const activeX = xFor(active, n, left, plotW)
  const activeCash = valueAt(cash, active)
  const activeMiles = valueAt(miles, active)

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutDate}>
          {activeCheck ? shortDate(activeCheck.checked_at) : ''}
          {selected === null ? ' · latest' : ''}
        </Text>
        {cash && (
          <Text style={[styles.readoutValue, { color: CASH_COLOR }]}>
            {formatCash(activeCash)}
          </Text>
        )}
        {miles && (
          <Text style={[styles.readoutValue, { color: MILES_COLOR }]}>
            {formatMiles(activeMiles)}
          </Text>
        )}
      </View>

      <View
        style={{ height: HEIGHT }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {gridValues.map((f) => {
              const y = TOP + f * plotH
              return (
                <Line
                  key={`g${f}`}
                  x1={left}
                  x2={left + plotW}
                  y1={y}
                  y2={y}
                  stroke={GRID_COLOR}
                  strokeDasharray="3 3"
                />
              )
            })}

            {cash &&
              gridValues.map((f) => (
                <SvgText
                  key={`c${f}`}
                  x={left - 6}
                  y={TOP + f * plotH + 3}
                  fontSize={10}
                  fill={LABEL_COLOR}
                  textAnchor="end"
                >
                  {cashTick(cash.max - f * (cash.max - cash.min))}
                </SvgText>
              ))}

            {miles &&
              gridValues.map((f) => (
                <SvgText
                  key={`m${f}`}
                  x={left + plotW + 6}
                  y={TOP + f * plotH + 3}
                  fontSize={10}
                  fill={LABEL_COLOR}
                  textAnchor="start"
                >
                  {milesTick(miles.max - f * (miles.max - miles.min))}
                </SvgText>
              ))}

            {dateLabels.map((i, k) => (
              <SvgText
                key={`d${i}`}
                x={xFor(i, n, left, plotW)}
                y={HEIGHT - 6}
                fontSize={10}
                fill={LABEL_COLOR}
                textAnchor={
                  dateLabels.length === 1 ? 'middle' : k === 0 ? 'start' : k === dateLabels.length - 1 ? 'end' : 'middle'
                }
              >
                {shortDate(history[i].checked_at)}
              </SvgText>
            ))}

            <Line
              x1={activeX}
              x2={activeX}
              y1={TOP}
              y2={TOP + plotH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />

            {cash && cash.points.length > 1 && (
              <Polyline
                points={polyline(cash)}
                fill="none"
                stroke={CASH_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {miles && miles.points.length > 1 && (
              <Polyline
                points={polyline(miles)}
                fill="none"
                stroke={MILES_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {cash && activeCash !== null && (
              <Circle
                cx={activeX}
                cy={yFor(activeCash, cash, TOP, plotH)}
                r={4}
                fill="#fff"
                stroke={CASH_COLOR}
                strokeWidth={2}
              />
            )}
            {miles && activeMiles !== null && (
              <Circle
                cx={activeX}
                cy={yFor(activeMiles, miles, TOP, plotH)}
                r={4}
                fill="#fff"
                stroke={MILES_COLOR}
                strokeWidth={2}
              />
            )}
          </Svg>
        )}
      </View>

      <View style={styles.legend}>
        {cash && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CASH_COLOR }]} />
            <Text style={styles.legendText}>Cash</Text>
          </View>
        )}
        {miles && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: MILES_COLOR }]} />
            <Text style={styles.legendText}>Miles</Text>
          </View>
        )}
        <Text style={styles.hint}>Touch the chart to see a day</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, color: LABEL_COLOR, textAlign: 'center', paddingVertical: 32 },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  readoutDate: { fontSize: 12, color: '#64748b', flexShrink: 1 },
  readoutValue: { fontSize: 15, fontWeight: '700' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#64748b' },
  hint: { fontSize: 11, color: LABEL_COLOR, marginLeft: 'auto' },
})
