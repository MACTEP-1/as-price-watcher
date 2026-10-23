/**
 * Pinned flights (migration 012). Run with:
 *   npx tsx lib/__tests__/pinned-flights.test.mts
 *
 * The parsing that turns what someone types into flight numbers, the rules
 * that decide what a pinned watch is, and the provider pricing EXACTLY the
 * pinned flights — never a substitute — via the departure_token round trip.
 * fetch is stubbed; payloads are modelled on SEA→TPA 11/10–15.
 */

import formatModule from '../format.ts'
import providerModule from '../flights/serpapi-provider.ts'

const { parseFlightList, normaliseFlightList, pinnedFareScope, formatWatchLimits, pinPrefillParams, formatReturnNote, formatCheckCount } =
  formatModule as unknown as typeof import('../format.ts')
const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}

process.env.SERPAPI_KEY = 'test-key'
delete process.env.SERPAPI_STRICT_AS

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

// ── Parsing what people type ──────────────────────────────────────────
check('"AS 326"', parseFlightList('AS 326'), ['AS326'])
check('"as326" (lower case, no space)', parseFlightList('as326'), ['AS326'])
check('"AS 623, AS 625" (connection)', parseFlightList('AS 623, AS 625'), ['AS623', 'AS625'])
check('"AS623 + AS625"', parseFlightList('AS623 + AS625'), ['AS623', 'AS625'])
check('"B6 123" (digit in carrier code)', parseFlightList('B6 123'), ['B6123'])
check('empty → not pinned', parseFlightList('  '), [])
check('"hello" → unreadable', parseFlightList('hello'), null)
check('"326" alone → unreadable (no carrier)', parseFlightList('326'), null)
check('five flights → too many', parseFlightList('AS1 AS2 AS3 AS4 AS5'), null)

check('server: normalises', normaliseFlightList(['as 326']), ['AS326'])
check('server: absent → null', normaliseFlightList(undefined), null)
check('server: empty list → null', normaliseFlightList([]), null)
check('server: a string, not a list → invalid', normaliseFlightList('AS326'), 'invalid')
check('server: junk entry → invalid', normaliseFlightList(['AS326', 'DROP TABLE']), 'invalid')

// ── What a pinned watch is ────────────────────────────────────────────
check('scope: AS out + AS back → all-Alaska', pinnedFareScope(['AS326'], ['AS325'], true), 'alaska_only')
check('scope: AS out, return unpinned → may be anyone', pinnedFareScope(['AS326'], null, true), 'alaska_leg')
check('scope: AS out + DL back → mixed', pinnedFareScope(['AS326'], ['DL1090'], true), 'alaska_leg')
check('scope: one-way AS connection → all-Alaska', pinnedFareScope(['AS623', 'AS625'], null, false), 'alaska_only')

check('card label: pinned pair',
  formatWatchLimits({ max_stops: 0, outbound_flights: ['AS326'], return_flights: ['AS325'] }), 'AS 326 / AS 325 only')
check('card label: unpinned falls back to the stop limit',
  formatWatchLimits({ max_stops: 0, outbound_flights: null, return_flights: null }), 'nonstop only')

check('return note: a pinned return names the flight',
  formatReturnNote({ fare_scope: 'alaska_leg' }, { return_flights: ['DL1090'] }), 'return DL 1090')
check('return note: unpinned all-Alaska row unchanged',
  formatReturnNote({ fare_scope: 'alaska_only' }, { return_flights: null }), 'return on Alaska')

check('check count from full-history counts (dashboard card)',
  formatCheckCount({ own: 1, google: 61 }), '1 check + 61 days from Google')

const w = { origin: 'SEA', destination: 'TPA', depart_date: '2026-11-10', return_date: '2026-11-15', cabin_class: 'economy' }
check('prefill: from the latest check\'s legs',
  pinPrefillParams(w, { flight_number: 'AS623', legs: [{ flight: 'AS623' }, { flight: 'AS625' }] }),
  { from: 'SEA', to: 'TPA', depart: '2026-11-10', cabin: 'economy', out: 'AS 623 + AS 625', return: '2026-11-15' })
check('prefill: nothing known → no link', pinPrefillParams(w, { flight_number: null, legs: null }), null)

// ── Provider: exactly the pinned flights ──────────────────────────────
const itin = (price: number, token: string | null, ...flights: [string, string][]) => ({
  price,
  total_duration: 300,
  ...(token ? { departure_token: token } : {}),
  flights: flights.map(([airline, flight_number]) => ({ airline, flight_number })),
})
const OUTBOUNDS = {
  best_flights: [
    itin(409, 'tok-wn', ['Southwest', 'WN 4519'], ['Southwest', 'WN 3095']),
    itin(611, 'tok-dl', ['Delta', 'DL 1234']),
    itin(688, 'tok-326', ['Alaska', 'AS 326']),
    itin(854, 'tok-623', ['Alaska', 'AS 623'], ['Alaska', 'AS 625']),
  ],
}
const RETURNS_FOR_326 = {
  best_flights: [itin(688, null, ['Delta', 'DL 1090']), itin(932, null, ['Alaska', 'AS 325'])],
}
let requests: Record<string, string | null>[] = []
;(globalThis as any).fetch = async (u: string) => {
  const q = new URL(u).searchParams
  requests.push({ token: q.get('departure_token'), stops: q.get('stops'), airlines: q.get('include_airlines') })
  const body = q.get('departure_token') === 'tok-326' ? RETURNS_FOR_326 : q.get('departure_token') ? { best_flights: [] } : OUTBOUNDS
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}
const p = new SerpApiFlightProvider()
const base = { origin: 'SEA', destination: 'TPA', departDate: '2026-11-10', returnDate: '2026-11-15', cabinClass: 'economy' as const }
const sum = (r: any) => r && { cash: r.cashPrice, scope: r.fareScope, flight: r.flightNumber, rival: r.competitorAirline }

requests = []
check('outbound pinned: that flight with Google\'s cheapest return, one search; rival nonstop like the pin',
  [sum(await p.getCheapestFare({ ...base, outboundFlights: ['AS326'] })), requests.length],
  [{ cash: 688, scope: 'alaska_leg', flight: 'AS326', rival: 'Delta' }, 1])

requests = []
check('outbound + return pinned: the exact pair\'s round-trip price, two searches',
  [sum(await p.getCheapestFare({ ...base, outboundFlights: ['AS326'], returnFlights: ['AS325'] })), requests.map((r) => r.token)],
  [{ cash: 932, scope: 'alaska_only', flight: 'AS326', rival: 'Delta' }, [null, 'tok-326']])

requests = []
await p.getCheapestFare({ ...base, outboundFlights: ['AS326'], maxStops: 0, fareScope: 'alaska_only' })
check('pinned: stop limit and Airlines filter not sent — the flights decide', requests, [{ token: null, stops: null, airlines: null }])

check('connection pinned in order; a one-stop rival is fair game',
  sum(await p.getCheapestFare({ ...base, outboundFlights: ['AS623', 'AS625'] })), { cash: 854, scope: 'alaska_leg', flight: 'AS623', rival: 'Southwest' })

;(globalThis as any).fetch = async () => ({
  ok: true, status: 200, text: async () => '',
  json: async () => ({ best_flights: [itin(409, null, ['Southwest', 'WN 1'], ['Southwest', 'WN 2']), itin(581, null, ['Alaska', 'AS 679'])] }),
})
check('pinned nonstop, only a one-stop fare is cheaper → no rival (the SFO→PVR case)',
  sum(await p.getCheapestFare({ ...base, outboundFlights: ['AS679'] }))?.rival, null)
check('connection in the wrong order is not a match', await p.getCheapestFare({ ...base, outboundFlights: ['AS625', 'AS623'] }), null)
check('pinned outbound not on sale → no price, not a substitute', await p.getCheapestFare({ ...base, outboundFlights: ['AS999'] }), null)
check('pinned return not on sale → no price', await p.getCheapestFare({ ...base, outboundFlights: ['AS326'], returnFlights: ['AS999'] }), null)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
