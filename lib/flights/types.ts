import type { CabinClass, FlightLeg } from '@/types'

export interface FlightSearchParams {
  origin: string
  destination: string
  departDate: string       // YYYY-MM-DD
  returnDate?: string | null
  cabinClass: CabinClass
  adults?: number
  /** null/undefined = any; 0 = nonstop only; 1 = up to 1 stop; 2 = up to 2. */
  maxStops?: number | null
}

export interface CashFareResult {
  cashPrice: number
  currency: string
  flightNumber: string | null
  durationMinutes: number | null
  stops: number
  /**
   * Cheapest fare on any airline in the SAME response, when it beats
   * cashPrice — null when Alaska is already cheapest, or when cashPrice is
   * itself a non-Alaska fallback. Costs no extra quota: see the provider.
   */
  competitorCashPrice: number | null
  competitorAirline: string | null
  /**
   * Every outbound leg of the tracked itinerary, in order. flightNumber
   * above stays the FIRST leg for existing readers; this is what shows
   * which leg is actually Alaska on a multi-carrier routing.
   */
  legs: FlightLeg[]
}

/**
 * All cash-price providers implement this interface.
 * To swap providers: change the import in lib/flights/index.ts only.
 */
export interface FlightPriceProvider {
  getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null>
}