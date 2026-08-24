import { NextRequest, NextResponse } from 'next/server'
import { getCheapestFare } from '@/lib/flights'
import { getCheapestMilesPrice } from '@/lib/miles'
import { createSupabaseRouteClient } from '@/lib/supabase/server'
import type { CabinClass } from '@/types'

/**
 * ⚠️  QUOTA WARNING
 * Every date in the range costs one SerpApi search. SerpApi's free tier is
 * 250 searches/month TOTAL — shared with the cron job. An unauthenticated,
 * uncapped version of this endpoint would drain a month's quota in a couple
 * of page loads, so it now (a) requires a signed-in user and (b) caps the
 * range at SEARCH_MAX_DAYS (default 5).
 */
const MAX_DAYS = Math.max(1, parseInt(process.env.SEARCH_MAX_DAYS ?? '5', 10))

export interface SearchResult {
  date: string
  cashPrice: number | null
  currency: string
  milesPrice: number | null
  flightNumber: string | null
  durationMinutes: number | null
  stops: number
}

export async function POST(req: NextRequest) {
  // Searches cost real API quota — require a signed-in user.
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to search flights' },
      { status: 401 }
    )
  }

  const body = await req.json()
  const { origin, destination, startDate, endDate, cabinClass, returnDate } = body

  if (!origin || !destination || !startDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Build list of dates to search
  const dates: string[] = []
  const start = new Date(startDate + 'T12:00:00')
  const end = endDate ? new Date(endDate + 'T12:00:00') : start

  // Cap the range — each day is one paid API search.
  const diffDays = Math.min(
    Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1),
    MAX_DAYS
  )

  for (let i = 0; i < diffDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }

  // Fetch all dates in parallel
  const results = await Promise.all(
    dates.map(async (date): Promise<SearchResult> => {
      try {
        const [cash, miles] = await Promise.allSettled([
          getCheapestFare({
            origin,
            destination,
            departDate: date,
            returnDate: returnDate ?? null,
            cabinClass: cabinClass as CabinClass,
          }),
          getCheapestMilesPrice({
            origin,
            destination,
            departDate: date,
            cabinClass: cabinClass as CabinClass,
          }),
        ])

        const cashVal = cash.status === 'fulfilled' ? cash.value : null
        const milesVal = miles.status === 'fulfilled' ? miles.value : null

        return {
          date,
          cashPrice: cashVal?.cashPrice ?? null,
          currency: cashVal?.currency ?? 'USD',
          milesPrice: milesVal?.milesPrice ?? null,
          flightNumber: cashVal?.flightNumber ?? null,
          durationMinutes: cashVal?.durationMinutes ?? null,
          stops: cashVal?.stops ?? 0,
        }
      } catch {
        return {
          date,
          cashPrice: null,
          currency: 'USD',
          milesPrice: null,
          flightNumber: null,
          durationMinutes: null,
          stops: 0,
        }
      }
    })
  )

  // Sort by cash price (nulls last)
  results.sort((a, b) => {
    if (a.cashPrice === null) return 1
    if (b.cashPrice === null) return -1
    return a.cashPrice - b.cashPrice
  })

  return NextResponse.json({ results })
}
