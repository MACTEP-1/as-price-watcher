import Link from 'next/link'
import type { WatchWithLatestPrice } from '@/types'
import { formatCash, formatMiles, formatDate } from '@/lib/utils'

/**
 * Same card shape as WatchCard, deliberately muted (grey route text, no
 * sparklines, no delete button) so an archived watch reads as "history",
 * not as something still being tracked. No status-change timestamp exists
 * on the watches table (see supabase/schema.sql) — only `created_at` and
 * the itinerary's `depart_date` — so the subtext below leans on those
 * instead of inventing a date the schema doesn't have.
 */

const STATUS_LABEL: Record<string, string> = {
  expired: 'Expired',
  removed: 'Removed',
  unsubscribed: 'Unsubscribed',
}

function statusSubtext(watch: WatchWithLatestPrice): string {
  switch (watch.status) {
    case 'expired':
      return `Departed ${formatDate(watch.depart_date)}`
    case 'removed':
      return 'You stopped watching this route'
    case 'unsubscribed':
      return 'Alerts turned off from an email link'
    default:
      return ''
  }
}

interface Props {
  watch: WatchWithLatestPrice
}

export default function ArchiveCard({ watch }: Props) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
      <Link href={`/watches/${watch.id}`} style={{ display: 'block', padding: 20, textDecoration: 'none', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>{watch.origin}</span>
              <span style={{ color: '#cbd5e1' }}>→</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>{watch.destination}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              {formatDate(watch.depart_date)}
              {watch.return_date
                ? ` · return ${formatDate(watch.return_date)}`
                : ' · one-way'}
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{watch.cabin_class.replace('_', ' ')}</span>
            </p>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#64748b',
              background: '#f1f5f9',
              borderRadius: 6,
              padding: '3px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              flexShrink: 0,
            }}
          >
            {STATUS_LABEL[watch.status] ?? watch.status}
          </span>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last cash</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#64748b' }}>{formatCash(watch.latest_cash)}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last miles</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#64748b' }}>{formatMiles(watch.latest_miles)}</p>
          </div>
        </div>
      </Link>

      <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{statusSubtext(watch)}</span>
      </div>
    </div>
  )
}
