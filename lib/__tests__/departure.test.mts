/**
 * When a watch's departure day is over (lib/departure.ts). Run with:
 *   npx tsx lib/__tests__/departure.test.mts
 *
 * Two ways to get this wrong, both seen for real:
 *  - too EARLY: retiring a watch while its flight is still bookable
 *    somewhere (the original `new Date(depart_date)` bug — 5pm the previous
 *    day in Pacific);
 *  - too LATE: one more daily run that spends a SerpApi search on a trip
 *    that has left everywhere (ZRH→SEA and GVA→SEA, departing 10/13, were
 *    still checked at 13:07 UTC on 10/14).
 * The boundary is (D+1) 12:00 UTC: midnight at UTC−12, the last place
 * date D ends.
 */

import departureModule from '../departure.ts'

const { isDepartureDayOver } = departureModule as unknown as {
  isDepartureDayOver: typeof import('../departure.ts').isDepartureDayOver
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const at = (iso: string) => new Date(iso)

// The real case that prompted this.
check('ZRH/GVA 10/13 at the 10/14 13:07 UTC run → over (no SerpApi call)',
  isDepartureDayOver('2026-10-13', at('2026-10-14T13:07:00Z')), true)

// Never too early.
check('departure day itself, 13:07 UTC run → not over',
  isDepartureDayOver('2026-10-13', at('2026-10-13T13:07:00Z')), false)
check('11pm Pacific on the departure day (06:00 UTC next day) → not over',
  isDepartureDayOver('2026-10-13', at('2026-10-14T06:00:00Z')), false)
check('still the departure day at UTC−12 (11:59:59 UTC next day) → not over',
  isDepartureDayOver('2026-10-13', at('2026-10-14T11:59:59Z')), false)
check('first instant it is over everywhere (12:00 UTC next day) → over',
  isDepartureDayOver('2026-10-13', at('2026-10-14T12:00:00Z')), true)

// Ordinary cases.
check('future trip → not over',
  isDepartureDayOver('2026-11-10', at('2026-10-20T13:07:00Z')), false)
check('two days later → over',
  isDepartureDayOver('2026-10-13', at('2026-10-15T13:07:00Z')), true)

// Date arithmetic across month and year boundaries.
check('month boundary: 10/31 at 11/01 11:59 UTC → not over',
  isDepartureDayOver('2026-10-31', at('2026-11-01T11:59:00Z')), false)
check('month boundary: 10/31 at 11/01 12:00 UTC → over',
  isDepartureDayOver('2026-10-31', at('2026-11-01T12:00:00Z')), true)
check('year boundary: 12/31 at 01/01 11:59 UTC → not over',
  isDepartureDayOver('2026-12-31', at('2027-01-01T11:59:00Z')), false)
check('year boundary: 12/31 at 01/01 12:00 UTC → over',
  isDepartureDayOver('2026-12-31', at('2027-01-01T12:00:00Z')), true)

// Defaults to the current time.
check('no `now` given: yesterday-of-yesterday is over',
  isDepartureDayOver(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)), true)
check('no `now` given: tomorrow is not over',
  isDepartureDayOver(new Date(Date.now() + 86400000).toISOString().slice(0, 10)), false)

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
