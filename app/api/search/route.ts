import { NextRequest, NextResponse } from 'next/server'
import { getCheapestFare } from '@/lib/amadeus/client'
import { getCheapestMilesPrice, toAlaskaCabin } from '@/lib/alaska/miles'
import type { CabinClass } from '@/types'

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
  const body = await req.json()
  const { origin, destination, startDate, endDate, cabinClass, returnDate } = body

  if (!origin || !destination || !startDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Build list of dates to search
  const dates: string[] = []
  const start = new Date(startDate + 'T12:00:00')
  const end = endDate ? new Date(endDate + 'T12:00:00') : start

  // Cap at 14 days to avoid hammering the API
  const diffDays = Math.min(
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    14
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
            cabin: toAlaskaCabin(cabinClass),
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
