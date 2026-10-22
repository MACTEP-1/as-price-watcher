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
    // What the price was (migration 010). Null when there's no cash price.
    fare_scope: cash?.fareScope ?? null,
  }
}

/**
 * A new all-Alaska itinerary's head start: Google's own daily price
 * history for the SAME filtered search (CashFareResult.priceHistory),
 * stored as price_checks rows marked source='google_history', cash only.
 *
 * Without it a watch says nothing for a week — lib/alerts.ts needs
 * MIN_CHECKS (7) checks before any alert — and its first alerts compare
 * against just a few days of prices. With it, the first daily run already
 * has ~60 days behind it.
 *
 * Points within RECENT_HOURS of `now` are skipped: Google's last point is
 * today's price, which the real check stored at the same moment already
 * covers, and two rows for one day would double-count it.
 *
 * Only ever called for an itinerary with NO rows yet (the watch-creation
 * path checks), so seeding happens once per itinerary.
 */
const RECENT_HOURS = 20

export function googleHistoryRows(
  itineraryId: string,
  history: { at: string; price: number }[] | undefined,
  now: Date = new Date()
) {
  const cutoff = now.getTime() - RECENT_HOURS * 60 * 60 * 1000
  return (history ?? [])
    .filter((p) => new Date(p.at).getTime() < cutoff)
    .map((p) => ({
      itinerary_id: itineraryId,
      checked_at: p.at,
      cash_price: p.price,
      cash_currency: 'USD',
      miles_price: null,
      airline: 'AS',
      flight_number: null,
      duration_minutes: null,
      stops: 0,
      competitor_cash_price: null,
      competitor_airline: null,
      legs: null,
      fare_scope: 'alaska_only' as const,
      source: 'google_history' as const,
    }))
}
