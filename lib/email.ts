/**
 * Email alerts via Resend (free tier: 3,000 emails/month)
 * Env var: RESEND_API_KEY
 */

import { Resend } from 'resend'
import type { Watch } from '@/types'
import type { AlertTrigger } from './alerts'
import { formatDrop } from './alerts'

const resend = new Resend(process.env.RESEND_API_KEY)

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

function alertHeadline(trigger: AlertTrigger, watch: Watch): string {
  const route = `${watch.origin} → ${watch.destination}`
  if (trigger.type === 'new_low') {
    return `🔔 New price low: ${route} on ${watch.depart_date}`
  }
  const cashDrop = formatDrop(trigger.cashPrice, trigger.prevCashPrice)
  const milesDrop = formatDrop(trigger.milesPrice, trigger.prevMilesPrice)
  const dropStr = cashDrop || milesDrop
  return `📉 Price dropped ${dropStr}: ${route} on ${watch.depart_date}`
}

function buildEmailHtml(params: {
  watch: Watch
  trigger: AlertTrigger
  alertId: string
}): string {
  const { watch, trigger, alertId } = params
  const route = `${watch.origin} → ${watch.destination}`
  const headline = alertHeadline(trigger, watch)
  const watchUrl = `${APP_URL}/watches/${watch.id}`
  const unsubUrl = `${APP_URL}/api/alerts/unsubscribe?watchId=${watch.id}&alertId=${alertId}`

  const cashRow =
    trigger.cashPrice !== null
      ? `<tr>
          <td style="padding:8px 16px;color:#6b7280;">Cash price</td>
          <td style="padding:8px 16px;font-weight:600;color:#111827;">${formatCash(trigger.cashPrice)}</td>
          <td style="padding:8px 16px;color:#6b7280;">${trigger.prevCashPrice ? `was ${formatCash(trigger.prevCashPrice)}` : ''}</td>
        </tr>`
      : ''

  const milesRow =
    trigger.milesPrice !== null
      ? `<tr>
          <td style="padding:8px 16px;color:#6b7280;">Miles price</td>
          <td style="padding:8px 16px;font-weight:600;color:#111827;">${formatMiles(trigger.milesPrice)}</td>
          <td style="padding:8px 16px;color:#6b7280;">${trigger.prevMilesPrice ? `was ${formatMiles(trigger.prevMilesPrice)}` : ''}</td>
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

export async function sendAlertEmail(params: {
  to: string
  watch: Watch
  trigger: AlertTrigger
  alertId: string
}): Promise<boolean> {
  const { to, watch, trigger, alertId } = params

  const subject = alertHeadline(trigger, watch)
  const html = buildEmailHtml({ watch, trigger, alertId })

  try {
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
