import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getWatchesWithPrices } from '@/lib/watches'
import Nav from '@/components/Nav'
import WatchCard from '@/components/WatchCard'

export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Query and enrich live in lib/watches.ts, not here — a React Native app
  // cannot reuse a server component, so logic left inline would have to be
  // written twice and would drift.
  const watches = await getWatchesWithPrices(supabase, user.id)

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

        {watches.length === 0 ? (
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
            {watches.map((w) => (
              <WatchCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
