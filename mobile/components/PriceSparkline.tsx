import { useState } from 'react'
import { View, Text, type LayoutChangeEvent } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import type { PriceCheck } from '../../types'

/**
 * Mobile equivalent of components/PriceSparkline.tsx (web), which uses
 * Recharts — a DOM library, unusable in React Native. Same data shape
 * (`price_history`, from lib/watches.ts, shared with web), same minimal
 * look (bare line, no axes, no dots), no tooltip — RN has no hover, and a
 * press-driven tooltip is more chrome than a dashboard-card sparkline
 * warrants.
 *
 * react-native-svg has no percentage-width layout trick that behaves like
 * Recharts' ResponsiveContainer, so width is measured via onLayout and the
 * polyline is built in real pixel coordinates once known — the standard RN
 * approach (react-native-svg-charts and victory-native both do this).
 */

interface Props {
  history: PriceCheck[]
  type: 'cash' | 'miles'
  color?: string
}

const HEIGHT = 40
const VERTICAL_PADDING = 4

export default function PriceSparkline({ history, type, color }: Props) {
  const [width, setWidth] = useState(0)

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width)
  }

  const values = history
    .map((c) => (type === 'cash' ? c.cash_price : c.miles_price))
    .filter((v): v is number => v !== null)

  if (values.length < 2) {
    return (
      <View style={{ height: HEIGHT, justifyContent: 'center' }} onLayout={onLayout}>
        <Text style={{ fontSize: 11, color: '#94a3b8' }}>Not enough data yet</Text>
      </View>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1 // flat line — avoid divide-by-zero, not a real spread
  const lineColor = color ?? (type === 'cash' ? '#0060ac' : '#00a551')

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y =
        VERTICAL_PADDING +
        (1 - (v - min) / range) * (HEIGHT - VERTICAL_PADDING * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <View style={{ height: HEIGHT }} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </View>
  )
}
