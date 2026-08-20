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

  // Fetch watches + last 14 price checks each
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
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Your watches
          </h1>
          <Link
            href="/watches/new"
            className="px-4 py-2 bg-[#0060ac] text-white text-sm font-semibold rounded-lg hover:bg-[#004f91] transition-colors"
          >
            + New watch
          </Link>
        </div>

        {enriched.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✈️</div>
            <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No watches yet</h2>
            <p className="mt-1 text-slate-500 text-sm">Add a route to start tracking prices</p>
            <Link
              href="/watches/new"
              className="mt-6 inline-block px-6 py-2.5 bg-[#0060ac] text-white font-semibold rounded-lg hover:bg-[#004f91] transition-colors"
            >
              Watch a route
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {enriched.map((w) => (
              <WatchCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
