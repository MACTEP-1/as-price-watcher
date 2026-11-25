/**
 * What the card says when the latest check found no fare. Run with:
 *   npx tsx lib/__tests__/missing-fare.test.mts
 *
 * Real case, 11/25: SEA→LAS 3/15 pinned to AS 96 + AS 2018 stored a check
 * with no price, no flight and stops = 0 (the row builder's default). The
 * card showed a blank price, "Not enough data yet" and a bare "nonstop".
 */
import formatModule from '../format.ts'
const { formatItineraryLine, formatMissingFare } = formatModule as unknown as {
  formatItineraryLine: typeof import('../format.ts').formatItineraryLine
  formatMissingFare: typeof import('../format.ts').formatMissingFare
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const empty = { cash_price: null, flight_number: null, stops: 0, duration_minutes: null, legs: null, source: 'check' }
const pinned = { outbound_flights: ['AS96', 'AS2018'], return_flights: null }

check('no fare found: no "nonstop" line', formatItineraryLine(empty), '')
check('a real fare still gets its line',
  formatItineraryLine({ flight_number: 'AS96', stops: 1, duration_minutes: 292, legs: null }), 'AS 96 · 1 stop · 4h 52m')
check('legs alone are enough for a line',
  formatItineraryLine({ flight_number: null, stops: 0, duration_minutes: 150, legs: [{ flight: 'AS326', from: 'SEA', to: 'TPA' }] }) !== '', true)

check('pinned, not found: names the flights', formatMissingFare(empty, pinned), 'AS 96 + AS 2018 not found on Google Flights at the last check')
check('pinned round trip names both directions',
  formatMissingFare(empty, { outbound_flights: ['AS679'], return_flights: ['AS268'] }), 'AS 679 / AS 268 not found on Google Flights at the last check')
check('unpinned, not found', formatMissingFare(empty, { outbound_flights: null }), 'No fare found at the last check')
check('price present → nothing', formatMissingFare({ ...empty, cash_price: 224 }, pinned), null)
check('price 0 is still a price', formatMissingFare({ ...empty, cash_price: 0 }, pinned), null)
check('no check yet → nothing', formatMissingFare(null, pinned), null)
check('Google history seed is not a failed check', formatMissingFare({ ...empty, source: 'google_history' }, pinned), null)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
