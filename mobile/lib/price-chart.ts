import type { PriceCheck } from '../../types'

/**
 * Pure geometry for components/PriceHistoryChart.tsx, kept out of the
 * component so it can be unit-tested without React Native
 * (lib/__tests__/price-chart.test.mts at the repo root).
 *
 * Mirrors the web chart (components/PriceHistoryChart.tsx, Recharts):
 * checks are evenly spaced by index (a categorical x-axis — two checks on
 * the same day sit side by side rather than on top of each other), cash
 * and miles each get their OWN vertical scale (web: left and right
 * y-axes), and a missing value is skipped with the line joined across it
 * (web: connectNulls).
 */

export type PriceKey = 'cash_price' | 'miles_price'

export interface SeriesPoint {
  index: number
  value: number
}

export interface Series {
  points: SeriesPoint[]
  min: number
  max: number
}

/** The non-null values of one price column, with a drawable min/max. */
export function buildSeries(history: PriceCheck[], key: PriceKey): Series | null {
  const points: SeriesPoint[] = []
  history.forEach((c, index) => {
    const value = c[key]
    if (value !== null && value !== undefined) points.push({ index, value: Number(value) })
  })
  if (points.length === 0) return null

  let min = Math.min(...points.map((p) => p.value))
  let max = Math.max(...points.map((p) => p.value))
  if (max === min) {
    // A flat series has no range to scale by; pad it so the line sits in
    // the middle instead of dividing by zero or hugging an edge.
    const pad = Math.max(Math.abs(max) * 0.05, 1)
    min -= pad
    max += pad
  }
  return { points, min, max }
}

/** Horizontal pixel position of check `index` out of `count`. */
export function xFor(index: number, count: number, left: number, width: number): number {
  if (count <= 1) return left + width / 2
  return left + (index / (count - 1)) * width
}

/** Vertical pixel position of `value` on `series`' own scale (top = max). */
export function yFor(value: number, series: Series, top: number, height: number): number {
  return top + (1 - (value - series.min) / (series.max - series.min)) * height
}

/** Which check a touch at pixel `x` is closest to. */
export function nearestIndex(x: number, count: number, left: number, width: number): number {
  if (count <= 1 || width <= 0) return 0
  const i = Math.round(((x - left) / width) * (count - 1))
  return Math.min(count - 1, Math.max(0, i))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 21", in the phone's local time — no Intl dependency. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** Axis label for cash: "$679", "$3.4k". */
export function cashTick(v: number): string {
  if (Math.abs(v) >= 10000) return `$${trimZero((v / 1000).toFixed(1))}k`
  return `$${Math.round(v)}`
}

/** Axis label for miles: "17.5k", "120k". */
export function milesTick(v: number): string {
  if (Math.abs(v) >= 100000) return `${Math.round(v / 1000)}k`
  if (Math.abs(v) >= 1000) return `${trimZero((v / 1000).toFixed(1))}k`
  return `${Math.round(v)}`
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s
}
