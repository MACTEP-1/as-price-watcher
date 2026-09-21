'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { WatchWithLatestPrice } from '@/types'
import { formatCash, formatMiles, formatDate, pctChange, formatPctChange, changeColor } from '@/lib/utils'
import PriceSparkline from './PriceSparkline'

interface Props {
  watch: WatchWithLatestPrice
}

export default function WatchCard({ watch }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const cashChange = pctChange(watch.latest_cash, watch.prev_cash)
  const milesChange = pctChange(watch.latest_miles, watch.prev_miles)

  /**
   * The card refreshes the page itself rather than asking its parent to drop
   * it. The dashboard (app/dashboard/page.tsx) is a SERVER component, which
   * cannot pass a function prop to a client component — the old
   * `onDelete?.()` callback was never wired up, so the delete succeeded but
   * the button sat on "Removing…" forever (found 2026-09-21). router.refresh()
   * re-runs the server component, whose query (lib/watches.ts) only returns
   * active watches, so the removed card simply isn't rendered next time.
   *
   * A failed delete now resets the button and says so, instead of showing
   * the same frozen state as a successful one.
   */
  async function handleDelete() {
    if (!confirm(`Stop watching ${watch.origin} → ${watch.destination}?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/watches/${watch.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.refresh()
    } catch (err) {
      setDeleting(false)
      alert(`Couldn't remove this watch (${err instanceof Error ? err.message : 'unknown error'}). Try again.`)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
      <Link href={`/watches/${watch.id}`} style={{ display: 'block', padding: 20, textDecoration: 'none', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{watch.origin}</span>
              <span style={{ color: '#94a3b8' }}>→</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{watch.destination}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {formatDate(watch.depart_date)}
              {watch.return_date
                ? ` · return ${formatDate(watch.return_date)}`
                : ' · one-way'}
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{watch.cabin_class.replace('_', ' ')}</span>
            </p>
          </div>
          <span style={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>›</span>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cash</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: watch.latest_cash !== null ? '#0060ac' : '#94a3b8' }}>{formatCash(watch.latest_cash)}</p>
            {cashChange !== null && (
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: changeColor(cashChange) }}>
                {formatPctChange(cashChange)} vs prev
              </p>
            )}
            {watch.price_history.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PriceSparkline history={watch.price_history} type="cash" />
              </div>
            )}
          </div>

          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Miles</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: watch.latest_miles !== null ? '#00a551' : '#94a3b8' }}>{formatMiles(watch.latest_miles)}</p>
            {milesChange !== null && (
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: changeColor(milesChange) }}>
                {formatPctChange(milesChange)} vs prev
              </p>
            )}
            {watch.price_history.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PriceSparkline history={watch.price_history} type="miles" />
              </div>
            )}
          </div>
        </div>
      </Link>

      <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {watch.price_history.length} check{watch.price_history.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.5 : 1 }}
        >
          {deleting ? 'Removing…' : 'Remove watch'}
        </button>
      </div>
    </div>
  )
}