/**
 * Alert logic — no target price needed.
 *
 * Fires when:
 *   1. Cash OR miles price drops ≥10% from the 7-day rolling average  ("drop_10pct")
 *   2. Cash OR miles price hits a new all-time low for this watch      ("new_low")
 *
 * Only one alert per watch per 24h to avoid spam (throttled by the caller).
 *
 * ── Why the noise guards below exist ──────────────────────────────────────
 * Naively, "new all-time low" means "cheaper than every previous check". With
 * two checks on record that degrades to "cheaper than the one other time we
 * looked", so a $2 dip on a $609 fare fires "🏆 New all-time low!". The 7-day
 * rolling average has the same failure: early on it averages a single data
 * point, so "10% below the 7-day average" really means "10% below yesterday".
 *
 * On a daily cron that noisy window lasts about a week — exactly the period
 * right after email alerts get switched on. Hence two guards:
 *
 *   MIN_CHECKS      — evaluate nothing until there is enough history
 *   NEW_LOW_MARGIN  — a new low must beat the old low by a real margin
 *   MIN_WINDOW      — the rolling average needs enough points to be an average
 *
 * All three are tunable by env var so they can be relaxed without a deploy.
 */

import type { PriceCheck } from '@/types'

export type AlertTrigger = {
  type: 'drop_10pct' | 'new_low'
  cashPrice: number | null
  milesPrice: number | null
  prevCashPrice: number | null
  prevMilesPrice: number | null
}

/** Latest must be this far below the 7-day average to count as a drop. */
const DROP_THRESHOLD = 0.10 // 10%

/** Minimum total checks before any alert can fire. */
const MIN_CHECKS = Math.max(2, parseInt(process.env.ALERT_MIN_CHECKS ?? '5', 10))

/** A new low must beat the previous low by at least this fraction. */
const NEW_LOW_MARGIN = Math.max(
  0,
  parseFloat(process.env.ALERT_NEW_LOW_MARGIN ?? '0.02') // 2%
)

/** Minimum data points inside the 7-day window for the average to mean anything. */
const MIN_WINDOW = Math.max(1, parseInt(process.env.ALERT_MIN_WINDOW ?? '3', 10))

/**
 * Given all historical price checks for a watch (oldest → newest),
 * returns an alert descriptor if the latest check warrants an alert,
 * or null if not.
 */
export function evaluateAlerts(history: PriceCheck[]): AlertTrigger | null {
  // Not enough history for "all-time" or "average" to mean anything yet.
  if (history.length < MIN_CHECKS) return null

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

  // An "average" of one or two points is just yesterday's price wearing a hat.
  const avgCash =
    cashPrices.length >= MIN_WINDOW
      ? cashPrices.reduce((a, b) => a + b, 0) / cashPrices.length
      : null

  const avgMiles =
    milesPrices.length >= MIN_WINDOW
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

  // ── Check: new all-time low, by a margin that is worth an email ────
  const beatsLow = (latestPrice: number | null, low: number | null): boolean =>
    latestPrice !== null &&
    low !== null &&
    latestPrice < low * (1 - NEW_LOW_MARGIN)

  if (
    beatsLow(latest.cash_price, historicLowCash) ||
    beatsLow(latest.miles_price, historicLowMiles)
  ) {
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
