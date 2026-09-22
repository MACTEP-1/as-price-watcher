/**
 * Competitor-price extraction in lib/flights/serpapi-provider.ts
 * (migration 004). Run with:
 *   npx tsx lib/__tests__/competitor-price.test.mts
 *
 * Stubs global fetch with canned SerpApi payloads — no network, no quota,
 * no API key needed beyond a dummy one. The question under test is only
 * "which itinerary, if any, counts as the cheaper rival", which is easy to
 * get subtly wrong: the fallback case (route with no Alaska service) must
 * NOT report the very itinerary it is already tracking as its own rival.
 */

import providerModule from '../flights/serpapi-provider.ts'

const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}

process.env.SERPAPI_KEY = 'test-key'
delete process.env.SERPAPI_STRICT_AS

const leg = (airline: string, flightNumber: string) => ({
  airline,
  flight_number: flightNumber,
})

function stubFetch(payload: unknown) {
  ;(globalThis as any).fetch = async () => ({
    ok: true,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })
}

const params = {
  origin: 'SEA',
  destination: 'TPA',
  departDate: '2026-11-10',
  returnDate: '2026-11-15',
  cabinClass: 'economy' as const,
}

let failures = 0
async function check(
  name: string,
  payload: unknown,
  want: { cash: number | null; rival: number | null; airline: string | null }
) {
  stubFetch(payload)
  const got = await new SerpApiFlightProvider().getCheapestFare(params)
  const ok =
    (got?.cashPrice ?? null) === want.cash &&
    (got?.competitorCashPrice ?? null) === want.rival &&
    (got?.competitorAirline ?? null) === want.airline
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}\n     got  cash=${got?.cashPrice ?? null} rival=${got?.competitorCashPrice ?? null} (${got?.competitorAirline ?? null})` +
      `\n     want cash=${want.cash} rival=${want.rival} (${want.airline})`
  )
}

// The real SEA→TPA Nov 10–15 shape: Alaska nonstop $686, United $427.
await check(
  'cheaper rival is reported',
  {
    best_flights: [
      { price: 427, total_duration: 448, flights: [leg('United', 'UA 1234')] },
      { price: 686, total_duration: 327, flights: [leg('Alaska Airlines', 'AS 326')] },
    ],
  },
  { cash: 686, rival: 427, airline: 'United' }
)

await check(
  'Alaska already cheapest -> no rival reported',
  {
    best_flights: [
      { price: 300, total_duration: 327, flights: [leg('Alaska Airlines', 'AS 326')] },
      { price: 480, total_duration: 448, flights: [leg('Delta', 'DL 99')] },
    ],
  },
  { cash: 300, rival: null, airline: null }
)

// No Alaska service: the provider falls back to the cheapest of any airline,
// so that fare IS what's tracked — it must not be reported against itself.
await check(
  'no Alaska on the route -> fallback fare is not its own rival',
  {
    best_flights: [
      { price: 512, total_duration: 400, flights: [leg('United', 'UA 55')] },
      { price: 640, total_duration: 380, flights: [leg('Delta', 'DL 12')] },
    ],
  },
  { cash: 512, rival: null, airline: null }
)

await check(
  'equal price is not "cheaper"',
  {
    best_flights: [
      { price: 500, total_duration: 327, flights: [leg('Alaska Airlines', 'AS 326')] },
      { price: 500, total_duration: 448, flights: [leg('United', 'UA 1234')] },
    ],
  },
  { cash: 500, rival: null, airline: null }
)

// other_flights is merged with best_flights before any of this runs.
await check(
  'rival found in other_flights too',
  {
    best_flights: [
      { price: 686, total_duration: 327, flights: [leg('Alaska Airlines', 'AS 326')] },
    ],
    other_flights: [
      { price: 399, total_duration: 500, flights: [leg('Southwest', 'WN 7')] },
    ],
  },
  { cash: 686, rival: 399, airline: 'Southwest' }
)

// Airline name missing — fall back to the carrier code from the flight number.
await check(
  'airline name missing -> carrier code used',
  {
    best_flights: [
      { price: 686, total_duration: 327, flights: [leg('Alaska Airlines', 'AS 326')] },
      { price: 405, total_duration: 500, flights: [{ flight_number: 'B6 22' }] },
    ],
  },
  { cash: 686, rival: 405, airline: 'B6' }
)

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
