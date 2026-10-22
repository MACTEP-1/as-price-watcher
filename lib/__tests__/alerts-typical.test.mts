/**
 * "Back to normal after a spike" is not a price drop (lib/alerts.ts,
 * typicalPrice). Run with:
 *   npx tsx lib/__tests__/alerts-typical.test.mts
 *
 * Replays REAL price series through evaluateAlerts the way the cron does —
 * one evaluation per check, the 24h throttle, and lastReported updated only
 * when an alert fires — and checks which alerts come out. Against the
 * pre-fix code the SEA→TPA series reproduces production's real 10/14
 * "dropped 17%" alert for $678, the route's ordinary price after six days
 * at $852–908; it must no longer fire. The real new lows on 09/30 and
 * 10/05, and GVA→SEA's one-day Business dips well under its usual price,
 * must still fire.
 */

import alertsModule from '../alerts.ts'

const { evaluateAlerts } = alertsModule as unknown as typeof import('../alerts.ts')

// epoch seconds : cash : miles — exported from production price_checks 2026-10-22
const SEA_TPA =
  '1790100094:686:12500 1790168831:675:12500 1790255229:670:12500 1790341626:666:12500 1790428026:665:12500 1790514426:665:12500 1790600826:665:12500 1790687228:665:12500 1790773627:614:12500 1790860027:614:12500 1790946426:614:12500 1791032827:665:12500 1791119227:1047:12500 1791205625:558:12500 1791292026:691:12500 1791378426:775:12500 1791464826:746:12500 1791551225:662:17500 1791637628:908:17500 1791724029:908:17500 1791810426:852:17500 1791896825:852:17500 1791983225:678:17500 1792069626:678:17500 1792156025:679:17500 1792242428:861:17500 1792328826:871:17500 1792415226:679:17500 1792501626:679:17500 1792588026:679:17500 1792674427:688:17500'
const GVA_SEA =
  '1790121706:2442: 1790168831:2424: 1790255229:3532: 1790341627:5663: 1790428027:5664: 1790514427:5664: 1790600827:5638: 1790687228:5679: 1790773628:5671: 1790860027:5665: 1790946430:5720: 1791032827:5698: 1791119226:5698: 1791205628:5694: 1791292025:3303: 1791378431:6602: 1791464830:6420: 1791551227:6623: 1791637625:6632: 1791724026:6632: 1791810427:6608: 1791896829:3713: 1791983232::'

function parse(rows: string) {
  return rows.split(' ').map((r, i) => {
    const [ts, cash, miles] = r.split(':')
    return {
      id: `c${i}`,
      itinerary_id: 'x',
      checked_at: new Date(Number(ts) * 1000).toISOString(),
      cash_price: cash ? Number(cash) : null,
      cash_currency: 'USD',
      miles_price: miles ? Number(miles) : null,
      airline: null,
      flight_number: null,
      duration_minutes: null,
      stops: null,
    }
  }) as never as import('../../types/index.ts').PriceCheck[]
}

/** The cron's loop, minus the network: returns "MM-DD type price" per alert. */
function replay(rows: string): string[] {
  const checks = parse(rows)
  let last: { cashPrice: number | null; milesPrice: number | null; reportedAt: string } | null = null
  const out: string[] = []
  for (let i = 1; i < checks.length; i++) {
    const now = new Date(checks[i].checked_at).getTime()
    // cron: skip when the last alert is newer than (run start − 24h)
    if (last && new Date(last.reportedAt).getTime() >= now - 24 * 3600e3 - 120e3) continue
    const t = evaluateAlerts(checks.slice(0, i + 1), last)
    if (!t) continue
    last = { cashPrice: t.cashPrice, milesPrice: t.milesPrice, reportedAt: checks[i].checked_at }
    out.push(`${checks[i].checked_at.slice(5, 10)} ${t.type} ${t.cashPrice}`)
  }
  return out
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

check('SEA→TPA: real new lows still fire, the 10/14 back-to-normal $678 does not',
  replay(SEA_TPA), ['09-30 new_low 614', '10-05 new_low 558'])

check('GVA→SEA: one-day dips far under the usual price still fire',
  replay(GVA_SEA), ['10-06 drop_10pct 3303', '10-13 drop_10pct 3713'])

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
