/**
 * Skip Saver / basic economy (migration 013). Run with:
 *   npx tsx lib/__tests__/exclude-basic.test.mts
 *
 * What must hold: when a watch skips Saver, EVERY SerpApi request for it
 * carries exclude_basic=true — the all-Alaska search, the unfiltered rival
 * search, the pinned search and the pinned return — so the tracked price,
 * the rival and Google's history all describe the same kind of fare (one
 * search without it would mix a $224 Saver fare into a $274 Main series).
 * Watches that don't skip Saver send nothing new. The choice exists only
 * where SerpApi supports it (US domestic economy), and the labels say so.
 * fetch is stubbed; no network.
 */

import formatModule from '../format.ts'
import airportsModule from '../airports.ts'
import emailModule from '../email.ts'
import providerModule from '../flights/serpapi-provider.ts'

const { formatWatchLimits, pinPrefillParams } = formatModule as unknown as typeof import('../format.ts')
const { canExcludeBasic } = airportsModule as unknown as typeof import('../airports.ts')
const { tripDetailLine } = emailModule as unknown as typeof import('../email.ts')
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

// ── Where the choice exists ───────────────────────────────────────────
check('SEA→LAS economy: yes', canExcludeBasic('SEA', 'LAS', 'economy'), true)
check('LAS→PAE economy: yes (both active watches qualify)', canExcludeBasic('LAS', 'PAE', 'economy'), true)
check('Alaska and Hawaii count as US (ANC→HNL)', canExcludeBasic('ANC', 'HNL', 'economy'), true)
check('lower case / spaces tolerated', canExcludeBasic(' sea', 'las ', 'economy'), true)
check('SEA→PVR (Mexico): no', canExcludeBasic('SEA', 'PVR', 'economy'), false)
check('SEA→YVR (Canada): no', canExcludeBasic('SEA', 'YVR', 'economy'), false)
check('business: no', canExcludeBasic('SEA', 'LAS', 'business'), false)
check('premium economy: no', canExcludeBasic('SEA', 'LAS', 'premium_economy'), false)
check('unknown code: no (never guess)', canExcludeBasic('ZZZ', 'LAS', 'economy'), false)

// ── Labels ────────────────────────────────────────────────────────────
check('label: pinned + no Saver',
  formatWatchLimits({ max_stops: null, outbound_flights: ['AS96', 'AS2018'], exclude_basic: true }), 'AS 96 + AS 2018 only · no Saver')
check('label: nonstop + no Saver', formatWatchLimits({ max_stops: 0, exclude_basic: true }), 'nonstop only · no Saver')
check('label: only no Saver', formatWatchLimits({ max_stops: null, exclude_basic: true }), 'no Saver')
check('label: unchanged without it', formatWatchLimits({ max_stops: null, exclude_basic: false }), null)
check('email detail line says no Saver',
  tripDetailLine({ id: 'w', origin: 'SEA', destination: 'LAS', depart_date: '2027-03-15', return_date: null, cabin_class: 'economy',
    max_stops: null, outbound_flights: ['AS96', 'AS2018'], exclude_basic: true }),
  '2027-03-15 (one-way) · economy · AS 96 + AS 2018 only · no Saver')
const w = { origin: 'SEA', destination: 'LAS', depart_date: '2027-03-15', return_date: null, cabin_class: 'economy' }
check('"Watch just this flight" keeps no Saver', pinPrefillParams({ ...w, exclude_basic: true }, { flight_number: 'AS96', legs: [{ flight: 'AS96' }, { flight: 'AS2018' }] })?.nosaver, '1')
check('…and adds nothing otherwise', pinPrefillParams(w, { flight_number: 'AS96' })?.nosaver, undefined)

// ── Every request carries it ──────────────────────────────────────────
const itin = (price: number, token: string | null, ...flights: [string, string][]) => ({
  price, total_duration: 300, ...(token ? { departure_token: token } : {}),
  flights: flights.map(([airline, flight_number]) => ({ airline, flight_number, departure_airport: { id: 'X' }, arrival_airport: { id: 'Y' } })),
})
let requests: { basic: string | null; airlines: string | null; token: string | null }[] = []
;(globalThis as any).fetch = async (u: string) => {
  const q = new URL(u).searchParams
  requests.push({ basic: q.get('exclude_basic'), airlines: q.get('include_airlines'), token: q.get('departure_token') })
  const body = q.get('departure_token')
    ? { best_flights: [itin(320, null, ['Alaska', 'AS 2017'])] }
    : { best_flights: [
        // include_airlines=AS: Google returns Alaska only (as the real API does)
        ...(q.get('include_airlines') === 'AS' ? [] : [itin(205, 'tok-f9', ['Frontier', 'F9 2408'])]),
        itin(274, 'tok-96', ['Alaska', 'AS 96'], ['Alaska', 'AS 2018']),
        itin(264, 'tok-612', ['Alaska', 'AS 612']),
      ] }
  return { ok: true, status: 200, text: async () => '', json: async () => body }
}
const p = new SerpApiFlightProvider()
const base = { origin: 'SEA', destination: 'LAS', departDate: '2027-03-15', returnDate: null, cabinClass: 'economy' as const }

requests = []
const allAlaska = await p.getCheapestFare({ ...base, fareScope: 'alaska_only', excludeBasic: true })
check('all-Alaska: both searches (AS-only + rival) skip Saver', requests.map((r) => [r.airlines, r.basic]), [['AS', 'true'], [null, 'true']])
check('all-Alaska: price is the Main fare, rival the non-basic Frontier fare', [allAlaska?.cashPrice, allAlaska?.competitorAirline], [264, 'Frontier'])

requests = []
const pinned = await p.getCheapestFare({ ...base, outboundFlights: ['AS96', 'AS2018'], excludeBasic: true })
check('pinned one-way: the search skips Saver', requests.map((r) => r.basic), ['true'])
check('pinned: AS 96 + AS 2018 at the Main price', pinned?.cashPrice, 274)

requests = []
await p.getCheapestFare({ ...base, returnDate: '2027-03-17', outboundFlights: ['AS96', 'AS2018'], returnFlights: ['AS2017'], excludeBasic: true })
check('pinned round trip: outbound AND return searches skip Saver', requests.map((r) => [r.token, r.basic]), [[null, 'true'], ['tok-96', 'true']])

requests = []
await p.getCheapestFare({ ...base, fareScope: 'alaska_only' })
await p.getCheapestFare({ ...base, outboundFlights: ['AS96', 'AS2018'] })
check('without it: no request sends exclude_basic', requests.every((r) => r.basic === null) && requests.length === 3, true)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
