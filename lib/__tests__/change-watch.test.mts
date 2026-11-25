/**
 * "Change…" on a watch page (lib/format.ts watchFormParams). Run with:
 *   npx tsx lib/__tests__/change-watch.test.mts
 *
 * The link pre-fills the new-watch form with everything that defines the
 * watch; saving creates the edited watch and archives the old one. What
 * must hold: reading the parameters back the way BOTH forms do gives the
 * watch's exact settings — so "Change…" then "Save" with one thing altered
 * changes only that thing (e.g. LAS→PAE AS 2024 + AS 1368, Saver → no
 * Saver, 11/25), and an untouched save is the same itinerary (which the API
 * refuses as "Nothing changed" instead of archiving the original).
 */
import formatModule from '../format.ts'
const { watchFormParams, parseStopsParam, parseFlightList } = formatModule as unknown as typeof import('../format.ts')

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

const base = {
  id: '6b0f8a8e-0000-4000-8000-000000000001',
  origin: 'LAS', destination: 'PAE', depart_date: '2027-03-17', return_date: null as string | null,
  cabin_class: 'economy', max_stops: null as number | null, fare_scope: 'alaska_only',
  outbound_flights: ['AS2024', 'AS1368'] as string[] | null, return_flights: null as string[] | null, exclude_basic: false,
}

check('pinned one-way: every field, plus replaces', watchFormParams(base), {
  replaces: base.id, from: 'LAS', to: 'PAE', depart: '2027-03-17', cabin: 'economy', out: 'AS 2024 + AS 1368', scope: 'alaska_only',
})
check('no Saver carried', watchFormParams({ ...base, exclude_basic: true }).nosaver, '1')
check('round trip with pinned return', watchFormParams({ ...base, return_date: '2027-03-20', return_flights: ['AS2017'] }),
  { replaces: base.id, from: 'LAS', to: 'PAE', depart: '2027-03-17', cabin: 'economy', return: '2027-03-20', out: 'AS 2024 + AS 1368', ret: 'AS 2017', scope: 'alaska_only' })
check('unpinned nonstop: stops=0, no flights',
  watchFormParams({ ...base, outbound_flights: null, max_stops: 0, fare_scope: 'alaska_leg' }),
  { replaces: base.id, from: 'LAS', to: 'PAE', depart: '2027-03-17', cabin: 'economy', stops: '0', scope: 'alaska_leg' })
check('unpinned any stops: no stops param', watchFormParams({ ...base, outbound_flights: null }).stops, undefined)
check('pinned watch never sends a stop limit (the flights decide)', watchFormParams({ ...base, max_stops: 0 }).stops, undefined)

// Round trip through what the forms do with the parameters.
function readBack(p: Record<string, string>) {
  return {
    origin: p.from, destination: p.to, departDate: p.depart, returnDate: p.return ?? null, cabinClass: p.cabin,
    maxStops: parseStopsParam(p.stops),
    fareScope: p.scope === 'alaska_leg' ? 'alaska_leg' : 'alaska_only',
    outboundFlights: p.out ? parseFlightList(p.out) : null,
    returnFlights: p.ret ? parseFlightList(p.ret) : null,
    excludeBasic: p.nosaver === '1',
    replacesWatchId: p.replaces,
  }
}
check('read back = the watch exactly', readBack(watchFormParams({ ...base, exclude_basic: true })), {
  origin: 'LAS', destination: 'PAE', departDate: '2027-03-17', returnDate: null, cabinClass: 'economy', maxStops: null,
  fareScope: 'alaska_only', outboundFlights: ['AS2024', 'AS1368'], returnFlights: null, excludeBasic: true, replacesWatchId: base.id,
})
check('read back: nonstop unpinned keeps 0 (not "any")',
  readBack(watchFormParams({ ...base, outbound_flights: null, max_stops: 0 })).maxStops, 0)

check('stops param: "1" → 1', parseStopsParam('1'), 1)
check('stops param: junk → any', parseStopsParam('7'), null)
check('stops param: missing → any', parseStopsParam(undefined), null)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
