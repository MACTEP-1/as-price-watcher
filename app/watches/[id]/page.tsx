import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getWatchDetail } from '@/lib/watches'
import Nav from '@/components/Nav'
import PriceHistoryChart from '@/components/PriceHistoryChart'
import type { PriceCheck } from '@/types'
import { formatCash, formatMiles, formatDate, pctChange, formatPctChange, changeColor } from '@/lib/utils'

export const revalidate = 0

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: 20,
  border: '1px solid #f1f5f9', marginBottom: 16,
}

export default async function WatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Route, dates and cabin now live on the itinerary; getWatchDetail joins
  // and flattens them so this page reads the same as before.
  const detail = await getWatchDetail(supabase, id, user.id)
  if (!detail) notFound()

  const { watch, checks } = detail
  const latest = checks[checks.length - 1]
  const prev = checks[checks.length - 2]

  const cashChange = pctChange(latest?.cash_price ?? null, prev?.cash_price ?? null)
  const milesChange = pctChange(latest?.miles_price ?? null, prev?.miles_price ?? null)

  const { data: alerts } = await supabase
    .from('alerts').select('*').eq('watch_id', id)
    .order('triggered_at', { ascending: false }).limit(10)

  const cashPrices = checks.map(c => c.cash_price).filter((p): p is number => p !== null)
  const milesPrices = checks.map(c => c.miles_price).filter((p): p is number => p !== null)

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 768, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        <Link href="/dashboard" style={{ fontSize: 14, color: '#64748b', textDecoration: 'none', display: 'inline-block', marginBottom: 24 }}>
          ← All watches
        </Link>

        {/* Route header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 700, color: '#0f172a' }}>
            {watch.origin} → {watch.destination}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: '#64748b' }}>
            {formatDate(watch.depart_date)}
            {watch.return_date
              ? ` · return ${formatDate(watch.return_date)}`
              : ' · one-way'}
            {' · '}
            <span style={{ textTransform: 'capitalize' }}>{watch.cabin_class.replace('_', ' ')}</span>
          </p>
        </div>

        {/* Current price cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {watch.return_date ? 'Cash price · round trip' : 'Cash price · one-way'}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 700, color: '#0060ac' }}>{formatCash(latest?.cash_price ?? null)}</p>
            {cashChange !== null && (
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: changeColor(cashChange) }}>
                {formatPctChange(cashChange)} since last check
              </p>
            )}
            {latest?.flight_number && (
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Best: {latest.flight_number}</p>
            )}
          </div>

          <div style={card}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Miles price</p>
            <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 700, color: '#00a551' }}>{formatMiles(latest?.miles_price ?? null)}</p>
            {milesChange !== null && (
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: changeColor(milesChange) }}>
                {formatPctChange(milesChange)} since last check
              </p>
            )}
            {latest?.miles_price === null && (
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Award pricing pending</p>
            )}
          </div>
        </div>

        {/* Price history chart */}
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#334155' }}>
            Price history ({checks.length} checks)
          </h2>
          <PriceHistoryChart history={checks} />
        </div>

        {/* Stats */}
        {checks.length >= 2 && (
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#334155' }}>Stats</h2>
            {cashPrices.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center', marginBottom: milesPrices.length > 0 ? 16 : 0 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Cash low</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0060ac' }}>{formatCash(Math.min(...cashPrices))}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Cash avg</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#334155' }}>{formatCash(Math.round(cashPrices.reduce((a, b) => a + b, 0) / cashPrices.length))}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Cash high</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#64748b' }}>{formatCash(Math.max(...cashPrices))}</p>
                </div>
              </div>
            )}
            {milesPrices.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center', paddingTop: cashPrices.length > 0 ? 16 : 0, borderTop: cashPrices.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Miles low</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#00a551' }}>{formatMiles(Math.min(...milesPrices))}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Miles avg</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#334155' }}>{formatMiles(Math.round(milesPrices.reduce((a, b) => a + b, 0) / milesPrices.length))}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Miles high</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#64748b' }}>{formatMiles(Math.max(...milesPrices))}</p>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Miles history not yet available</p>
            )}
          </div>
        )}

        {/* Alert history */}
        {(alerts ?? []).length > 0 && (
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#334155' }}>Alert history</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(alerts ?? []).map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 18 }}>{a.alert_type === 'new_low' ? '🏆' : '📉'}</span>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                      {a.alert_type === 'new_low' ? 'New all-time low' : 'Price dropped ≥10%'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                      {new Date(a.triggered_at).toLocaleString()} · Cash: {formatCash(a.cash_price)} · Miles: {formatMiles(a.miles_price)}
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