import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import PriceHistoryChart from '@/components/PriceHistoryChart'
import type { PriceCheck } from '@/types'
import { formatCash, formatMiles, formatDate, pctChange, formatPctChange, cn } from '@/lib/utils'

export const revalidate = 0

export default async function WatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: watch } = await supabase
    .from('watches')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!watch) notFound()

  const { data: history } = await supabase
    .from('price_checks')
    .select('*')
    .eq('watch_id', id)
    .order('checked_at', { ascending: true })
    .limit(90)

  const checks = (history ?? []) as PriceCheck[]
  const latest = checks[checks.length - 1]
  const prev = checks[checks.length - 2]

  const cashChange = pctChange(latest?.cash_price ?? null, prev?.cash_price ?? null)
  const milesChange = pctChange(latest?.miles_price ?? null, prev?.miles_price ?? null)

  // Alerts for this watch
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('watch_id', id)
    .order('triggered_at', { ascending: false })
    .limit(10)

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 mb-6"
        >
          ← All watches
        </Link>

        {/* Route header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {watch.origin} → {watch.destination}
            </h1>
            <p className="mt-1 text-slate-500">
              {formatDate(watch.depart_date)}
              {watch.return_date && ` · return ${formatDate(watch.return_date)}`}
              {' · '}
              <span className="capitalize">{watch.cabin_class.replace('_', ' ')}</span>
            </p>
          </div>
        </div>

        {/* Current price cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* Cash */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Cash price</p>
            <p className="text-3xl font-bold text-[#0060ac]">
              {formatCash(latest?.cash_price ?? null)}
            </p>
            {cashChange !== null && (
              <p className={cn(
                'text-sm font-medium mt-1',
                cashChange < 0 ? 'text-green-600' : 'text-red-500'
              )}>
                {formatPctChange(cashChange)} since last check
              </p>
            )}
            {latest?.flight_number && (
              <p className="text-xs text-slate-400 mt-1">Best: {latest.flight_number}</p>
            )}
          </div>

          {/* Miles */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Miles price</p>
            <p className="text-3xl font-bold text-[#00a551]">
              {formatMiles(latest?.miles_price ?? null)}
            </p>
            {milesChange !== null && (
              <p className={cn(
                'text-sm font-medium mt-1',
                milesChange < 0 ? 'text-green-600' : 'text-red-500'
              )}>
                {formatPctChange(milesChange)} since last check
              </p>
            )}
            {latest?.miles_price === null && (
              <p className="text-xs text-slate-400 mt-1">Award pricing pending</p>
            )}
          </div>
        </div>

        {/* Price history chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            Price history ({checks.length} checks)
          </h2>
          <PriceHistoryChart history={checks} />
        </div>

        {/* Stats */}
        {checks.length >= 2 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 mb-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Stats</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              {/* Cash stats */}
              {(() => {
                const cashPrices = checks.map(c => c.cash_price).filter((p): p is number => p !== null)
                if (cashPrices.length === 0) return null
                return <>
                  <div>
                    <p className="text-xs text-slate-400">Cash low</p>
                    <p className="text-lg font-bold text-[#0060ac] mt-0.5">{formatCash(Math.min(...cashPrices))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Cash avg</p>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {formatCash(cashPrices.reduce((a, b) => a + b, 0) / cashPrices.length)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Cash high</p>
                    <p className="text-lg font-bold text-slate-500 mt-0.5">{formatCash(Math.max(...cashPrices))}</p>
                  </div>
                </>
              })()}
            </div>
            <div className="grid grid-cols-3 gap-4 text-center mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              {(() => {
                const milesPrices = checks.map(c => c.miles_price).filter((p): p is number => p !== null)
                if (milesPrices.length === 0) return <p className="col-span-3 text-xs text-slate-400">Miles history not yet available</p>
                return <>
                  <div>
                    <p className="text-xs text-slate-400">Miles low</p>
                    <p className="text-lg font-bold text-[#00a551] mt-0.5">{formatMiles(Math.min(...milesPrices))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Miles avg</p>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {formatMiles(Math.round(milesPrices.reduce((a, b) => a + b, 0) / milesPrices.length))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Miles high</p>
                    <p className="text-lg font-bold text-slate-500 mt-0.5">{formatMiles(Math.max(...milesPrices))}</p>
                  </div>
                </>
              })()}
            </div>
          </div>
        )}

        {/* Alert history */}
        {(alerts ?? []).length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Alert history</h2>
            <div className="space-y-3">
              {(alerts ?? []).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="text-lg">{a.alert_type === 'new_low' ? '🏆' : '📉'}</span>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {a.alert_type === 'new_low' ? 'New all-time low' : 'Price dropped ≥10%'}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {new Date(a.triggered_at).toLocaleString()} ·{' '}
                      Cash: {formatCash(a.cash_price)} · Miles: {formatMiles(a.miles_price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
