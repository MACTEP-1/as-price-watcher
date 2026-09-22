/**
 * The "same price announced twice" fix in lib/alerts.ts (REPEAT_GATE_DAYS).
 * Run with:
 *   npx tsx lib/__tests__/alerts-repeat.test.mts
 *
 * Reconstructs the real 09/11 -> 09/12 SEA->YYZ case: a sharp drop to $612
 * fired drop_10pct, then the SAME $612 fired it again the next day because
 * the 7-day average still held the pre-drop prices. Uses default thresholds
 * (7 checks / 3% / 5-point window), so no env overrides or subprocess needed.
 */

import alertsModule from '../alerts.ts'
import type { PriceCheck } from '../../types/index.ts'

const { evaluateAlerts } = alertsModule as unknown as {
  evaluateAlerts: typeof import('../alerts.ts').evaluateAlerts
}

function check(day: number, cash: number | null, miles: number | null = null): PriceCheck {
  const d = new Date('2026-09-01T13:07:00Z')
  d.setUTCDate(d.getUTCDate() + day)
  return {
    id: `d${day}`, itinerary_id: 't', checked_at: d.toISOString(),
    cash_price: cash, cash_currency: 'USD', miles_price: miles,
    airline: 'AS', flight_number: 'AS385', duration_minutes: null, stops: 0,
  }
}

// Days 0-1: an old low of $600 (outside the 7-day window by day 10).
// Days 2-9: ~$800. Day 10: sharp drop to $612 -> drop_10pct (not new_low,
// because $600 was seen before).
const base = [600, 600, 800, 790, 810, 800, 805, 795, 800, 810].map((p, i) => check(i, p))
const drop = check(10, 612)
const reportedDay10 = { cashPrice: 612, milesPrice: null, reportedAt: drop.checked_at }

let failures = 0
function expect(name: string, got: string | null, want: string | null) {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got ?? 'no alert'}, want ${want ?? 'no alert'}`)
}
const type = (h: PriceCheck[], lr: Parameters<typeof evaluateAlerts>[1] = null) =>
  evaluateAlerts(h, lr)?.type ?? null

expect('day 10 sharp drop to $612, nothing reported yet', type([...base, drop]), 'drop_10pct')

expect(
  'day 11 same $612, already told $612 yesterday (the 09/12 repeat)',
  type([...base, drop, check(11, 612)], reportedDay10),
  null
)
expect(
  'day 11 $605, only ~1% below what was told',
  type([...base, drop, check(11, 605)], reportedDay10),
  null
)
expect(
  'day 11 $580, ~5% below what was told -> real news',
  type([...base, drop, check(11, 580)], reportedDay10),
  'new_low'
)
// $590 beats $612 by 3.6% but not the $600 historic low by 3%, so it can
// only arrive via drop_10pct — proves the gate lets real improvements through.
expect(
  'day 11 $590, beats told $612 by >3% but not a new low -> drop_10pct still fires',
  type([...base, drop, check(11, 590)], reportedDay10),
  'drop_10pct'
)
expect(
  'no prior alert at all -> gate does not apply',
  type([...base, drop, check(11, 612)], null),
  'drop_10pct'
)

// Stale report: told $500 20 days before, price rebounded to ~$900, now a
// genuine weekly drop to $700 — must still fire even though it's above $500.
const rebound = [950, 900, 910, 890, 905, 900, 895, 900].map((p, i) => check(20 + i, p))
const staleReport = { cashPrice: 500, milesPrice: null, reportedAt: check(8, 0).checked_at }
const history2 = [check(0, 520), ...rebound, check(28, 700)]
expect(
  'told $500 20 days ago, rebound to ~$900, now $700 -> fires (report is stale)',
  type(history2, staleReport),
  'drop_10pct'
)
expect(
  'same $700, but the $500 report is only 3 days old -> suppressed',
  type(history2, { ...staleReport, reportedAt: check(25, 0).checked_at }),
  null
)

// Miles gate is independent of cash.
const milesBase = [60000, 60000, 80000, 79000, 81000, 80000, 80500, 79500, 80000, 81000]
  .map((m, i) => check(i, null, m))
const milesDrop = check(10, null, 61000)
expect(
  'miles: same 61k the day after being told 61k',
  type([...milesBase, milesDrop, check(11, null, 61000)], {
    cashPrice: null, milesPrice: 61000, reportedAt: milesDrop.checked_at,
  }),
  null
)

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
