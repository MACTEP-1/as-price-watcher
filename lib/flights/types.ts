import type { CabinClass } from '@/types'

export interface FlightSearchParams {
  origin: string
  destination: string
  departDate: string       // YYYY-MM-DD
  returnDate?: string | null
  cabinClass: CabinClass
  adults?: number
}

export interface CashFareResult {
  cashPrice: number
  currency: string
  flightNumber: string | null
  durationMinutes: number | null
  stops: number
}

/**
 * All cash-price providers implement this interface.
 * To swap providers: change the import in lib/flights/index.ts only.
 */
export interface FlightPriceProvider {
  getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null>
}