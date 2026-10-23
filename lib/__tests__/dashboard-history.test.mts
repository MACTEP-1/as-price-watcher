/**
 * Dashboard cards stay current however long a watch runs
 * (lib/watches.ts getWatchesWithPrices). Run with:
 *   npx tsx lib/__tests__/dashboard-history.test.mts
 *
 * PostgREST returns at most 1000 rows per request. The dashboard used to
 * load every check of every watched itinerary in ONE oldest-first request,
 * so past 1000 rows it was the NEWEST prices that got cut — cards showing a
 * stale price with no error. A fake Supabase client below enforces the same
 * 1000-row cap, so this test fails on the old query and passes on the new.
 */

import watchesModule from '../watches.ts'

const { getWatchesWithPrices } = watchesModule as unknown as typeof import('../watches.ts')

const CAP = 1000 // PostgREST's default max rows

/** Just enough of supabase-js's query builder for lib/watches.ts. */
function fakeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: ((r: any) => boolean)[] = []
      let order: { key: string; asc: boolean } | null = null
      let limit = Infinity
      let count = false
      let head = false
      const q: any = {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          count = !!opts?.count
          head = !!opts?.head
          return q
        },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return q },
        order(k: string, o: { ascending: boolean }) { order = { key: k, asc: o.ascending }; return q },
        limit(n: number) { limit = n; return q },
        then(resolve: (v: unknown) => void) {
          let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
          const total = rows.length
          if (order) {
            const { key, asc } = order
            rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (asc ? 1 : -1))
          }
          rows = rows.slice(0, Math.min(limit, CAP))
          resolve({ data: head ? null : rows, count: count ? total : null, error: null })
        },
      }
      return q
    },
  }
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

const itinerary = {
  id: 'itin-1', origin: 'SEA', destination: 'PVR', depart_date: '2027-01-07', return_date: '2027-01-11',
  cabin_class: 'economy', max_stops: null, fare_scope: 'alaska_only', created_at: '2026-01-01',
}
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString()
// 1,440 days of Google history, then 60 own checks: 1,500 rows, newest priced $500 + n.
const rows = [
  ...Array.from({ length: 1440 }, (_, n) => ({ id: `g${n}`, itinerary_id: 'itin-1', checked_at: day(n), cash_price: 900, miles_price: null, source: 'google_history' })),
  ...Array.from({ length: 60 }, (_, n) => ({ id: `c${n}`, itinerary_id: 'itin-1', checked_at: day(1440 + n), cash_price: 500 + n, miles_price: 12500, source: 'check' })),
]
const supabase = fakeSupabase({
  watches: [{ id: 'w1', user_id: 'u1', status: 'active', created_at: '2026-01-01', status_changed_at: '2026-01-01', itinerary_id: 'itin-1', itineraries: itinerary }],
  price_checks: rows,
})

const [card] = await getWatchesWithPrices(supabase, 'u1')
check('latest price is the newest check, even with 1,500 rows', card.latest_cash, 559)
check('previous price is the one before it', card.prev_cash, 558)
check('sparkline: the newest 14 points, oldest first',
  card.price_history.map((c) => c.cash_price), [546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559])
check('counts cover the full history', card.check_counts, { own: 60, google: 1440 })

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
