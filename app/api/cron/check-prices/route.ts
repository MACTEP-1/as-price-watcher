/**
 * Vercel Cron Job — runs every 4 hours
 *
 * vercel.json config:
 *   { "crons": [{ "path": "/api/cron/check-prices", "schedule": "0 */4 * * *" }] }
 *
 * Protected by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getCheapestFare } from '@/lib/amadeus/client'
import { getCheapestMilesPrice, toAlaskaCabin } from '@/lib/alaska/miles'
import { evaluateAlerts } from '@/lib/alerts'
import { sendAlertEmail } from '@/lib/email'
import type { Watch, PriceCheck } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300  // 5 min — Vercel hobby allows up to 60s; upgrade for more

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const results: Record<string, unknown>[] = []

  // Fetch all active watches
  const { data: watches, error: watchError } = await supabase
    .from('watches')
    .select('*')
    .eq('active', true)

  if (watchError) {
    console.error('[cron] Failed to fetch watches:', watchError)
    return NextResponse.json({ error: watchError.message }, { status: 500 })
  }

  if (!watches || watches.length === 0) {
    return NextResponse.json({ message: 'No active watches', checked: 0 })
  }

  for (const watch of watches as Watch[]) {
    try {
      // Skip if depart_date is in the past
      if (new Date(watch.depart_date) < new Date()) {
        await supabase
          .from('watches')
          .update({ active: false })
          .eq('id', watch.id)
        continue
      }

      // ── Fetch prices ────────────────────────────────────────────────
      const [cashResult, milesResult] = await Promise.allSettled([
        getCheapestFare({
          origin: watch.origin,
          destination: watch.destination,
          departDate: watch.depart_date,
          returnDate: watch.return_date,
          cabinClass: watch.cabin_class,
        }),
        getCheapestMilesPrice({
          origin: watch.origin,
          destination: watch.destination,
          departDate: watch.depart_date,
          cabin: toAlaskaCabin(watch.cabin_class),
        }),
      ])

      const cash =
        cashResult.status === 'fulfilled' ? cashResult.value : null
      const miles =
        milesResult.status === 'fulfilled' ? milesResult.value : null

      if (cashResult.status === 'rejected') {
        console.error(`[cron] Amadeus error for watch ${watch.id}:`, cashResult.reason)
      }
      if (milesResult.status === 'rejected') {
        console.error(`[cron] Miles error for watch ${watch.id}:`, milesResult.reason)
      }

      // ── Store price check ───────────────────────────────────────────
      const { error: insertError } = await supabase
        .from('price_checks')
        .insert({
          watch_id: watch.id,
          cash_price: cash?.cashPrice ?? null,
          cash_currency: cash?.currency ?? 'USD',
          miles_price: miles?.milesPrice ?? null,
          airline: 'AS',
          flight_number: cash?.flightNumber ?? null,
          duration_minutes: cash?.durationMinutes ?? null,
          stops: cash?.stops ?? 0,
        })

      if (insertError) {
        console.error(`[cron] Insert error for watch ${watch.id}:`, insertError)
        continue
      }

      // ── Evaluate alert ──────────────────────────────────────────────
      // Fetch last 30 checks for this watch (enough history for rolling avg + all-time low)
      const { data: history } = await supabase
        .from('price_checks')
        .select('*')
        .eq('watch_id', watch.id)
        .order('checked_at', { ascending: true })
        .limit(30)

      if (!history || history.length < 2) {
        results.push({ watchId: watch.id, status: 'stored, no history for alert' })
        continue
      }

      const trigger = evaluateAlerts(history as PriceCheck[])

      if (trigger) {
        // Throttle: only one alert per watch per 24h
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        const { data: recentAlert } = await supabase
          .from('alerts')
          .select('id')
          .eq('watch_id', watch.id)
          .gte('triggered_at', yesterday.toISOString())
          .limit(1)
          .single()

        if (!recentAlert) {
          // Get user email
          const { data: userData } = await supabase.auth.admin.getUserById(watch.user_id)
          const email = userData?.user?.email

          // Insert alert record
          const { data: alertRecord } = await supabase
            .from('alerts')
            .insert({
              watch_id: watch.id,
              user_id: watch.user_id,
              alert_type: trigger.type,
              cash_price: trigger.cashPrice,
              miles_price: trigger.milesPrice,
              prev_cash_price: trigger.prevCashPrice,
              prev_miles_price: trigger.prevMilesPrice,
              email_sent: false,
            })
            .select()
            .single()

          if (email && alertRecord) {
            const sent = await sendAlertEmail({
              to: email,
              watch,
              trigger,
              alertId: alertRecord.id,
            })

            if (sent) {
              await supabase
                .from('alerts')
                .update({ email_sent: true })
                .eq('id', alertRecord.id)
            }
          }

          results.push({ watchId: watch.id, status: 'alert fired', type: trigger.type })
        } else {
          results.push({ watchId: watch.id, status: 'alert throttled (24h)' })
        }
      } else {
        results.push({ watchId: watch.id, status: 'checked, no alert' })
      }
    } catch (err) {
      console.error(`[cron] Unexpected error for watch ${watch.id}:`, err)
      results.push({ watchId: watch.id, status: 'error', error: String(err) })
    }
  }

  return NextResponse.json({ checked: watches.length, results })
}
