import type { CabinClass, FlightLeg, ItineraryFareScope, PriceFareScope } from '@/types'

export interface FlightSearchParams {
  origin: string
  destination: string
  departDate: string       // YYYY-MM-DD
  returnDate?: string | null
  cabinClass: CabinClass
  adults?: number
  /** null/undefined = any; 0 = nonstop only; 1 = up to 1 stop; 2 = up to 2. */
  maxStops?: number | null
  /** Which kind of price to track (migration 010). Absent = 'alaska_leg'. */
  fareScope?: ItineraryFareScope
  /**
   * Pinned flights (migration 012): price exactly these outbound flights,
   * and on a round trip, if given, exactly these return flights. Flight
   * numbers without spaces, in order ('AS623','AS625' for a connection).
   * When set, maxStops and fareScope don't choose anything — the flights do.
   */
  outboundFlights?: string[] | null
  returnFlights?: string[] | null
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
  /** What cashPrice actually is — stored per row as price_checks.fare_scope. */
  fareScope: PriceFareScope
  /**
   * Google's daily lowest price for this exact search over roughly the last
   * 60 days (SerpApi price_insights.price_history), oldest first. Only set
   * for an all-Alaska result — the one case where it describes the same
   * thing we track (same filtered search). Unset otherwise: unfiltered, it's
   * the cheapest fare on ANY airline (~$400 vs ~$680 on SEA→TPA, 10/22).
   */
  priceHistory?: { at: string; price: number }[]
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