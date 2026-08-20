/**
 * Amadeus API client — cash flight prices
 *
 * Free tier: https://developers.amadeus.com
 * Env vars required:
 *   AMADEUS_CLIENT_ID
 *   AMADEUS_CLIENT_SECRET
 *   AMADEUS_ENV  ("test" | "production")  — defaults to "test"
 */

import type { CabinClass } from '@/types'

const BASE_URL =
  process.env.AMADEUS_ENV === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com'

// ─── Token cache (module-level, lives for the lifetime of a serverless invocation) ───
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken
  }

  const res = await fetch(`${BASE_URL}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID!,
      client_secret: process.env.AMADEUS_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Amadeus auth failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  cachedToken = data.access_token as string
  tokenExpiresAt = Date.now() + data.expires_in * 1000
  return cachedToken
}

// ─── Cabin class mapping ───
const AMADEUS_CABIN: Record<CabinClass, string> = {
  economy: 'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business: 'BUSINESS',
  first: 'FIRST',
}

export interface CashFareResult {
  cashPrice: number
  currency: string
  flightNumber: string | null
  durationMinutes: number | null
  stops: number
}

function isoDurationToMinutes(iso: string): number | null {
  // e.g. "PT2H35M"
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return null
  const hours = parseInt(match[1] ?? '0')
  const minutes = parseInt(match[2] ?? '0')
  return hours * 60 + minutes
}

/**
 * Returns the cheapest Alaska Airlines (AS) one-way or round-trip fare.
 * Falls back to any carrier if no AS flights found.
 */
export async function getCheapestFare(params: {
  origin: string
  destination: string
  departDate: string       // YYYY-MM-DD
  returnDate?: string | null
  cabinClass: CabinClass
  adults?: number
}): Promise<CashFareResult | null> {
  const token = await getAccessToken()

  const searchParams = new URLSearchParams({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departDate,
    adults: String(params.adults ?? 1),
    travelClass: AMADEUS_CABIN[params.cabinClass],
    max: '10',
    currencyCode: 'USD',
  })

  if (params.returnDate) {
    searchParams.set('returnDate', params.returnDate)
  }

  const res = await fetch(
    `${BASE_URL}/v2/shopping/flight-offers?${searchParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) {
    if (res.status === 400) return null  // no flights found
    const text = await res.text()
    throw new Error(`Amadeus flight-offers failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const offers: any[] = data.data ?? []
  if (offers.length === 0) return null

  // Prefer Alaska (AS) flights; fall back to any
  const asOffers = offers.filter((o) =>
    o.itineraries.some((it: any) =>
      it.segments.some((seg: any) => seg.carrierCode === 'AS')
    )
  )
  const candidates = asOffers.length > 0 ? asOffers : offers

  // Cheapest
  const best = candidates.reduce((a: any, b: any) =>
    parseFloat(a.price.total) < parseFloat(b.price.total) ? a : b
  )

  const firstSeg = best.itineraries[0].segments[0]
  const allSegs: any[] = best.itineraries.flatMap((it: any) => it.segments)
  const stops = allSegs.length - (params.returnDate ? 2 : 1)

  const totalMinutes = best.itineraries.reduce((sum: number, it: any) => {
    const m = isoDurationToMinutes(it.duration)
    return sum + (m ?? 0)
  }, 0)

  return {
    cashPrice: parseFloat(best.price.total),
    currency: best.price.currency ?? 'USD',
    flightNumber: `${firstSeg.carrierCode}${firstSeg.number}`,
    durationMinutes: totalMinutes || null,
    stops: Math.max(0, stops),
  }
}
