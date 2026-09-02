import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getWatchesWithPrices } from '@/lib/watches'
import Nav from '@/components/Nav'
import ArchiveCard from '@/components/ArchiveCard'

export const revalidate = 0

export default async function ArchivePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const watches = await getWatchesWithPrices(supabase, user.id, [
    'expired',
    'removed',
    'unsubscribed',
  ])

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 896, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Archive</h1>
          <Link
            href="/dashboard"
            style={{ fontSize: 14, color: '#0060ac', textDecoration: 'none' }}
          >
            ← Active watches
          </Link>
        </div>

        {watches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗂️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#334155' }}>
              Nothing archived yet
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
              Watches that expire, get removed, or have their alerts unsubscribed will show up here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
            {watches.map((w) => (
              <ArchiveCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
