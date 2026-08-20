/**
 * Alert logic — no target price needed.
 *
 * Fires when:
 *   1. Cash OR miles price drops ≥10% from the 7-day rolling average  ("drop_10pct")
 *   2. Cash OR miles price hits a new all-time low for this watch      ("new_low")
 *
 * Only one alert per watch per 24h to avoid spam.
 */

import type { PriceCheck } from '@/types'

export type AlertTrigger = {
  type: 'drop_10pct' | 'new_low'
  cashPrice: number | null
  milesPrice: number | null
  prevCashPrice: number | null
  prevMilesPrice: number | null
}

const DROP_THRESHOLD = 0.10  // 10%

/**
 * Given all historical price checks for a watch (oldest → newest),
 * returns an alert descriptor if the latest check warrants an alert,
 * or null if not.
 */
export function evaluateAlerts(
  history: PriceCheck[]
): AlertTrigger | null {
  if (history.length < 2) return null

  const latest = history[history.length - 1]
  const previous = history.slice(0, -1)

  // ── 7-day rolling average ──────────────────────────────────────────
  const sevenDaysAgo = new Date(latest.checked_at)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const windowChecks = previous.filter(
    (c) => new Date(c.checked_at) >= sevenDaysAgo
  )

  const cashPrices = windowChecks
    .map((c) => c.cash_price)
    .filter((p): p is number => p !== null)

  const milesPrices = windowChecks
    .map((c) => c.miles_price)
    .filter((p): p is number => p !== null)

  const avgCash =
    cashPrices.length > 0
      ? cashPrices.reduce((a, b) => a + b, 0) / cashPrices.length
      : null

  const avgMiles =
    milesPrices.length > 0
      ? milesPrices.reduce((a, b) => a + b, 0) / milesPrices.length
      : null

  // ── All-time low ──────────────────────────────────────────────────
  const allCash = previous
    .map((c) => c.cash_price)
    .filter((p): p is number => p !== null)

  const allMiles = previous
    .map((c) => c.miles_price)
    .filter((p): p is number => p !== null)

  const historicLowCash = allCash.length > 0 ? Math.min(...allCash) : null
  const historicLowMiles = allMiles.length > 0 ? Math.min(...allMiles) : null

  const prevCash = previous[previous.length - 1]?.cash_price ?? null
  const prevMiles = previous[previous.length - 1]?.miles_price ?? null

  // ── Check: new all-time low ────────────────────────────────────────
  const cashIsNewLow =
    latest.cash_price !== null &&
    historicLowCash !== null &&
    latest.cash_price < historicLowCash

  const milesIsNewLow =
    latest.miles_price !== null &&
    historicLowMiles !== null &&
    latest.miles_price < historicLowMiles

  if (cashIsNewLow || milesIsNewLow) {
    return {
      type: 'new_low',
      cashPrice: latest.cash_price,
      milesPrice: latest.miles_price,
      prevCashPrice: prevCash,
      prevMilesPrice: prevMiles,
    }
  }

  // ── Check: ≥10% drop from 7-day average ───────────────────────────
  const cashDropped =
    latest.cash_price !== null &&
    avgCash !== null &&
    (avgCash - latest.cash_price) / avgCash >= DROP_THRESHOLD

  const milesDropped =
    latest.miles_price !== null &&
    avgMiles !== null &&
    (avgMiles - latest.miles_price) / avgMiles >= DROP_THRESHOLD

  if (cashDropped || milesDropped) {
    return {
      type: 'drop_10pct',
      cashPrice: latest.cash_price,
      milesPrice: latest.miles_price,
      prevCashPrice: prevCash,
      prevMilesPrice: prevMiles,
    }
  }

  return null
}

/** Human-readable drop % string */
export function formatDrop(current: number | null, prev: number | null): string {
  if (current === null || prev === null || prev === 0) return ''
  const pct = ((prev - current) / prev) * 100
  return `${Math.round(pct)}%`
}
