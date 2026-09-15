/**
 * Alert logic — no target price needed.
 *
 * Fires when:
 *   1. Cash OR miles price drops ≥10% from the 7-day rolling average  ("drop_10pct")
 *   2. Cash OR miles price hits a new all-time low for this watch      ("new_low")
 *   3. Cash OR miles price drops ≥10% from the price the user was LAST
 *      TOLD ABOUT — the anchor for this one only moves when an alert
 *      actually fires, unlike 1 and 2                                   ("cumulative_drop")
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
 * right after email alerts get switched on. Hence three guards:
 *
 *   MIN_CHECKS      — evaluate nothing until there is enough history
 *   NEW_LOW_MARGIN  — a new low must beat the old low by a real margin
 *   MIN_WINDOW      — the rolling average needs enough points to be an average
 *
 * All three are tunable by env var so they can be relaxed without a deploy.
 *
 * ── Why "cumulative_drop" exists (2026-09-15) ───────────────────────────────
 * Checks 1 and 2 both compare the latest price against a baseline that moves
 * EVERY DAY: the 7-day average slides with the trend, and "the previous low"
 * is, in a steadily declining series, just yesterday's price (each day's
 * price is by definition the new minimum-so-far). Both effectively degrade
 * to "did today beat yesterday by the margin?" — so a real, steady decline
 * under about NEW_LOW_MARGIN/DROP_THRESHOLD per day is invisible FOREVER,
 * however large it gets: quantified in lib/__tests__/alerts-noise.test.mts,
 * a smooth 20% decline over 14 days never fires a single alert under any
 * settings tried, including tighter ones aimed at cutting noise — tightening
 * the margin to fight noise makes this blind spot WORSE, not better, since
 * the daily rate needed to keep tripping it scales with the margin.
 *
 * The fix is a baseline that does NOT move every day: compare against the
 * price the user was actually last told about (their own mental reference
 * point — "what's important is what the user sees"), which only updates
 * when an alert actually fires. A slow bleed then keeps accumulating against
 * a fixed point until it crosses the threshold, rather than resetting its
 * progress every single check. Before any alert has ever fired for a watch,
 * there is nothing to compare against yet, so it falls back to the first
 * price ever recorded — the number implicitly "shown" when the watch began.
 *
 * This does NOT get its own, looser MIN_CHECKS: a single fixed-point
 * comparison isn't smoothed by having more checks the way an average is (two
 * single noisy readings can differ by 10% regardless of how many OTHER
 * checks also exist), so more history doesn't make it safer, and exempting
 * it would reintroduce exactly the early-noise problem the other two guards
 * exist to prevent. Silence before MIN_CHECKS checks accumulate is already
 * documented, accepted behavior (CLAUDE.md, "Why no alerts until Aug 26") —
 * this is consistent with that, not a new trade-off.
 */

import type { PriceCheck } from '@/types'

/** The price the caller believes the user was last actually told about. */
export interface LastReportedPrice {
  cashPrice: number | null
  milesPrice: number | null
}

export type AlertTrigger = {
  type: 'drop_10pct' | 'new_low' | 'cumulative_drop'
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
  // 'new_low', the last-reported (or watch-start) price for
  // 'cumulative_drop'. Always on the correct side of `cashPrice`/
  // `milesPrice` for this alert's `type` by construction (that's what made
  // it fire) — unlike prevCashPrice/prevMilesPrice, which is a different,
  // unrelated value that once produced a real "📉 Price dropped -5%" email
  // for a price that had actually risen 5% versus the day before, because
  // the alert had fired against a much higher 7-day average instead. Use
  // these for any "dropped by X%" or "was $Y" language, never
  // prevCashPrice/prevMilesPrice.
  baselineCashPrice: number | null
  baselineMilesPrice: number | null
  // Which metric(s) actually crossed this alert's threshold — so a caller
  // can report the real reason instead of guessing from whichever of
  // cash/miles happens to produce a non-empty formatDrop() string.
  triggeredBy: 'cash' | 'miles' | 'both'
  // 'cumulative_drop' only: whether baselineCashPrice/baselineMilesPrice
  // came from a real prior alert ('last_alert') or the fallback — the
  // earliest check on record, because none has fired yet ('watch_start').
  // Copy that says "since we last told you" is only accurate for the
  // former; undefined for the other two trigger types.
  anchorSource?: 'last_alert' | 'watch_start'
}

/** Latest must be this far below the 7-day average to count as a drop. */
const DROP_THRESHOLD = 0.10 // 10%

/**
 * Minimum total checks before any alert can fire. Was 5; raised to 7 on
 * 2026-09-15 after replaying REAL price history (not synthetic noise)
 * through this file's logic — see lib/__tests__/alerts-noise.test.mts and
 * that day's investigation. 7/3%/5 ("candidate B") cut real alert volume
 * on the most volatile observed route by ~25% (4 alerts -> 3 over the same
 * 13-day window) with zero measured cost to detection speed on a genuine
 * decline (both settings fired on the same day against a synthetic 20%
 * drop). Tuning further than this doesn't help: SEA->YYZ's real fare
 * swings up to 70% in a single day on the SAME flight (confirmed via
 * flight_number — genuine bucket sellout/reopen, not a data bug), which
 * dwarfs any margin change considered here. Cutting alert volume further
 * would need a different mechanism (e.g. requiring a price to hold for two
 * consecutive checks), not more threshold tuning.
 */
const MIN_CHECKS = Math.max(2, parseInt(process.env.ALERT_MIN_CHECKS ?? '7', 10))

/** A new low must beat the previous low by at least this fraction. */
const NEW_LOW_MARGIN = Math.max(
  0,
  parseFloat(process.env.ALERT_NEW_LOW_MARGIN ?? '0.03') // 3% — see MIN_CHECKS above
)

/** Minimum data points inside the 7-day window for the average to mean anything. */
const MIN_WINDOW = Math.max(1, parseInt(process.env.ALERT_MIN_WINDOW ?? '5', 10))

/** Latest must be this far below the last-reported (or watch-start) price. */
const CUMULATIVE_DROP_THRESHOLD = Math.max(
  0,
  parseFloat(process.env.ALERT_CUMULATIVE_DROP_THRESHOLD ?? '0.10') // 10%
)

/**
 * Given all historical price checks for a watch (oldest → newest), and the
 * price this watch's user was last actually sent an alert about (or null if
 * none has ever fired), returns an alert descriptor if the latest check
 * warrants an alert, or null if not.
 *
 * `lastReported` is per-WATCH, not per-itinerary: two people watching the
 * same route can be at different points in their own alert history, so this
 * one argument — unlike `history`, which is shared — must be supplied fresh
 * per watcher. See the cron route for where it's read.
 */
export function evaluateAlerts(
  history: PriceCheck[],
  lastReported: LastReportedPrice | null = null
): AlertTrigger | null {
  // Not enough history for "all-time", "average", or "since we last told
  // you" to mean anything yet.
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

  // ── Check: ≥10% drop from what the user was last actually told ─────
  // Anchor is sticky — it does NOT move day to day the way the average and
  // "previous low" above do, so a slow bleed keeps accumulating against it
  // instead of resetting its progress every check. See this file's header
  // for the smooth-decline case this specifically exists to catch.
  const anchorSource: 'last_alert' | 'watch_start' =
    lastReported !== null ? 'last_alert' : 'watch_start'
  const anchorCash = lastReported?.cashPrice ?? history[0]?.cash_price ?? null
  const anchorMiles = lastReported?.milesPrice ?? history[0]?.miles_price ?? null

  const cashCumulativeDropped =
    latest.cash_price !== null &&
    anchorCash !== null &&
    (anchorCash - latest.cash_price) / anchorCash >= CUMULATIVE_DROP_THRESHOLD

  const milesCumulativeDropped =
    latest.miles_price !== null &&
    anchorMiles !== null &&
    (anchorMiles - latest.miles_price) / anchorMiles >= CUMULATIVE_DROP_THRESHOLD

  if (cashCumulativeDropped || milesCumulativeDropped) {
    return {
      type: 'cumulative_drop',
      cashPrice: latest.cash_price,
      milesPrice: latest.miles_price,
      prevCashPrice: prevCash,
      prevMilesPrice: prevMiles,
      baselineCashPrice: anchorCash,
      baselineMilesPrice: anchorMiles,
      triggeredBy:
        cashCumulativeDropped && milesCumulativeDropped
          ? 'both'
          : cashCumulativeDropped
            ? 'cash'
            : 'miles',
      anchorSource,
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
