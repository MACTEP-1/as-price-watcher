/**
 * Stop limit (migration 006). Run with:
 *   npx tsx lib/__tests__/stop-limit.test.mts
 *
 * The easy thing to get wrong is the off-by-one between our max_stops and
 * SerpApi's `stops` parameter, where THEIR 0 means "any" and 1 means
 * "nonstop only". Getting it wrong fails silently: a nonstop-only watch
 * would quietly track one-stop fares, or an any-stops watch would get
 * restricted. So this captures the real request URL the provider builds.
 * Also covers the display helpers. No network: fetch is stubbed.
 */

import providerModule from '../flights/serpapi-provider.ts'
import formatModule from '../format.ts'

const { SerpApiFlightProvider } = providerModule as unknown as {
  SerpApiFlightProvider: typeof import('../flights/serpapi-provider.ts').SerpApiFlightProvider
}
const { formatStopLimit, milesScope } = formatModule as unknown as {
  formatStopLimit: typeof import('../format.ts').formatStopLimit
  milesScope: typeof import('../format.ts').milesScope
}

process.env.SERPAPI_KEY = 'test-key'

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

let lastUrl = ''
;(globalThis as any).fetch = async (url: string) => {
  lastUrl = url
  return {
    ok: true,
    json: async () => ({
      best_flights: [{ price: 300, total_duration: 300, flights: [{ airline: 'Alaska Airlines', flight_number: 'AS 1' }] }],
    }),
    text: async () => '',
  }
}

async function stopsParamFor(maxStops: number | null | undefined) {
  await new SerpApiFlightProvider().getCheapestFare({
    origin: 'SEA',
    destination: 'TPA',
    departDate: '2026-11-10',
    cabinClass: 'economy',
    maxStops,
  })
  return new URL(lastUrl).searchParams.get('stops')
}

check('max_stops null → no stops param (SerpApi default = any)', await stopsParamFor(null), null)
check('max_stops undefined (old callers) → no stops param', await stopsParamFor(undefined), null)
check('max_stops 0 → stops=1 (SerpApi "nonstop only")', await stopsParamFor(0), '1')
check('max_stops 1 → stops=2 (SerpApi "1 stop or fewer")', await stopsParamFor(1), '2')
check('max_stops 2 → stops=3 (SerpApi "2 stops or fewer")', await stopsParamFor(2), '3')

check('formatStopLimit(null) → nothing printed', formatStopLimit(null), null)
check('formatStopLimit(0)', formatStopLimit(0), 'nonstop only')
check('formatStopLimit(1)', formatStopLimit(1), 'up to 1 stop')
check('formatStopLimit(2)', formatStopLimit(2), 'up to 2 stops')

check('milesScope: one-way trip, any stops → no qualifier', milesScope({ return_date: null, max_stops: null }), '')
check('milesScope: round trip → one-way', milesScope({ return_date: '2026-11-15', max_stops: null }), ' · one-way')
check('milesScope: stop limit → any stops (miles unfiltered)', milesScope({ return_date: null, max_stops: 0 }), ' · any stops')
check('milesScope: both', milesScope({ return_date: '2026-11-15', max_stops: 1 }), ' · one-way · any stops')
check('milesScope: max_stops absent (older shape) → treated as any', milesScope({ return_date: null }), '')

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
