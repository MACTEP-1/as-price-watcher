/**
 * Email alerts via Resend (free tier: 3,000 emails/month)
 * Env var: RESEND_API_KEY
 */

import { Resend } from 'resend'
import type { CabinClass } from '@/types'

/**
 * The email only needs the journey, not the subscription. Since route and
 * dates moved onto `itineraries`, the caller passes a flattened view rather
 * than a Watch row — which also keeps this file usable from anywhere that
 * can describe a trip.
 */
export interface AlertEmailWatch {
  id: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: CabinClass
}
import type { AlertTrigger } from './alerts'
import { formatDrop } from './alerts'

const FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? 'alerts@yourdomain.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function formatMiles(miles: number | null): string {
  if (miles === null) return '—'
  return miles.toLocaleString() + ' mi'
}

function formatCash(cash: number | null, currency = 'USD'): string {
  if (cash === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cash)
}

function alertHeadline(trigger: AlertTrigger, watch: AlertEmailWatch): string {
  const route = `${watch.origin} → ${watch.destination}`
  if (trigger.type === 'new_low') {
    return `🔔 New price low: ${route} on ${watch.depart_date}`
  }
  // Use baselineCashPrice/baselineMilesPrice (the 7-day average that
  // actually decided this alert), not prevCashPrice/prevMilesPrice (the
  // single prior check) — the two can disagree in sign. Only report the
  // metric(s) that actually crossed the threshold, per triggeredBy, rather
  // than whichever of cash/miles happens to produce a non-empty string.
  // See AlertTrigger's own comment and formatDrop's for the real bug this
  // once caused: "📉 Price dropped -5%" for a price that had risen 5%.
  const cashDrop =
    trigger.triggeredBy !== 'miles'
      ? formatDrop(trigger.cashPrice, trigger.baselineCashPrice)
      : ''
  const milesDrop =
    trigger.triggeredBy !== 'cash'
      ? formatDrop(trigger.milesPrice, trigger.baselineMilesPrice)
      : ''
  const dropStr = cashDrop || milesDrop
  return `📉 Price dropped ${dropStr}: ${route} on ${watch.depart_date}`
}

function buildEmailHtml(params: {
  watch: AlertEmailWatch
  trigger: AlertTrigger
  alertId: string
}): string {
  const { watch, trigger, alertId } = params
  const route = `${watch.origin} → ${watch.destination}`
  const headline = alertHeadline(trigger, watch)
  const watchUrl = `${APP_URL}/watches/${watch.id}`
  const unsubUrl = `${APP_URL}/api/alerts/unsubscribe?watchId=${watch.id}&alertId=${alertId}`

  // "was $X" / "X mi" here means "the value this alert was actually
  // measured against" (baselineCashPrice/baselineMilesPrice) — not the
  // single most recent prior check (prevCashPrice/prevMilesPrice), which
  // can be a completely different number pointing the opposite direction.
  // Labeled by alert type since the baseline means something different for
  // each: a 7-day average for a drop, the previous record for a new low.
  const baselineLabel = trigger.type === 'new_low' ? 'previous low' : '7-day avg'

  const cashRow =
    trigger.cashPrice !== null
      ? `<tr>
          <td style="padding:8px 16px;color:#6b7280;">Cash price</td>
          <td style="padding:8px 16px;font-weight:600;color:#111827;">${formatCash(trigger.cashPrice)}</td>
          <td style="padding:8px 16px;color:#6b7280;">${trigger.baselineCashPrice !== null ? `${baselineLabel} ${formatCash(trigger.baselineCashPrice)}` : ''}</td>
        </tr>`
      : ''

  const milesRow =
    trigger.milesPrice !== null
      ? `<tr>
          <td style="padding:8px 16px;color:#6b7280;">Miles price</td>
          <td style="padding:8px 16px;font-weight:600;color:#111827;">${formatMiles(trigger.milesPrice)}</td>
          <td style="padding:8px 16px;color:#6b7280;">${trigger.baselineMilesPrice !== null ? `${baselineLabel} ${formatMiles(trigger.baselineMilesPrice)}` : ''}</td>
        </tr>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px;">
            <span style="color:#38bdf8;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Alaska Price Watch</span>
            <h1 style="margin:8px 0 0;color:#fff;font-size:20px;line-height:1.3;">${headline}</h1>
          </td>
        </tr>

        <!-- Route banner -->
        <tr>
          <td style="background:#f0f9ff;padding:20px 32px;border-bottom:1px solid #e0f2fe;">
            <span style="font-size:22px;font-weight:700;color:#0369a1;">${route}</span>
            <span style="margin-left:12px;color:#64748b;font-size:14px;">${watch.depart_date}${watch.return_date ? ` → ${watch.return_date}` : ' (one-way)'} · ${watch.cabin_class.replace('_', ' ')}</span>
          </td>
        </tr>

        <!-- Price table -->
        <tr>
          <td style="padding:8px 16px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
              ${cashRow}
              ${milesRow}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 32px;">
            <a href="${watchUrl}"
               style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
              View price history →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              You're watching ${route}. <a href="${unsubUrl}" style="color:#6b7280;">Stop watching this route</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Operational failure report for the price-check cron.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Vercel's Hobby plan keeps runtime logs for ONE HOUR. The cron runs once a
 * day at 13:00 UTC. A failure is therefore always discovered hours later,
 * with the logs long gone — which is exactly what happened on 2026-09-08
 * (timeout) and again on 2026-09-12 (a 500 that stayed permanently
 * undiagnosed). cron-job.org only ever says *that* a run failed, never why.
 *
 * So the run reports its own cause of death, at the moment it dies.
 *
 * ── Design constraints, each load-bearing ─────────────────────────────────
 *   1. Depends on NOTHING but Resend. The most likely failure source is
 *      Supabase, so anything routed through the database would be silent in
 *      precisely the case this exists for.
 *   2. NEVER throws. A broken error-reporter must not replace the original
 *      error with its own — that turns one diagnosable failure into two
 *      mysteries. Every path returns a boolean.
 *   3. No-op when CRON_ALERT_EMAIL is unset, rather than guessing a
 *      recipient. Guessing means either silently mailing the wrong person or
 *      a database lookup, and (1) rules the lookup out.
 *
 * ── Security ──────────────────────────────────────────────────────────────
 * Callers MUST NOT invoke this before the CRON_SECRET check passes. An
 * endpoint that emails on unauthenticated failure is an email-bomb vector:
 * anyone hitting the URL with a wrong secret could fill an inbox and burn
 * the Resend quota. Report failures of the RUN, never of the auth.
 */
export async function sendCronFailureEmail(params: {
  /** Where it broke, e.g. 'watches-query' — becomes the subject. */
  stage: string
  /** One-line summary. */
  message: string
  /** Optional detail: stack, PostgREST error body, per-itinerary rows. */
  detail?: string
}): Promise<boolean> {
  const to = process.env.CRON_ALERT_EMAIL
  if (!to) {
    console.warn(
      '[cron] CRON_ALERT_EMAIL is not set — failure report not sent. ' +
        `Stage: ${params.stage}. Message: ${params.message}`
    )
    return false
  }

  try {
    const when = new Date().toISOString()

    // Detail can be an arbitrarily large upstream error body; cap it so a
    // pathological payload can't blow up the send.
    const detail = params.detail ? params.detail.slice(0, 4000) : ''

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `⚠️ Price-check cron failed: ${params.stage}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
  <h1 style="margin:0 0 4px;font-size:18px;">Price-check cron failed</h1>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${esc(when)}</p>
  <table cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:16px;">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Stage</td><td style="font-weight:600;">${esc(params.stage)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Message</td><td style="font-weight:600;">${esc(params.message)}</td></tr>
  </table>
  ${
    detail
      ? `<pre style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${esc(detail)}</pre>`
      : ''
  }
  <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
    Sent because the run failed. Vercel Hobby keeps runtime logs for only one
    hour, so this message may be the only surviving record.
  </p>
</body>
</html>`,
    })

    if (error) {
      console.error('[cron] Failure report could not be sent:', error)
      return false
    }
    return true
  } catch (err) {
    // Swallowed deliberately — see constraint 2 above.
    console.error('[cron] Failure report threw:', err)
    return false
  }
}

export async function sendAlertEmail(params: {
  to: string
  watch: AlertEmailWatch
  trigger: AlertTrigger
  alertId: string
}): Promise<boolean> {
  const { to, watch, trigger, alertId } = params

  const subject = alertHeadline(trigger, watch)
  const html = buildEmailHtml({ watch, trigger, alertId })

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Unexpected error:', err)
    return false
  }
}
