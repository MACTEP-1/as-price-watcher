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
 * Two queries rather than one: PostgREST can nest itineraries into watches
 * cheaply, but price history is fetched separately and joined in memory so
 * that a watch with hundreds of checks doesn't multiply rows across the
 * result set.
 */
export async function getWatchesWithPrices(
  supabase: any,
  userId: string,
  statuses: WatchStatus[] = ['active']
): Promise<WatchWithLatestPrice[]> {
  const { data: watchRows, error: watchError } = await supabase
    .from('watches')
    .select(
      'id, user_id, status, created_at, itinerary_id, itineraries(*)'
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

  const { data: checkRows, error: checkError } = await supabase
    .from('price_checks')
    .select('*')
    .in('itinerary_id', itineraryIds)
    .order('checked_at', { ascending: true })

  if (checkError) throw new Error(checkError.message)

  const checks = (checkRows ?? []) as PriceCheck[]

  // Bucket once, rather than filtering the full array per watch.
  const byItinerary = new Map<string, PriceCheck[]>()
  for (const c of checks) {
    const list = byItinerary.get(c.itinerary_id)
    if (list) list.push(c)
    else byItinerary.set(c.itinerary_id, [c])
  }

  return watches
    .filter((w) => oneItinerary(w.itineraries) !== null)
    .map((w) => {
      const itin = oneItinerary(w.itineraries) as Itinerary
      const history = byItinerary.get(w.itinerary_id) ?? []
      const latest = history[history.length - 1]
      const prev = history[history.length - 2]

      return {
        id: w.id,
        user_id: w.user_id,
        status: w.status,
        created_at: w.created_at,

        itinerary_id: w.itinerary_id,
        origin: itin.origin,
        destination: itin.destination,
        depart_date: itin.depart_date,
        return_date: itin.return_date,
        cabin_class: itin.cabin_class,

        latest_cash: latest?.cash_price ?? null,
        latest_miles: latest?.miles_price ?? null,
        prev_cash: prev?.cash_price ?? null,
        prev_miles: prev?.miles_price ?? null,
        price_history: history.slice(-SPARKLINE_POINTS),
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
    .select('id, user_id, status, created_at, itinerary_id, itineraries(*)')
    .eq('id', watchId)
    .eq('user_id', userId)
    .single()

  if (!row) return null

  const w = row as WatchRow
  const itin = oneItinerary(w.itineraries)
  if (!itin) return null

  const { data: checkRows } = await supabase
    .from('price_checks')
    .select('*')
    .eq('itinerary_id', w.itinerary_id)
    .order('checked_at', { ascending: true })
    .limit(historyLimit)

  const checks = (checkRows ?? []) as PriceCheck[]
  const latest = checks[checks.length - 1]
  const prev = checks[checks.length - 2]

  return {
    watch: {
      id: w.id,
      user_id: w.user_id,
      status: w.status,
      created_at: w.created_at,

      itinerary_id: w.itinerary_id,
      origin: itin.origin,
      destination: itin.destination,
      depart_date: itin.depart_date,
      return_date: itin.return_date,
      cabin_class: itin.cabin_class,

      latest_cash: latest?.cash_price ?? null,
      latest_miles: latest?.miles_price ?? null,
      prev_cash: prev?.cash_price ?? null,
      prev_miles: prev?.miles_price ?? null,
      price_history: checks.slice(-SPARKLINE_POINTS),
    },
    checks,
  }
}
