import type { CashFareResult } from './flights/types'
import type { MilesFareResult } from './miles/types'

/**
 * The ONE place a price_checks row is shaped from provider results.
 *
 * Two call sites write this table: the daily cron
 * (app/api/cron/check-prices/route.ts) and the immediate first check when
 * a watch is created (app/api/watches/route.ts). They used to build the row
 * inline, separately — and drifted: 56818d0 added the competitor columns
 * to the cron's insert only, so every brand-new watch's first check
 * silently lacked them (SEA→TPA, 09/22: no rival stored, though United and
 * Southwest were both $427 that day). Found 2026-09-24 while adding `legs`,
 * which would have been a third field to remember in two places.
 *
 * Any new price_checks column goes HERE, and both inserts get it.
 */
export function priceCheckRow(
  itineraryId: string,
  cash: CashFareResult | null,
  miles: MilesFareResult | null
) {
  return {
    itinerary_id: itineraryId,
    cash_price: cash?.cashPrice ?? null,
    cash_currency: cash?.currency ?? 'USD',
    miles_price: miles?.milesPrice ?? null,
    airline: 'AS',
    flight_number: cash?.flightNumber ?? null,
    duration_minutes: cash?.durationMinutes ?? null,
    stops: cash?.stops ?? 0,
    competitor_cash_price: cash?.competitorCashPrice ?? null,
    competitor_airline: cash?.competitorAirline ?? null,
    // Empty array means the provider didn't map legs (duffel) — store null
    // so the UI falls back to the flight_number-only line, same as old rows.
    legs: cash?.legs?.length ? cash.legs : null,
  }
}
