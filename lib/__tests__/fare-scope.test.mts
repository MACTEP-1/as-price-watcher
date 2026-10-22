/**
 * All-Alaska tracking (migration 010) in lib/flights/serpapi-provider.ts.
 * Run with:
 *   npx tsx lib/__tests__/fare-scope.test.mts
 *
 * Stubs fetch with canned SerpApi payloads, chosen by whether the request
 * carries include_airlines=AS. Modelled on the real SEA→TPA 11/10–15
 * searches of 2026-10-22: unfiltered, the cheapest "Alaska" itinerary was
 * AS 326 out ($688, Delta back); Alaska-only, the cheapest was $854.
 */

import providerModule from '../flights/serpapi-provider.ts'

const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}

process.env.SERPAPI_KEY = 'test-key'
delete process.env.SERPAPI_STRICT_AS

const itin = (price: number, ...flights: [string, string][]) => ({
  price,
  total_duration: 300,
  flights: flights.map(([airline, flight_number]) => ({ airline, flight_number })),
})

const UNFILTERED = {
  best_flights: [
    itin(409, ['Southwest', 'WN 4519'], ['Southwest', 'WN 3095']),
    itin(611, ['Delta', 'DL 1234']),
    itin(688, ['Alaska', 'AS 326']), // the mixed AS-out / DL-back round trip
  ],
}
const ALASKA_ONLY = {
  best_flights: [itin(854, ['Alaska', 'AS 623'], ['Alaska', 'AS 625']), itin(932, ['Alaska', 'AS 326'])],
}
const NO_RESULTS = { error: "Google Flights hasn't returned any results for this query." }

let requests: string[] = []
function stub(handler: (url: URL) => { status?: number; body: unknown } | 'timeout') {
  requests = []
  ;(globalThis as any).fetch = async (u: string) => {
    const url = new URL(u)
    requests.push(url.searchParams.get('include_airlines') ?? 'none')
    const r = handler(url)
    if (r === 'timeout') throw new Error('The operation was aborted')
    const status = r.status ?? 200
    return { ok: status < 400, status, json: async () => r.body, text: async () => JSON.stringify(r.body) }
  }
}
const isAS = (url: URL) => url.searchParams.get('include_airlines') === 'AS'

const base = {
  origin: 'SEA',
  destination: 'TPA',
  departDate: '2026-11-10',
  returnDate: '2026-11-15',
  cabinClass: 'economy' as const,
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
const summary = (r: any) =>
  r && { cash: r.cashPrice, scope: r.fareScope, flight: r.flightNumber, rival: r.competitorCashPrice, rivalAirline: r.competitorAirline }

const provider = new SerpApiFlightProvider()

// ── Legacy itineraries are untouched ──────────────────────────────────
stub(() => ({ body: UNFILTERED }))
check('legacy: one unfiltered search, picks the AS-leg trip as before',
  [summary(await provider.getCheapestFare(base)), requests],
  [{ cash: 688, scope: 'alaska_leg', flight: 'AS326', rival: 409, rivalAirline: 'Southwest' }, ['none']])

// ── All-Alaska ─────────────────────────────────────────────────────────
stub((url) => ({ body: isAS(url) ? ALASKA_ONLY : UNFILTERED }))
const allAlaska = await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' })
check('alaska_only: tracks the cheapest ALL-Alaska trip, not the AS-out/DL-back one',
  summary(allAlaska), { cash: 854, scope: 'alaska_only', flight: 'AS623', rival: 409, rivalAirline: 'Southwest' })
check('alaska_only: exactly two searches, one restricted to AS', [...requests].sort(), ['AS', 'none'])

stub((url) => ({ body: isAS(url) ? ALASKA_ONLY : { best_flights: [itin(688, ['Alaska', 'AS 326']), itin(900, ['Delta', 'DL 1'])] } }))
check('alaska_only: a mixed Alaska itinerary is never named as the cheaper rival',
  summary(await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' })),
  { cash: 854, scope: 'alaska_only', flight: 'AS623', rival: null, rivalAirline: null })

stub((url) => (isAS(url) ? { body: NO_RESULTS } : { body: UNFILTERED }))
check('alaska_only, no all-Alaska trip exists: falls back to the legacy pick, labelled as such',
  summary(await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' })),
  { cash: 688, scope: 'alaska_leg', flight: 'AS326', rival: 409, rivalAirline: 'Southwest' })

stub((url) => (isAS(url) ? { body: NO_RESULTS } : { body: { best_flights: [itin(409, ['Southwest', 'WN 1'])] } }))
check('alaska_only, no Alaska at all: any-airline fallback',
  summary(await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' })),
  { cash: 409, scope: 'any_airline', flight: 'WN1', rival: null, rivalAirline: null })

stub((url) => (isAS(url) ? 'timeout' : { body: UNFILTERED }))
let threw = false
try { await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' }) } catch { threw = true }
check('alaska_only: a FAILED Alaska search throws — no silent switch to a different kind of price', threw, true)

stub((url) => (isAS(url) ? { body: ALASKA_ONLY } : { status: 500, body: 'boom' }))
check('alaska_only: unfiltered search fails → tracked price kept, rival just missing',
  summary(await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' })),
  { cash: 854, scope: 'alaska_only', flight: 'AS623', rival: null, rivalAirline: null })

stub(() => ({ body: NO_RESULTS }))
check('alaska_only: no results anywhere → null', await provider.getCheapestFare({ ...base, fareScope: 'alaska_only' }), null)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
