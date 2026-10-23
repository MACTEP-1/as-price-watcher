/**
 * Watch queries, shared by every client.
 *
 * This lives in lib/ rather than inside a server component on purpose: a
 * React Native app cannot reuse a server component, so logic left in
 * app/dashboard/page.tsx would have to be duplicated for mobile and would
 * then drift. Nothing here imports from `next/*`.
 *
 * The caller supplies its own Supabase client, so the same functions work
 * from a server component (cookies), an API route (cookies or Bearer), or
 * React Native (Bearer) — under the same RLS policies in every case.
 */

import type {
  Alert,
  PriceCheck,
  WatchWithLatestPrice,
  Itinerary,
  WatchStatus,
} from '@/types'

/** How many recent checks each card's sparkline gets. */
const SPARKLINE_POINTS = 14

/** Shape returned by the nested select below. */
interface WatchRow {
  id: string
  user_id: string
  status: WatchStatus
  created_at: string
  status_changed_at: string
  itinerary_id: string
  // PostgREST types a nested to-one relation as an array even though it
  // returns a single object. Normalise rather than trust either shape.
  itineraries: Itinerary | Itinerary[] | null
}

function oneItinerary(v: Itinerary | Itinerary[] | null): Itinerary | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Every watch for a user, with its itinerary flattened in and recent price
 * history attached.
 *
 * PostgREST nests itineraries into watches cheaply; price history is
 * fetched separately, per itinerary and bounded (see below), so a watch
 * with hundreds of checks neither multiplies rows across the result set
 * nor pushes anyone's newest prices past the 1000-row response cap.
 */
export async function getWatchesWithPrices(
  supabase: any,
  userId: string,
  statuses: WatchStatus[] = ['active']
): Promise<WatchWithLatestPrice[]> {
  const { data: watchRows, error: watchError } = await supabase
    .from('watches')
    .select(
      'id, user_id, status, created_at, status_changed_at, itinerary_id, itineraries(*)'
    )
    .eq('user_id', userId)
    .in('status', statuses)
    .order('created_at', { ascending: false })

  if (watchError) throw new Error(watchError.message)

  const watches = (watchRows ?? []) as WatchRow[]
  if (watches.length === 0) return []

  // Distinct, because several watches can share one itinerary — that is the
  // whole point of the itinerary table.
  const itineraryIds = [...new Set(watches.map((w) => w.itinerary_id))]

  // Per itinerary, in parallel: its newest SPARKLINE_POINTS checks, plus
  // exact counts of own checks and Google-history days.
  //
  // This used to be ONE query for every check of every itinerary, oldest
  // first and with no limit. PostgREST returns at most 1000 rows per
  // request, so past that the NEWEST rows were the ones cut off — cards
  // would quietly show stale prices with no error. Each all-Alaska watch
  // now brings ~60 days of seeded history (migration 011), so about 15
  // watches' worth of rows would have hit it. The card only ever needs the
  // last few points and two counts, so ask for exactly that: bounded no
  // matter how long a watch runs. (Same newest-first-then-reverse shape as
  // getWatchDetail and the cron, fixed 2026-10-22.)
  const perItinerary = await Promise.all(
    itineraryIds.map(async (itineraryId) => {
      const [recent, own, google] = await Promise.all([
        supabase
          .from('price_checks')
          .select('*')
          .eq('itinerary_id', itineraryId)
          .order('checked_at', { ascending: false })
          .limit(SPARKLINE_POINTS),
        supabase
          .from('price_checks')
          .select('id', { count: 'exact', head: true })
          .eq('itinerary_id', itineraryId)
          .eq('source', 'check'),
        supabase
          .from('price_checks')
          .select('id', { count: 'exact', head: true })
          .eq('itinerary_id', itineraryId)
          .eq('source', 'google_history'),
      ])
      for (const r of [recent, own, google]) {
        if (r.error) throw new Error(r.error.message)
      }
      return [
        itineraryId,
        {
          history: ((recent.data ?? []) as PriceCheck[]).reverse(),
          counts: { own: own.count ?? 0, google: google.count ?? 0 },
        },
      ] as const
    })
  )
  const byItinerary = new Map(perItinerary)

  return watches
    .filter((w) => oneItinerary(w.itineraries) !== null)
    .map((w) => {
      const itin = oneItinerary(w.itineraries) as Itinerary
      const entry = byItinerary.get(w.itinerary_id)
      const history = entry?.history ?? []
      const latest = history[history.length - 1]
      const prev = history[history.length - 2]

      return {
        id: w.id,
        user_id: w.user_id,
        status: w.status,
        created_at: w.created_at,
        status_changed_at: w.status_changed_at,

        itinerary_id: w.itinerary_id,
        origin: itin.origin,
        destination: itin.destination,
        depart_date: itin.depart_date,
        return_date: itin.return_date,
        cabin_class: itin.cabin_class,
        max_stops: itin.max_stops ?? null,
        outbound_flights: itin.outbound_flights ?? null,
        return_flights: itin.return_flights ?? null,

        latest_cash: latest?.cash_price ?? null,
        latest_miles: latest?.miles_price ?? null,
        prev_cash: prev?.cash_price ?? null,
        prev_miles: prev?.miles_price ?? null,
        price_history: history,
        // Counted by the database over the FULL history, not from the
        // trimmed sparkline points above.
        check_counts: entry?.counts ?? { own: 0, google: 0 },
      }
    })
}

/**
 * One watch with its full price history, for the detail page.
 * Returns null when the id doesn't exist or isn't the caller's — RLS makes
 * those indistinguishable, which is the correct behaviour.
 */
export async function getWatchDetail(
  supabase: any,
  watchId: string,
  userId: string,
  historyLimit = 90
): Promise<{ watch: WatchWithLatestPrice; checks: PriceCheck[] } | null> {
  const { data: row } = await supabase
    .from('watches')
    .select('id, user_id, status, created_at, status_changed_at, itinerary_id, itineraries(*)')
    .eq('id', watchId)
    .eq('user_id', userId)
    .single()

  if (!row) return null

  const w = row as WatchRow
  const itin = oneItinerary(w.itineraries)
  if (!itin) return null

  // Newest `historyLimit` rows, flipped to oldest → newest. Ascending +
  // limit would return the OLDEST rows instead, so past historyLimit checks
  // the "latest" price on the detail page would freeze — the same bug the
  // cron's history query had at 30 (fixed 2026-10-22).
  const { data: checkRows } = await supabase
    .from('price_checks')
    .select('*')
    .eq('itinerary_id', w.itinerary_id)
    .order('checked_at', { ascending: false })
    .limit(historyLimit)

  const checks = ((checkRows ?? []) as PriceCheck[]).reverse()
  const latest = checks[checks.length - 1]
  const prev = checks[checks.length - 2]

  return {
    watch: {
      id: w.id,
      user_id: w.user_id,
      status: w.status,
      created_at: w.created_at,
      status_changed_at: w.status_changed_at,

      itinerary_id: w.itinerary_id,
      origin: itin.origin,
      destination: itin.destination,
      depart_date: itin.depart_date,
      return_date: itin.return_date,
      cabin_class: itin.cabin_class,
        max_stops: itin.max_stops ?? null,
        outbound_flights: itin.outbound_flights ?? null,
        return_flights: itin.return_flights ?? null,

      latest_cash: latest?.cash_price ?? null,
      latest_miles: latest?.miles_price ?? null,
      prev_cash: prev?.cash_price ?? null,
      prev_miles: prev?.miles_price ?? null,
      price_history: checks.slice(-SPARKLINE_POINTS),
    },
    checks,
  }
}

/**
 * Real, server-evaluated alerts for a watch — the same rows the web detail
 * page renders as "Alert history". Extracted so mobile can show the same
 * thing instead of recomputing its own "new low" from raw price history,
 * which the web page never did and which had none of evaluateAlerts' noise
 * guards (see lib/alerts.ts's header comment for why those guards exist).
 * RLS on the alerts table scopes this to the caller's own rows already, but
 * the watchId filter is kept explicit rather than relied on implicitly.
 */
export async function getWatchAlerts(
  supabase: any,
  watchId: string,
  limit = 10
): Promise<Alert[]> {
  const { data } = await supabase
    .from('alerts')
    .select('*')
    .eq('watch_id', watchId)
    .order('triggered_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as Alert[]
}
