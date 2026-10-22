/**
 * Head start for new all-Alaska watches from Google's price history
 * (migration 011). Run with:
 *   npx tsx lib/__tests__/price-history-seed.test.mts
 *
 * Three pieces, each easy to get quietly wrong:
 *  1. the provider must hand back the history from the ALASKA-ONLY search —
 *     the unfiltered one's history is the cheapest fare on any airline;
 *  2. the seed rows must skip today's point (the real check covers it);
 *  3. alerts must treat copied days as cash history only — not as miles
 *     history, and not as "the price when you started watching".
 */

import providerModule from '../flights/serpapi-provider.ts'
import rowModule from '../price-check-row.ts'
import alertsModule from '../alerts.ts'

const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}
const { googleHistoryRows } = rowModule as unknown as typeof import('../price-check-row.ts')
const { evaluateAlerts } = alertsModule as unknown as typeof import('../alerts.ts')

process.env.SERPAPI_KEY = 'test-key'
delete process.env.SERPAPI_STRICT_AS

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

// ── 1. Provider ───────────────────────────────────────────────────────
const DAY = 86400
const T0 = Date.UTC(2026, 9, 20) / 1000 // 2026-10-20 00:00 UTC
const itin = (price: number, fn: string) => ({ price, total_duration: 300, flights: [{ airline: 'x', flight_number: fn }] })
;(globalThis as any).fetch = async (u: string) => {
  const alaska = new URL(u).searchParams.get('include_airlines') === 'AS'
  const body = alaska
    ? { best_flights: [itin(854, 'AS 623')], price_insights: { price_history: [[T0, 712], [T0 + DAY, 737], ['bad', 5], [T0 + 2 * DAY, 854]] } }
    : { best_flights: [itin(409, 'WN 1'), itin(688, 'AS 326')], price_insights: { price_history: [[T0, 387], [T0 + DAY, 382]] } }
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}
const params = { origin: 'SEA', destination: 'TPA', departDate: '2026-11-10', returnDate: '2026-11-15', cabinClass: 'economy' as const }
const p = new SerpApiFlightProvider()
const allAlaska = await p.getCheapestFare({ ...params, fareScope: 'alaska_only' })
check('alaska_only: history comes from the Alaska-only search, malformed point dropped',
  allAlaska?.priceHistory?.map((h) => h.price), [712, 737, 854])
check('alaska_only: history dates are ISO strings', allAlaska?.priceHistory?.[0].at, '2026-10-20T00:00:00.000Z')
const legacy = await p.getCheapestFare(params)
check('legacy: no history (the unfiltered one is any-airline)', legacy?.priceHistory, undefined)

// ── 2. Seed rows ──────────────────────────────────────────────────────
const now = new Date('2026-10-22T13:00:00Z')
const rows = googleHistoryRows('itin-1', allAlaska!.priceHistory, now)
check('seed: today\'s point (within 20h) skipped, older ones kept', rows.map((r) => r.cash_price), [712, 737])
check('seed: rows marked as Google history, all-Alaska, cash only',
  [rows[0].source, rows[0].fare_scope, rows[0].miles_price, rows[0].checked_at], ['google_history', 'alaska_only', null, '2026-10-20T00:00:00.000Z'])
check('seed: nothing to seed → no rows', googleHistoryRows('x', undefined, now), [])

// ── 3. Alerts over seeded history ─────────────────────────────────────
type Row = { checked_at: string; cash_price: number | null; miles_price: number | null; source: string }
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY * 1000).toISOString()
const seeds = (prices: number[]): Row[] => prices.map((cash, i) => ({ checked_at: day(i), cash_price: cash, miles_price: null, source: 'google_history' }))
const own = (n: number, cash: number, miles: number | null): Row => ({ checked_at: day(n), cash_price: cash, miles_price: miles, source: 'check' })
const evalRows = (rows: Row[]) => evaluateAlerts(rows as never, null)

const sixtyAt800 = seeds(Array(60).fill(800))
check('seeded cash history lets a real drop alert on the first daily run',
  evalRows([...sixtyAt800, own(60, 800, 25000), own(61, 690, 25000)])?.type, 'new_low')
check('…but miles, with only 2 real readings, can\'t alert however far they fall',
  evalRows([...sixtyAt800, own(60, 800, 25000), own(61, 800, 7500)]), null)

const thirtyAt1000ThenAt800 = seeds([...Array(30).fill(1000), ...Array(30).fill(800)])
check('watch-start anchor is the first OWN check ($800), not Google\'s oldest day ($1,000)',
  evalRows([...thirtyAt1000ThenAt800, own(60, 800, null), own(61, 785, null)]), null)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
