// Scheduled price check — called by cron-job.org (13:00 UTC daily).
// Protected by CRON_SECRET.
//
// NOTE: there is deliberately no vercel.json. A leftover Vercel cron entry
// was double-firing at 00:00 UTC and doubling SerpApi usage. See CLAUDE.md.
//
// ── Grain ────────────────────────────────────────────────────────────────
// Prices are fetched and stored PER ITINERARY, so N users watching the same
// trip cost one search rather than N. Alerts are DELIVERED per watch —
// everyone subscribed to that itinerary gets their own email — and the 24h
// throttle is applied per watch.
//
// Evaluation (2026-09-15): new_low and drop_10pct only ever depend on the
// shared itinerary-level price history, so they fire identically for every
// watcher on an itinerary, same as always. cumulative_drop's anchor (see
// lib/alerts.ts) is "the price this particular watcher was last actually
// alerted about" — necessarily per-watch, not per-itinerary — so
// evaluateAlerts is now called once PER WATCHER, inside the delivery loop,
// rather than once per itinerary beforehand.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getCheapestFare } from '@/lib/flights'
import { getCheapestMilesPrice } from '@/lib/miles'
import { evaluateAlerts } from '@/lib/alerts'
import { sendAlertEmail, sendCronFailureEmail } from '@/lib/email'
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
    // Deliberately NO failure email on this path. The endpoint is public, so
    // reporting auth failures by email would let anyone who knows the URL
    // flood the inbox and burn the Resend quota. Report failures of the RUN,
    // never of the auth — see sendCronFailureEmail's security note.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Everything past the auth gate is wrapped so that an unexpected throw is
  // reported rather than becoming an anonymous 500. Before this existed, the
  // 2026-09-12 failure left no recoverable trace at all: cron-job.org says
  // only "500", and Vercel Hobby had already discarded the logs by the time
  // anyone looked.
  try {
    return await runPriceCheck()
  } catch (err) {
    console.error('[cron] Unhandled failure:', err)
    await sendCronFailureEmail({
      stage: 'unhandled',
      message: err instanceof Error ? err.message : String(err),
      detail: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function runPriceCheck(): Promise<NextResponse> {
  const supabase = createSupabaseServiceClient()
  const results: Record<string, unknown>[] = []

  // Service-role client — bypasses RLS, so this sees every user's watches.
  const { data: watchRows, error: watchError } = await supabase
    .from('watches')
    .select('id, user_id, itinerary_id, itineraries(*)')
    .eq('status', 'active')

  if (watchError) {
    console.error('[cron] Failed to fetch watches:', watchError)
    // The only deliberate 500 in this route, and the prime suspect for the
    // 2026-09-12 failure. Resend is used rather than anything touching the
    // database, precisely because the database is what just failed.
    await sendCronFailureEmail({
      stage: 'watches-query',
      message: watchError.message ?? 'Supabase returned an error',
      detail: JSON.stringify(watchError, null, 2),
    })
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

  // ── When a watch is considered departed ─────────────────────────────
  //
  // depart_date is a DATE-ONLY string, so `new Date(depart_date)` resolves
  // to UTC midnight — which is 5pm the PREVIOUS day in US Pacific. The old
  // check therefore retired a watch for a Monday flight on Sunday evening,
  // while the user could still be actively watching it. East of UTC the
  // error runs the other way.
  //
  // Compare date strings in UTC instead (ISO 'YYYY-MM-DD' sorts
  // chronologically, so a plain < is correct), and only once the departure
  // date is a full day behind — that keeps the watch alive for the whole
  // departure day in every timezone on earth (max real offset is ±14h).
  //
  // The cost is at most one extra SerpApi search per route, once, plus the
  // watch lingering on the dashboard up to a day longer. Cheap next to a
  // watch vanishing before its flight has left.
  const departedBefore = new Date()
  departedBefore.setUTCDate(departedBefore.getUTCDate() - 1)
  const departedBeforeDate = departedBefore.toISOString().slice(0, 10)

  // ── Skip itineraries already checked recently ────────────────────────
  //
  // This is what makes the route safely RE-RUNNABLE, which in turn is what
  // makes a second scheduled run viable as a safety net. Supabase returned a
  // gateway timeout on the 13:00 UTC run on both 2026-09-12 and 2026-09-13,
  // losing the day's check each time; the same query succeeded an hour later.
  // A second run shortly after the first turns that from a lost day into a
  // brief delay — but only if a re-run is free when the first one worked.
  //
  // Without this guard a second run would re-spend SerpApi quota (250/month
  // free) and insert a duplicate price_check, distorting the rolling average
  // the alert logic depends on — exactly what the manual diagnostic runs did
  // to 2026-09-08.
  //
  // A rolling window rather than a calendar day: "same UTC day" would let a
  // run just after midnight re-check something measured 40 minutes earlier,
  // and would block a legitimate re-run 23 hours later. 20h leaves margin
  // under the 24h cadence while absorbing a retry half an hour behind.
  const minHoursBetweenChecks = Math.max(
    0,
    parseFloat(process.env.CRON_MIN_HOURS_BETWEEN_CHECKS ?? '20') || 20
  )

  const recentlyChecked = new Set<string>()
  if (minHoursBetweenChecks > 0 && byItinerary.size > 0) {
    const cutoff = new Date(
      Date.now() - minHoursBetweenChecks * 60 * 60 * 1000
    ).toISOString()

    const { data: recentRows, error: recentError } = await supabase
      .from('price_checks')
      .select('itinerary_id')
      .in('itinerary_id', Array.from(byItinerary.keys()))
      .gte('checked_at', cutoff)

    if (recentError) {
      // Non-fatal on purpose. Failing to read this only risks a duplicate
      // check; refusing to run because of it would cost the day's prices.
      // The cheap failure is the one to prefer.
      console.error('[cron] Could not read recent checks, not skipping:', recentError)
    } else {
      for (const r of (recentRows ?? []) as { itinerary_id: string }[]) {
        recentlyChecked.add(r.itinerary_id)
      }
    }
  }

  // One itinerary's full cycle: expire-check, fetch, store, evaluate, deliver.
  // Returns its own result row rather than pushing to a shared array, so the
  // ordering stays deterministic once these run concurrently (see below).
  async function processItinerary([itineraryId, { itinerary, watchers }]: ItineraryEntry): Promise<
    Record<string, unknown>
  > {
    try {
      // ── Expire ──────────────────────────────────────────────────────
      if (itinerary.depart_date < departedBeforeDate) {
        await supabase
          .from('watches')
          .update({ status: 'expired' })
          .eq('itinerary_id', itineraryId)
          .eq('status', 'active')
        return { itineraryId, status: 'expired', watchers: watchers.length }
      }

      // ── Skip ────────────────────────────────────────────────────────
      // Placed AFTER the expire check so a departed itinerary is still
      // retired even on a re-run, and BEFORE any fetch so a skip costs no
      // SerpApi quota and writes no duplicate row.
      if (recentlyChecked.has(itineraryId)) {
        return {
          itineraryId,
          status: 'skipped, checked recently',
          watchers: watchers.length,
        }
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

      // ── Shared history — feeds every watcher's evaluation ───────────
      const { data: history } = await supabase
        .from('price_checks')
        .select('*')
        .eq('itinerary_id', itineraryId)
        .order('checked_at', { ascending: true })
        .limit(30)

      if (!history || history.length < 2) {
        return {
          itineraryId,
          status: 'stored, no alert',
          watchers: watchers.length,
        }
      }

      // ── Evaluate + deliver — once per watcher ───────────────────────
      let sent = 0
      let throttled = 0
      let fired = 0
      let firedType: string | null = null

      for (const watcher of watchers) {
        // One row answers two questions that are really the same fact —
        // "what did we last tell this person, and when" — so one query
        // covers both the 24h throttle AND the cumulative_drop anchor
        // (lib/alerts.ts) rather than running two.
        const { data: lastAlert } = await supabase
          .from('alerts')
          .select('triggered_at, cash_price, miles_price')
          .eq('watch_id', watcher.id)
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastAlert && new Date(lastAlert.triggered_at) >= yesterday) {
          throttled++
          continue
        }

        const trigger = evaluateAlerts(
          history as PriceCheck[],
          lastAlert
            ? {
                cashPrice: lastAlert.cash_price,
                milesPrice: lastAlert.miles_price,
                reportedAt: lastAlert.triggered_at,
              }
            : null
        )

        if (!trigger) continue
        fired++
        firedType = trigger.type

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
        status: fired > 0 ? 'alert fired' : 'stored, no alert',
        type: firedType,
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

  // Partial failures are the insidious case: a single itinerary can fail
  // every single day while the run still returns 200, cron-job.org reports
  // success, and nobody ever reads the response body. Without this they are
  // completely silent. Reported, but still a 200 — the run genuinely did
  // its job for the other routes, and claiming total failure would be wrong.
  const failed = settled.filter((r) => r.status === 'error')
  if (failed.length > 0) {
    await sendCronFailureEmail({
      stage: `partial (${failed.length}/${settled.length} itineraries)`,
      message: `${failed.length} of ${settled.length} itineraries failed to check. The run itself completed.`,
      detail: JSON.stringify(failed, null, 2),
    })
  }

  return NextResponse.json({
    watches: watches.length,
    itineraries: byItinerary.size,
    results,
  })
}
