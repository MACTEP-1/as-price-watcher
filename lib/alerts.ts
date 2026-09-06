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
  // The single most recent prior check — informational only. NOT what
  // decided this alert (see baselineCashPrice/baselineMilesPrice below) and
  // can disagree with it in sign: a price can be down against the week's
  // average while up against yesterday specifically.
  prevCashPrice: number | null
  prevMilesPrice: number | null
  // The value actually compared against to fire this alert: the 7-day
  // rolling average for 'drop_10pct', the previous all-time low for
  // 'new_low'. Always on the correct side of `cashPrice`/`milesPrice` for
  // this alert's `type` by construction (that's what made it fire) — unlike
  // prevCashPrice/prevMilesPrice, which is a different, unrelated value that
  // once produced a real "📉 Price dropped -5%" email for a price that had
  // actually risen 5% versus the day before, because the alert had fired
  // against a much higher 7-day average instead. Use these for any
  // "dropped by X%" or "was $Y" language, never prevCashPrice/prevMilesPrice.
  baselineCashPrice: number | null
  baselineMilesPrice: number | null
  // Which metric(s) actually crossed this alert's threshold — so a caller
  // can report the real reason instead of guessing from whichever of
  // cash/miles happens to produce a non-empty formatDrop() string.
  triggeredBy: 'cash' | 'miles' | 'both'
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

  const cashBeatsLow = beatsLow(latest.cash_price, historicLowCash)
  const milesBeatsLow = beatsLow(latest.miles_price, historicLowMiles)

  if (cashBeatsLow || milesBeatsLow) {
    return {
      type: 'new_low',
      cashPrice: latest.cash_price,
      milesPrice: latest.miles_price,
      prevCashPrice: prevCash,
      prevMilesPrice: prevMiles,
      baselineCashPrice: historicLowCash,
      baselineMilesPrice: historicLowMiles,
      triggeredBy: cashBeatsLow && milesBeatsLow ? 'both' : cashBeatsLow ? 'cash' : 'miles',
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
      baselineCashPrice: avgCash,
      baselineMilesPrice: avgMiles,
      triggeredBy: cashDropped && milesDropped ? 'both' : cashDropped ? 'cash' : 'miles',
    }
  }

  return null
}

/**
 * Human-readable drop % string, e.g. "12%".
 *
 * Callers MUST pass a `baseline` the caller knows is higher than `current`
 * (an AlertTrigger's baselineCashPrice/baselineMilesPrice, never
 * prevCashPrice/prevMilesPrice — see AlertTrigger's own comment for why).
 * Passing the wrong baseline can silently produce a negative percentage,
 * which reads as nonsense next to the word "dropped": this function once
 * received prevCashPrice for a price that had *risen* since the last check,
 * and rendered as the real, shipped "📉 Price dropped -5%" bug.
 */
export function formatDrop(current: number | null, baseline: number | null): string {
  if (current === null || baseline === null || baseline === 0) return ''
  const pct = ((baseline - current) / baseline) * 100
  return `${Math.round(pct)}%`
}
