/**
 * Shared by alerts-noise.test.mts (the orchestrator) and
 * _alerts-noise-worker.mts (run once per settings profile, in its own OS
 * process — see that file for why a subprocess, not just a fresh import,
 * turned out to be necessary).
 */

import type { PriceCheck } from '../../types/index.ts'

export function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export function makeCheck(dayOffset: number, price: number, id: string): PriceCheck {
  const d = new Date('2026-09-01T13:00:00Z')
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return {
    id,
    itinerary_id: 'synthetic',
    checked_at: d.toISOString(),
    cash_price: Math.round(price),
    cash_currency: 'USD',
    miles_price: null,
    airline: 'XX',
    flight_number: null,
    duration_minutes: null,
    stops: 0,
  }
}

export function noisyFlatSeries(
  rng: () => number,
  days: number,
  basePrice: number,
  dailySigmaPct: number
): PriceCheck[] {
  const out: PriceCheck[] = []
  for (let i = 0; i < days; i++) {
    const price = basePrice * (1 + gaussian(rng) * dailySigmaPct)
    out.push(makeCheck(i, price, `flat-${i}`))
  }
  return out
}

export function genuineDeclineSeries(
  days: number,
  startPrice: number,
  endPrice: number
): PriceCheck[] {
  const out: PriceCheck[] = []
  for (let i = 0; i < days; i++) {
    const price = startPrice + ((endPrice - startPrice) * i) / (days - 1)
    out.push(makeCheck(i, price, `decline-${i}`))
  }
  return out
}

export function firstFireIndex(
  series: PriceCheck[],
  evaluate: typeof import('../alerts.ts').evaluateAlerts
): { index: number; type: string } | null {
  for (let i = 1; i <= series.length; i++) {
    const result = evaluate(series.slice(0, i))
    if (result) return { index: i, type: result.type }
  }
  return null
}

export const NOISE_LEVELS = [0.02, 0.05, 0.08, 0.12]
export const TRIALS = 3000
export const SERIES_DAYS = 21
export const SEED = 20260914

export interface ProfileResult {
  falsePositive: Record<string, { rate: number; avgDay: number | null }>
  declineNeverFires: boolean
  declineFiredAt: { index: number; type: string } | null
  closeCallFired: { index: number; type: string } | null
  slowDeclineFires: Array<{ check: number; price: number; type: string }>
  // Steady linear declines over 14 days at each total-drop level: does the
  // real evaluateAlerts ever fire, and on which check? Found by accident
  // while investigating the noise question — the new_low check compares
  // each day only against the PRECEDING day's (already lower) price, so a
  // smooth decline needs roughly NEW_LOW_MARGIN per day just to keep
  // tripping it; slower than that, no amount of cumulative decline fires
  // anything, however large.
  declineSweep: Array<{
    totalDropPct: number
    fired: { index: number; type: string } | null
  }>
  ratchetTest: {
    fires: Array<{ day: number; type: string; price: number; anchor: number | null }>
    onlyCumulativeDropFired: boolean
    eachFireIsAFreshDropFromThePreviousAlert: boolean
  }
}

/** Total-drop levels used by declineSweep, applied to a 14-day linear decline. */
export const DECLINE_SWEEP_LEVELS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7]
