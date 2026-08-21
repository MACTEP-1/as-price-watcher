/**
 * SerpApi Google Flights provider
 *
 * Sign up: https://serpapi.com
 *   Free tier:   250 searches/month
 *   Starter:     $25/mo for 1,000 searches
 *
 * Env vars:
 *   SERPAPI_KEY            (required)
 *   SERPAPI_STRICT_AS      (optional) "true" = return null when no Alaska
 *                          flight exists on the route, instead of falling
 *                          back to the cheapest flight on any carrier.
 *
 * Quota math: each cron tick spends 1 search per active watch.
 *   every  4h = 6/day  = ~180/mo  → 1 watch on free tier
 *   every  6h = 4/day  = ~120/mo  → 2 watches on free tier
 *   every 12h = 2/day  =  ~60/mo  → 4 watches on free tier
 */

import type { FlightPriceProvider, FlightSearchParams, CashFareResult } from './types'

const SERPAPI_URL = 'https://serpapi.com/search'

// SerpApi travel_class: 1=economy 2=premium economy 3=business 4=first
const CABIN_MAP: Record<string, string> = {
  economy: '1',
  premium_economy: '2',
  business: '3',
  first: '4',
}

/** A SerpApi itinerary carries one or more legs in `flights[]`. */
interface SerpFlightLeg {
  airline?: string
  flight_number?: string
  departure_airport?: { id?: string; time?: string }
  arrival_airport?: { id?: string; time?: string }
}

interface SerpItinerary {
  price?: number
  total_duration?: number
  flights?: SerpFlightLeg[]
  layovers?: unknown[]
}

/** `flight_number` comes back as "AS 1234". Marketing carrier = the prefix. */
function carrierOf(leg: SerpFlightLeg | undefined): string | null {
  const raw = leg?.flight_number?.trim()
  if (!raw) return null
  const match = raw.match(/^([A-Z0-9]{2})\s*\d+/i)
  return match ? match[1].toUpperCase() : null
}

function isAlaska(itin: SerpItinerary): boolean {
  return (itin.flights ?? []).some(
    (leg) => carrierOf(leg) === 'AS' || leg.airline === 'Alaska Airlines'
  )
}

export class SerpApiFlightProvider implements FlightPriceProvider {
  async getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null> {
    const apiKey = process.env.SERPAPI_KEY
    if (!apiKey) throw new Error('SERPAPI_KEY env var is not set')

    const query = new URLSearchParams({
      engine: 'google_flights',
      api_key: apiKey,
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.departDate,
      currency: 'USD',
      hl: 'en',
      gl: 'us',
      adults: String(params.adults ?? 1),
      travel_class: CABIN_MAP[params.cabinClass] ?? '1',
      // 1 = round trip, 2 = one way
      type: params.returnDate ? '1' : '2',
    })

    if (params.returnDate) query.set('return_date', params.returnDate)

    // Keep the request inside the cron's 30s budget.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)

    let data: any
    try {
      const res = await fetch(`${SERPAPI_URL}?${query}`, {
        signal: controller.signal,
      })

      // SerpApi signals quota exhaustion with 401/429 — worth surfacing loudly.
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`SerpApi HTTP ${res.status}: ${text.slice(0, 300)}`)
      }

      data = await res.json()
    } finally {
      clearTimeout(timer)
    }

    // SerpApi also returns 200 with an `error` string for "no results" cases.
    if (typeof data?.error === 'string') {
      if (/hasn't returned any results|no results/i.test(data.error)) return null
      throw new Error(`SerpApi error: ${data.error}`)
    }

    const all: SerpItinerary[] = [
      ...(data.best_flights ?? []),
      ...(data.other_flights ?? []),
    ].filter((it: SerpItinerary) => typeof it.price === 'number')

    if (all.length === 0) return null

    const alaska = all.filter(isAlaska)

    if (alaska.length === 0 && process.env.SERPAPI_STRICT_AS === 'true') {
      return null
    }

    const candidates = alaska.length > 0 ? alaska : all
    const best = candidates.reduce((a, b) => (a.price! <= b.price! ? a : b))

    const legs = best.flights ?? []
    const firstLeg = legs[0]

    // Even for a round trip, `flights[]` holds ONLY the outbound legs — the
    // return leg requires a second call with `departure_token`, which we skip
    // to stay inside quota. `price`, however, is already the full round-trip
    // fare. So stops/duration describe the outbound journey, and the price
    // covers both directions.
    const stops = Math.max(0, legs.length - 1)

    return {
      cashPrice: best.price!,
      currency: 'USD',
      flightNumber: firstLeg?.flight_number?.replace(/\s+/g, '') ?? null,
      durationMinutes: best.total_duration ?? null,
      stops,
    }
  }
}