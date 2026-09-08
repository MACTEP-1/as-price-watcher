// Scheduled price check — called by cron-job.org (13:00 UTC daily).
// Protected by CRON_SECRET.
//
// NOTE: there is deliberately no vercel.json. A leftover Vercel cron entry
// was double-firing at 00:00 UTC and doubling SerpApi usage. See CLAUDE.md.
//
// ── Grain ────────────────────────────────────────────────────────────────
// Prices are fetched and stored PER ITINERARY, so N users watching the same
// trip cost one search rather than N. Alerts are evaluated per itinerary but
// DELIVERED per watch — everyone subscribed to that itinerary gets their own
// email, and the 24h throttle is applied per watch.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getCheapestFare } from '@/lib/flights'
import { getCheapestMilesPrice } from '@/lib/miles'
import { evaluateAlerts } from '@/lib/alerts'
import { sendAlertEmail } from '@/lib/email'
import { mapWithConcurrency } from '@/lib/concurrency'
import type { PriceCheck, Itinerary } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

interface ActiveWatchRow {
  id: string
  user_id: string
  itinerary_id: string
  // PostgREST types a nested to-one relation as an array even though it
  // returns a single object. Normalise rather than cast past it.
  itineraries: Itinerary | Itinerary[] | null
}

function oneItinerary(v: Itinerary | Itinerary[] | null): Itinerary | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** One `byItinerary` map entry: [itineraryId, { itinerary, watchers }]. */
type ItineraryEntry = [string, { itinerary: Itinerary; watchers: ActiveWatchRow[] }]

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const results: Record<string, unknown>[] = []

  // Service-role client — bypasses RLS, so this sees every user's watches.
  const { data: watchRows, error: watchError } = await supabase
    .from('watches')
    .select('id, user_id, itinerary_id, itineraries(*)')
    .eq('status', 'active')

  if (watchError) {
    console.error('[cron] Failed to fetch watches:', watchError)
    return NextResponse.json({ error: watchError.message }, { status: 500 })
  }

  const watches = ((watchRows ?? []) as unknown as ActiveWatchRow[]).filter(
    (w) => oneItinerary(w.itineraries) !== null
  )

  if (watches.length === 0) {
    return NextResponse.json({ message: 'No active watches', checked: 0 })
  }

  // Collapse to distinct itineraries — this is where the saving happens.
  const byItinerary = new Map<string, { itinerary: Itinerary; watchers: ActiveWatchRow[] }>()
  for (const w of watches) {
    const entry = byItinerary.get(w.itinerary_id)
    if (entry) entry.watchers.push(w)
    else byItinerary.set(w.itinerary_id, {
      itinerary: oneItinerary(w.itineraries) as Itinerary,
      watchers: [w],
    })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // One itinerary's full cycle: expire-check, fetch, store, evaluate, deliver.
  // Returns its own result row rather than pushing to a shared array, so the
  // ordering stays deterministic once these run concurrently (see below).
  async function processItinerary([itineraryId, { itinerary, watchers }]: ItineraryEntry): Promise<
    Record<string, unknown>
  > {
    try {
      // ── Expire ──────────────────────────────────────────────────────
      if (new Date(itinerary.depart_date) < new Date()) {
        await supabase
          .from('watches')
          .update({ status: 'expired' })
          .eq('itinerary_id', itineraryId)
          .eq('status', 'active')
        return { itineraryId, status: 'expired', watchers: watchers.length }
      }

      // ── Fetch ───────────────────────────────────────────────────────
      const [cashResult, milesResult] = await Promise.allSettled([
        getCheapestFare({
          origin: itinerary.origin,
          destination: itinerary.destination,
          departDate: itinerary.depart_date,
          returnDate: itinerary.return_date,
          cabinClass: itinerary.cabin_class,
        }),
        getCheapestMilesPrice({
          origin: itinerary.origin,
          destination: itinerary.destination,
          departDate: itinerary.depart_date,
          cabinClass: itinerary.cabin_class,
        }),
      ])

      const cash = cashResult.status === 'fulfilled' ? cashResult.value : null
      const miles = milesResult.status === 'fulfilled' ? milesResult.value : null

      if (cashResult.status === 'rejected') {
        console.error(`[cron] Cash price error for itinerary ${itineraryId}:`, cashResult.reason)
      }
      if (milesResult.status === 'rejected') {
        console.error(`[cron] Miles error for itinerary ${itineraryId}:`, milesResult.reason)
      }

      // ── Store ───────────────────────────────────────────────────────
      const { error: insertError } = await supabase.from('price_checks').insert({
        itinerary_id: itineraryId,
        cash_price: cash?.cashPrice ?? null,
        cash_currency: cash?.currency ?? 'USD',
        miles_price: miles?.milesPrice ?? null,
        airline: 'AS',
        flight_number: cash?.flightNumber ?? null,
        duration_minutes: cash?.durationMinutes ?? null,
        stops: cash?.stops ?? 0,
      })

      if (insertError) {
        console.error(`[cron] Insert error for itinerary ${itineraryId}:`, insertError)
        return { itineraryId, status: 'error', error: insertError.message }
      }

      // ── Evaluate — once per itinerary, not once per watcher ─────────
      const { data: history } = await supabase
        .from('price_checks')
        .select('*')
        .eq('itinerary_id', itineraryId)
        .order('checked_at', { ascending: true })
        .limit(30)

      const trigger =
        history && history.length >= 2
          ? evaluateAlerts(history as PriceCheck[])
          : null

      if (!trigger) {
        return {
          itineraryId,
          status: 'stored, no alert',
          watchers: watchers.length,
        }
      }

      // ── Deliver — once per watcher, each throttled separately ───────
      let sent = 0
      let throttled = 0

      for (const watcher of watchers) {
        const { data: recentAlert } = await supabase
          .from('alerts')
          .select('id')
          .eq('watch_id', watcher.id)
          .gte('triggered_at', yesterday.toISOString())
          .limit(1)
          .maybeSingle()

        if (recentAlert) {
          throttled++
          continue
        }

        const { data: alertRecord } = await supabase
          .from('alerts')
          .insert({
            watch_id: watcher.id,
            user_id: watcher.user_id,
            alert_type: trigger.type,
            cash_price: trigger.cashPrice,
            miles_price: trigger.milesPrice,
            prev_cash_price: trigger.prevCashPrice,
            prev_miles_price: trigger.prevMilesPrice,
            email_sent: false,
          })
          .select()
          .single()

        if (!alertRecord) continue

        const { data: userData } = await supabase.auth.admin.getUserById(watcher.user_id)
        const email = userData?.user?.email
        if (!email) continue

        const ok = await sendAlertEmail({
          to: email,
          // The email template reads route and dates, which now live on the
          // itinerary — pass a flattened view rather than the bare watch row.
          watch: {
            id: watcher.id,
            origin: itinerary.origin,
            destination: itinerary.destination,
            depart_date: itinerary.depart_date,
            return_date: itinerary.return_date,
            cabin_class: itinerary.cabin_class,
          },
          trigger,
          alertId: alertRecord.id,
        })

        if (ok) {
          await supabase.from('alerts').update({ email_sent: true }).eq('id', alertRecord.id)
          sent++
        }
      }

      return {
        itineraryId,
        status: 'alert fired',
        type: trigger.type,
        sent,
        throttled,
      }
    } catch (err) {
      console.error(`[cron] Unexpected error for itinerary ${itineraryId}:`, err)
      return { itineraryId, status: 'error', error: String(err) }
    }
  }

  // Run itineraries CONCURRENTLY rather than one after another.
  //
  // Sequentially, wall-clock was the sum of every route's upstream latency,
  // and cron-job.org's 30s timeout is a hard ceiling that cannot be raised on
  // this account — so each route added brought the run closer to a guaranteed
  // failure, and two were already enough to hit it (2026-09-08). Concurrently,
  // wall-clock is the slowest single route instead.
  //
  // Capped rather than unbounded: each itinerary fires a SerpApi search, and
  // that quota (250/month free) and its rate limits are real. 5 is well above
  // the current route count and well below anything upstream would object to.
  // Override with CRON_CONCURRENCY if a run ever needs throttling further.
  const concurrency = Math.max(
    1,
    parseInt(process.env.CRON_CONCURRENCY ?? '5', 10) || 5
  )

  // Each itinerary already try/catches its own body, so a rejection here would
  // mean a bug in the catch itself. Handled anyway — one broken route must
  // never discard the results of the routes that succeeded.
  const settled = await mapWithConcurrency(
    Array.from(byItinerary.entries()),
    concurrency,
    processItinerary,
    (error, [itineraryId]) => {
      console.error(`[cron] Worker rejected for itinerary ${itineraryId}:`, error)
      return { itineraryId, status: 'error', error: String(error) }
    }
  )

  results.push(...settled)

  return NextResponse.json({
    watches: watches.length,
    itineraries: byItinerary.size,
    results,
  })
}
