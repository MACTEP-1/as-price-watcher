/**
 * Leg recording (migration 005) and the "which leg is Alaska" display.
 * Run with:
 *   npx tsx lib/__tests__/itinerary-legs.test.mts
 *
 * Three things that could each be wrong independently:
 *   1. the provider extracts every leg, in order, from a SerpApi payload
 *   2. formatItineraryLine renders routing + Alaska leg, and falls back
 *      cleanly on rows written before migration 005 (no legs)
 *   3. priceCheckRow — now shared by the cron AND watch creation — carries
 *      every column, including the competitor ones watch creation used to
 *      drop (the drift that made it a shared function)
 * No network, no key: fetch is stubbed with canned payloads.
 */

import providerModule from '../flights/serpapi-provider.ts'
import formatModule from '../format.ts'
import rowModule from '../price-check-row.ts'

const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}
const { formatItineraryLine } = formatModule as unknown as {
  formatItineraryLine: typeof import('../format.ts').formatItineraryLine
}
const { priceCheckRow } = rowModule as unknown as {
  priceCheckRow: typeof import('../price-check-row.ts').priceCheckRow
}

process.env.SERPAPI_KEY = 'test-key'
delete process.env.SERPAPI_STRICT_AS

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

const leg = (airline: string, flight: string, from: string, to: string) => ({
  airline,
  flight_number: flight,
  departure_airport: { id: from },
  arrival_airport: { id: to },
})

// ── 1. provider extracts every leg ─────────────────────────────────────
// Shaped like the real ZRH→SEA result of 09/24: LO 412 first, Alaska last.
// (Middle leg and airports illustrative — the DB only kept the first leg
// before this change, which is the point of it.)
;(globalThis as any).fetch = async () => ({
  ok: true,
  json: async () => ({
    best_flights: [
      {
        price: 3427,
        total_duration: 920,
        flights: [
          leg('LOT', 'LO 412', 'ZRH', 'WAW'),
          leg('LOT', 'LO 3', 'WAW', 'ORD'),
          leg('Alaska Airlines', 'AS 6', 'ORD', 'SEA'),
        ],
      },
    ],
  }),
  text: async () => '',
})
const fare = await new SerpApiFlightProvider().getCheapestFare({
  origin: 'ZRH',
  destination: 'SEA',
  departDate: '2026-10-13',
  cabinClass: 'business',
})
check('provider: all legs, in order, spaces stripped', fare?.legs, [
  { flight: 'LO412', from: 'ZRH', to: 'WAW' },
  { flight: 'LO3', from: 'WAW', to: 'ORD' },
  { flight: 'AS6', from: 'ORD', to: 'SEA' },
])
check('provider: flightNumber still the FIRST leg (existing readers)', fare?.flightNumber, 'LO412')
check('provider: stops', fare?.stops, 2)

// ── 2. formatItineraryLine ─────────────────────────────────────────────
check(
  'multi-carrier: routing + which leg Alaska flies',
  formatItineraryLine({ flight_number: 'LO412', stops: 2, duration_minutes: 920, legs: fare!.legs }),
  'LO 412 → LO 3 → AS 6 (ZRH–WAW–ORD–SEA) · 2 stops · 15h 20m · Alaska flies ORD–SEA'
)
check(
  'all-Alaska nonstop (SEA→TPA): no Alaska suffix needed',
  formatItineraryLine({
    flight_number: 'AS326',
    stops: 0,
    duration_minutes: 327,
    legs: [{ flight: 'AS326', from: 'SEA', to: 'TPA' }],
  }),
  'AS 326 (SEA–TPA) · nonstop · 5h 27m'
)
check(
  'Alaska on two non-adjacent legs: both named',
  formatItineraryLine({
    flight_number: 'AS1',
    stops: 2,
    duration_minutes: 600,
    legs: [
      { flight: 'AS1', from: 'ANC', to: 'SEA' },
      { flight: 'DL5', from: 'SEA', to: 'ATL' },
      { flight: 'AS9', from: 'ATL', to: 'MIA' },
    ],
  }),
  'AS 1 → DL 5 → AS 9 (ANC–SEA–ATL–MIA) · 2 stops · 10h 0m · Alaska flies ANC–SEA, ATL–MIA'
)
check(
  'no Alaska leg (provider fallback): said out loud',
  formatItineraryLine({
    flight_number: 'UA55',
    stops: 0,
    duration_minutes: 300,
    legs: [{ flight: 'UA55', from: 'SEA', to: 'EWR' }],
  }),
  'UA 55 (SEA–EWR) · nonstop · 5h 0m · no Alaska leg'
)
check(
  'row from before migration 005 (legs null): old line, unchanged',
  formatItineraryLine({ flight_number: 'FI569', stops: 2, duration_minutes: 900, legs: null }),
  'FI 569 · 2 stops · 15h 0m'
)
check(
  'legs field absent entirely (older callers): old line',
  formatItineraryLine({ flight_number: 'AS326', stops: 0, duration_minutes: 327 }),
  'AS 326 · nonstop · 5h 27m'
)
check(
  'missing airport on a leg: flights shown, airport list dropped',
  formatItineraryLine({
    flight_number: 'AS1',
    stops: 1,
    duration_minutes: 200,
    legs: [
      { flight: 'AS1', from: 'SEA', to: null },
      { flight: 'AS2', from: null, to: 'LAX' },
    ],
  }),
  'AS 1 → AS 2 · 1 stop · 3h 20m'
)

// ── 3. priceCheckRow carries every column ──────────────────────────────
const row = priceCheckRow('itin-1', fare, { milesPrice: 70000, cabin: 'business' } as any)
check('row: competitor columns present (watch creation used to drop them)', 
  ['competitor_cash_price', 'competitor_airline', 'legs'].every((k) => k in row), true)
check('row: legs stored', row.legs?.length, 3)
check('row: miles', row.miles_price, 70000)
check(
  'row: empty legs array (unmapped provider) → null, so UI falls back',
  priceCheckRow('itin-1', { ...fare!, legs: [] }, null).legs,
  null
)
check('row: no cash result at all → nulls, stops 0', 
  (({ cash_price, legs, stops, competitor_cash_price }) => ({ cash_price, legs, stops, competitor_cash_price }))(priceCheckRow('itin-1', null, null)),
  { cash_price: null, legs: null, stops: 0, competitor_cash_price: null })

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
