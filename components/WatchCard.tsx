'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { WatchWithLatestPrice } from '@/types'
import { formatCash, formatMiles, formatDate, pctChange, formatPctChange, cn } from '@/lib/utils'
import PriceSparkline from './PriceSparkline'

interface Props {
  watch: WatchWithLatestPrice
  onDelete?: (id: string) => void
}

export default function WatchCard({ watch, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false)

  const cashChange = pctChange(watch.latest_cash, watch.prev_cash)
  const milesChange = pctChange(watch.latest_miles, watch.prev_miles)

  async function handleDelete() {
    if (!confirm(`Stop watching ${watch.origin} → ${watch.destination}?`)) return
    setDeleting(true)
    await fetch(`/api/watches/${watch.id}`, { method: 'DELETE' })
    onDelete?.(watch.id)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
      {/* Route header */}
      <Link href={`/watches/${watch.id}`} className="block p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {watch.origin}
              </span>
              <span className="text-slate-400">→</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {watch.destination}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {formatDate(watch.depart_date)}
              {watch.return_date && ` · return ${formatDate(watch.return_date)}`}
              {' · '}
              <span className="capitalize">{watch.cabin_class.replace('_', ' ')}</span>
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">›</span>
        </div>

        {/* Prices */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {/* Cash */}
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Cash</p>
            <p className="text-2xl font-bold text-[#0060ac]">
              {formatCash(watch.latest_cash)}
            </p>
            {cashChange !== null && (
              <p className={cn(
                'text-xs font-medium mt-0.5',
                cashChange < 0 ? 'text-green-600' : 'text-red-500'
              )}>
                {formatPctChange(cashChange)} vs prev
              </p>
            )}
            {watch.price_history.length > 0 && (
              <div className="mt-2">
                <PriceSparkline history={watch.price_history} type="cash" />
              </div>
            )}
          </div>

          {/* Miles */}
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Miles</p>
            <p className="text-2xl font-bold text-[#00a551]">
              {formatMiles(watch.latest_miles)}
            </p>
            {milesChange !== null && (
              <p className={cn(
                'text-xs font-medium mt-0.5',
                milesChange < 0 ? 'text-green-600' : 'text-red-500'
              )}>
                {formatPctChange(milesChange)} vs prev
              </p>
            )}
            {watch.price_history.length > 0 && (
              <div className="mt-2">
                <PriceSparkline history={watch.price_history} type="miles" />
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {watch.price_history.length} check{watch.price_history.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Removing…' : 'Remove watch'}
        </button>
      </div>
    </div>
  )
}
