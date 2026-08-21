import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import WatchCard from '@/components/WatchCard'
import type { WatchWithLatestPrice, PriceCheck } from '@/types'

export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: watches } = await supabase
    .from('watches')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false })

  const watchIds = (watches ?? []).map((w) => w.id)

  let priceHistory: PriceCheck[] = []
  if (watchIds.length > 0) {
    const { data } = await supabase
      .from('price_checks')
      .select('*')
      .in('watch_id', watchIds)
      .order('checked_at', { ascending: true })
    priceHistory = (data ?? []) as PriceCheck[]
  }

  const enriched: WatchWithLatestPrice[] = (watches ?? []).map((w) => {
    const history = priceHistory.filter((p) => p.watch_id === w.id)
    const latest = history[history.length - 1]
    const prev = history[history.length - 2]
    return {
      ...w,
      latest_cash: latest?.cash_price ?? null,
      latest_miles: latest?.miles_price ?? null,
      prev_cash: prev?.cash_price ?? null,
      prev_miles: prev?.miles_price ?? null,
      price_history: history.slice(-14),
    }
  })

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 896, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Your watches</h1>
          <Link
            href="/watches/new"
            style={{ padding: '8px 16px', background: '#0060ac', color: '#fff', fontSize: 14, fontWeight: 600, borderRadius: 8, textDecoration: 'none' }}
          >
            + New watch
          </Link>
        </div>

        {enriched.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✈️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#334155' }}>No watches yet</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b' }}>Add a route to start tracking prices</p>
            <Link
              href="/watches/new"
              style={{ display: 'inline-block', padding: '10px 24px', background: '#0060ac', color: '#fff', fontWeight: 600, borderRadius: 8, textDecoration: 'none' }}
            >
              Watch a route
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
            {enriched.map((w) => (
              <WatchCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}