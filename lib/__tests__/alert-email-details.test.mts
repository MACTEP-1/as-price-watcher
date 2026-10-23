/**
 * The alert email says WHICH fare it is about. Run with:
 *   npx tsx lib/__tests__/alert-email-details.test.mts
 *
 * Before this, a pinned watch (AS 679 / AS 268) and a nonstop-only watch
 * sent the same email as an any-flight watch on that route: "SEA → PVR,
 * 2026-12-01 → 2026-12-08 · economy", which reads as "the cheapest fare on
 * the route" — not the price of the flights the user picked. And the miles
 * row didn't say that seats.aero ignores the pin and the stop limit.
 * No network: only the HTML builder is exercised.
 */

import emailModule from '../email.ts'

const { tripDetailLine, buildEmailHtml } = emailModule as unknown as {
  tripDetailLine: typeof import('../email.ts').tripDetailLine
  buildEmailHtml: typeof import('../email.ts').buildEmailHtml
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const base = {
  id: 'w1',
  origin: 'SEA',
  destination: 'PVR',
  depart_date: '2026-12-01',
  return_date: '2026-12-08',
  cabin_class: 'economy' as const,
}

// The detail line under the route.
check('pinned round trip names both flights',
  tripDetailLine({ ...base, max_stops: null, outbound_flights: ['AS679'], return_flights: ['AS268'] }),
  '2026-12-01 → 2026-12-08 · economy · AS 679 / AS 268 only')
check('pinned outbound only',
  tripDetailLine({ ...base, max_stops: null, outbound_flights: ['AS326', 'AS1234'], return_flights: null }),
  '2026-12-01 → 2026-12-08 · economy · AS 326 + AS 1234 only')
check('nonstop-only watch',
  tripDetailLine({ ...base, max_stops: 0 }),
  '2026-12-01 → 2026-12-08 · economy · nonstop only')
check('up to 1 stop, one-way',
  tripDetailLine({ ...base, return_date: null, max_stops: 1 }),
  '2026-12-01 (one-way) · economy · up to 1 stop')
check('no limits → unchanged from before',
  tripDetailLine({ ...base, max_stops: null }),
  '2026-12-01 → 2026-12-08 · economy')
check('caller without the new fields → unchanged from before',
  tripDetailLine(base),
  '2026-12-01 → 2026-12-08 · economy')
check('cabin underscore still prettified',
  tripDetailLine({ ...base, cabin_class: 'premium_economy' as never, max_stops: 0 }),
  '2026-12-01 → 2026-12-08 · premium economy · nonstop only')

// The whole email.
const trigger = {
  type: 'new_low' as const,
  cashPrice: 584, milesPrice: 25000,
  prevCashPrice: 610, prevMilesPrice: 30000,
  baselineCashPrice: 610, baselineMilesPrice: 30000,
  triggeredBy: 'cash' as const,
}
const pinnedHtml = buildEmailHtml({
  watch: { ...base, max_stops: null, outbound_flights: ['AS679'], return_flights: ['AS268'] },
  trigger, alertId: 'a1',
})
check('pinned email shows the flights in the banner', pinnedHtml.includes('economy · AS 679 / AS 268 only</span>'), true)
check('pinned email: miles row says seats.aero ignores the pin', pinnedHtml.includes('Miles price · one-way · any flight</td>'), true)

const nonstopHtml = buildEmailHtml({ watch: { ...base, max_stops: 0 }, trigger, alertId: 'a1' })
check('nonstop email shows the limit', nonstopHtml.includes('economy · nonstop only</span>'), true)
check('nonstop email: miles row says any stops', nonstopHtml.includes('Miles price · one-way · any stops</td>'), true)

const plainHtml = buildEmailHtml({ watch: { ...base, return_date: null }, trigger, alertId: 'a1' })
check('plain one-way email: no qualifiers at all', plainHtml.includes('(one-way) · economy</span>') && plainHtml.includes('Miles price</td>'), true)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
