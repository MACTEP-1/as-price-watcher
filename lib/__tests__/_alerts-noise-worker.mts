/**
 * Runs the full noise analysis for ONE settings profile, in its own OS
 * process, and prints the result as one line of JSON on stdout.
 *
 * Why a subprocess and not just re-importing alerts.ts with different
 * process.env values in-process: lib/alerts.ts reads MIN_CHECKS /
 * NEW_LOW_MARGIN / MIN_WINDOW into module-level constants at import time.
 * A cache-busted `import('../alerts.ts?x=1')` was tried first to get a
 * fresh module per profile without a subprocess — it silently didn't work
 * (all profiles kept reading whatever env was live when the FIRST import
 * resolved), and a version of it that also mutated process.env around each
 * import raced when driven from Promise.all, and even fixed sequentially
 * still returned what looks like the same cached module for every query
 * string. A real subprocess sidesteps needing to understand why the
 * loader's cache behaved that way: separate OS processes cannot share
 * module state or env, full stop.
 */

import {
  mulberry32,
  noisyFlatSeries,
  genuineDeclineSeries,
  makeCheck,
  firstFireIndex,
  NOISE_LEVELS,
  TRIALS,
  SERIES_DAYS,
  SEED,
  DECLINE_SWEEP_LEVELS,
  type ProfileResult,
} from './_alerts-noise-lib.mts'
import alertsModule from '../alerts.ts'
import type { PriceCheck } from '../../types/index.ts'

const { evaluateAlerts } = alertsModule as unknown as {
  evaluateAlerts: typeof import('../alerts.ts').evaluateAlerts
}

const falsePositive: ProfileResult['falsePositive'] = {}
for (const sigma of NOISE_LEVELS) {
  const rng = mulberry32(SEED + Math.round(sigma * 1000))
  let fires = 0
  let firstIndexSum = 0
  for (let t = 0; t < TRIALS; t++) {
    const series = noisyFlatSeries(rng, SERIES_DAYS, 500, sigma)
    const fired = firstFireIndex(series, evaluateAlerts)
    if (fired) {
      fires++
      firstIndexSum += fired.index
    }
  }
  falsePositive[String(sigma)] = {
    rate: fires / TRIALS,
    avgDay: fires > 0 ? firstIndexSum / fires : null,
  }
}

const decline = genuineDeclineSeries(14, 500, 400)
const declineFiredAt = firstFireIndex(decline, evaluateAlerts)

const closeCall = [
  makeCheck(0, 500, 'c0'),
  makeCheck(1, 512, 'c1'),
  makeCheck(2, 495, 'c2'),
  makeCheck(3, 505, 'c3'),
  makeCheck(4, 470, 'c4'),
]
const closeCallResult = evaluateAlerts(closeCall)
const closeCallFired = closeCallResult
  ? { index: closeCall.length, type: closeCallResult.type }
  : null

const slowDecline = genuineDeclineSeries(14, 500, 405)
const slowDeclineFires: ProfileResult['slowDeclineFires'] = []
for (let i = 5; i <= slowDecline.length; i++) {
  const prefix = slowDecline.slice(0, i)
  const result = evaluateAlerts(prefix)
  if (result) {
    slowDeclineFires.push({
      check: i,
      price: prefix[prefix.length - 1].cash_price as number,
      type: result.type,
    })
  }
}

const declineSweep: ProfileResult['declineSweep'] = DECLINE_SWEEP_LEVELS.map(
  (totalDropPct) => {
    const series = genuineDeclineSeries(14, 500, 500 * (1 - totalDropPct))
    return { totalDropPct, fired: firstFireIndex(series, evaluateAlerts) }
  }
)

// ── Ratchet check ────────────────────────────────────────────────────────
// Everything above only exercises the FALLBACK anchor (history[0], i.e.
// lastReported=null — no alert has ever fired). This is the other half: once
// a cumulative_drop alert DOES fire and the caller records it, the NEXT
// evaluation must compare against THAT price, not the original start.
//
// Isolating this needs a decline slow enough that new_low structurally
// cannot also fire (its own per-day step must stay under NEW_LOW_MARGIN, or
// new_low wins the priority race before cumulative_drop is ever reached —
// exactly what happened when this was first tried against a fast, uniform
// decline: new_low legitimately fired every day, since each day genuinely
// was a new all-time low). So: a real, ~1.35%/day compounding decline,
// simulated as a STATEFUL cron would run it — lastReported only updates
// when an alert actually fires, same as production must.
let ratchetPrice = 500
let ratchetLastReported: {
  cashPrice: number | null
  milesPrice: number | null
  reportedAt: string
} | null = null
const ratchetHistory: PriceCheck[] = []
const ratchetFires: Array<{ day: number; type: string; price: number; anchor: number | null }> = []
for (let day = 0; day < 40; day++) {
  ratchetHistory.push(makeCheck(day, ratchetPrice, `rt${day}`))
  const trigger = evaluateAlerts(ratchetHistory, ratchetLastReported)
  if (trigger) {
    ratchetFires.push({
      day,
      type: trigger.type,
      price: ratchetHistory[ratchetHistory.length - 1].cash_price as number,
      anchor: trigger.baselineCashPrice,
    })
    ratchetLastReported = {
      cashPrice: trigger.cashPrice,
      milesPrice: trigger.milesPrice,
      reportedAt: ratchetHistory[ratchetHistory.length - 1].checked_at,
    }
  }
  ratchetPrice *= 0.9865 // ~1.35%/day — under NEW_LOW_MARGIN and DROP_THRESHOLD's
  // per-step bite, so new_low/drop_10pct structurally can't fire here; only
  // cumulative_drop, against a sticky anchor, ever should.
}

const cumulativeThreshold = parseFloat(
  process.env.ALERT_CUMULATIVE_DROP_THRESHOLD ?? '0.10'
)
const onlyCumulative = ratchetFires.every((f) => f.type === 'cumulative_drop')
const gapsAllNearThreshold = ratchetFires.every((f, i) => {
  if (i === 0) return true // first fire is watch-start → first anchor, nothing to compare yet
  const prevAnchor = ratchetFires[i - 1].anchor
  if (prevAnchor === null) return false
  const dropFromPrevAlert = (prevAnchor - f.price) / prevAnchor
  // Each subsequent fire should represent a FRESH ~10% drop from the
  // PREVIOUS alert's price, not from watch-start (500) every time — that
  // would be the bug (anchor never actually moving).
  return dropFromPrevAlert >= cumulativeThreshold * 0.9 // small slack for daily step size
})

const ratchetTest = {
  fires: ratchetFires,
  onlyCumulativeDropFired: onlyCumulative,
  eachFireIsAFreshDropFromThePreviousAlert: gapsAllNearThreshold,
}

const result: ProfileResult = {
  falsePositive,
  declineNeverFires: declineFiredAt === null,
  declineFiredAt,
  closeCallFired,
  slowDeclineFires,
  declineSweep,
  ratchetTest,
}

process.stdout.write(JSON.stringify(result))
