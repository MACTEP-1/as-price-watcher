/**
 * SerpApi Google Flights provider
 * Sign up: https://serpapi.com
 * Env var: SERPAPI_KEY
 */

import type { FlightPriceProvider, FlightSearchParams, CashFareResult } from './types'

export class SerpApiFlightProvider implements FlightPriceProvider {
  async getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null> {
    const apiKey = process.env.SERPAPI_KEY
    if (!apiKey) throw new Error('SERPAPI_KEY env var is not set')

    const searchParams = new URLSearchParams({
      engine: 'google_flights',
      api_key: apiKey,
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.departDate,
      currency: 'USD',
      hl: 'en',
      type: params.returnDate ? '1' : '2',
    })

    if (params.returnDate) searchParams.set('return_date', params.returnDate)

    const cabinMap: Record<string, string> = {
      economy: '1', premium_economy: '2', business: '3', first: '4',
    }
    searchParams.set('travel_class', cabinMap[params.cabinClass] ?? '1')

    const res = await fetch(`https://serpapi.com/search?${searchParams}`)
    if (!res.ok) throw new Error(`SerpApi failed: ${res.status}`)

    const data = await res.json()
    const allFlights = [...(data.best_flights ?? []), ...(data.other_flights ?? [])]
    if (allFlights.length === 0) return null

    const asFlights = allFlights.filter((f: any) =>
      f.flights?.some((seg: any) => seg.airline === 'Alaska Airlines')
    )
    const candidates = asFlights.length > 0 ? asFlights : allFlights
    const best = candidates.sort((a: any, b: any) => a.price - b.price)[0]
    if (!best) return null

    const firstSeg = best.flights?.[0]
    return {
      cashPrice: best.price,
      currency: 'USD',
      flightNumber: firstSeg?.flight_number ?? null,
      durationMinutes: best.total_duration ?? null,
      stops: (best.flights?.length ?? 1) - 1,
    }
  }
}