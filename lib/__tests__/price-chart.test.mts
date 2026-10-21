/**
 * Mobile price history chart geometry (mobile/lib/price-chart.ts). Run with:
 *   npx tsx lib/__tests__/price-chart.test.mts
 *
 * The parts that fail silently on a phone: a null price shifting every
 * later point left (x must follow the CHECK's position, not the value's),
 * a flat series dividing by zero and drawing nothing, a touch past either
 * edge selecting a check that doesn't exist, and axis labels that read
 * "17.5k" / "$679" rather than raw numbers.
 */

import chartModule from '../../mobile/lib/price-chart.ts'

const { buildSeries, xFor, yFor, nearestIndex, shortDate, cashTick, milesTick } =
  chartModule as unknown as typeof import('../../mobile/lib/price-chart.ts')

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const row = (cash: number | null, miles: number | null, at = '2026-10-21T13:07:00Z') =>
  ({ cash_price: cash, miles_price: miles, checked_at: at }) as never

const history = [row(700, 17500), row(null, 15000), row(650, null), row(679, 17500)]

const cash = buildSeries(history, 'cash_price')!
check('null cash skipped, indexes keep their place', cash.points.map((p) => p.index), [0, 2, 3])
check('cash range', [cash.min, cash.max], [650, 700])
const miles = buildSeries(history, 'miles_price')!
check('miles indexes', miles.points.map((p) => p.index), [0, 1, 3])

check('all-null column → null series', buildSeries([row(null, 1000)], 'cash_price'), null)
const flat = buildSeries([row(500, null), row(500, null)], 'cash_price')!
check('flat series padded around the value', [flat.min, flat.max], [475, 525])
check('flat series draws mid-height', yFor(500, flat, 10, 100), 60)

check('x: first check at left edge', xFor(0, 4, 40, 300), 40)
check('x: last check at right edge', xFor(3, 4, 40, 300), 340)
check('x: single check centred', xFor(0, 1, 40, 300), 190)
check('y: max at top', yFor(700, cash, 10, 100), 10)
check('y: min at bottom', yFor(650, cash, 10, 100), 110)

check('touch at far left → first', nearestIndex(0, 4, 40, 300), 0)
check('touch past right edge → last', nearestIndex(999, 4, 40, 300), 3)
check('touch near 2nd check', nearestIndex(150, 4, 40, 300), 1)
check('touch with one check', nearestIndex(150, 1, 40, 300), 0)

check('cash tick', cashTick(679.4), '$679')
check('cash tick thousands', cashTick(13427), '$13.4k')
check('miles tick 17.5k', milesTick(17500), '17.5k')
check('miles tick round k', milesTick(18000), '18k')
check('miles tick 6 figures', milesTick(125400), '125k')

// Local-time formatting: build the ISO string from local parts so the
// expectation holds in any timezone the test runs in.
const local = new Date(2026, 9, 21, 12, 0, 0)
check('short date', shortDate(local.toISOString()), 'Oct 21')

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
