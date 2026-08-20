/**
 * Duffel flight price provider
 * Sign up: https://duffel.com
 * Env var: DUFFEL_ACCESS_TOKEN
 */

import type { FlightPriceProvider, FlightSearchParams, CashFareResult } from './types'

export class DuffelFlightProvider implements FlightPriceProvider {
  async getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null> {
    const token = process.env.DUFFEL_ACCESS_TOKEN
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN env var is not set')

    const body = {
      data: {
        slices: [
          { origin: params.origin, destination: params.destination, departure_date: params.departDate },
          ...(params.returnDate ? [{ origin: params.destination, destination: params.origin, departure_date: params.returnDate }] : []),
        ],
        passengers: [{ type: 'adult' }],
        cabin_class: params.cabinClass,
      },
    }

    const res = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Duffel-Version': 'v2',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Duffel failed: ${res.status}`)

    const data = await res.json()
    const offers: any[] = data.data?.offers ?? []
    if (offers.length === 0) return null

    const asOffers = offers.filter((o: any) =>
      o.slices?.some((s: any) => s.segments?.some((seg: any) => seg.operating_carrier?.iata_code === 'AS'))
    )
    const candidates = asOffers.length > 0 ? asOffers : offers
    const best = candidates.sort((a: any, b: any) => parseFloat(a.total_amount) - parseFloat(b.total_amount))[0]

    const firstSlice = best.slices?.[0]
    const firstSeg = firstSlice?.segments?.[0]
    const durationMatch = firstSlice?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    const durationMinutes = durationMatch
      ? parseInt(durationMatch[1] ?? '0') * 60 + parseInt(durationMatch[2] ?? '0')
      : null

    return {
      cashPrice: parseFloat(best.total_amount),
      currency: best.total_currency ?? 'USD',
      flightNumber: firstSeg ? `${firstSeg.operating_carrier?.iata_code}${firstSeg.operating_carrier_flight_number}` : null,
      durationMinutes,
      stops: (firstSlice?.segments?.length ?? 1) - 1,
    }
  }
}