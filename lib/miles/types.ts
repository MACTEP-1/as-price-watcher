import type { CabinClass } from '@/types'

export interface MilesSearchParams {
  origin: string
  destination: string
  departDate: string // YYYY-MM-DD
  cabinClass: CabinClass
}

export interface MilesFareResult {
  milesPrice: number
  cabin: string
}

/**
 * All award/miles providers implement this interface.
 * To swap providers: change the import in lib/miles/index.ts only.
 *
 * Returning `null` means "no award price available" — never an error. The
 * cron stores miles_price as null and the UI shows a dash.
 */
export interface MilesPriceProvider {
  getCheapestMilesPrice(params: MilesSearchParams): Promise<MilesFareResult | null>
}