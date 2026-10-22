export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first'

/**
 * Why a watch was deactivated. Replaces an `active` boolean that meant three
 * different things and, once set, could not tell you which.
 */
export type WatchStatus = 'active' | 'expired' | 'removed' | 'unsubscribed'

/**
 * What an itinerary's tracked price means (migration 010):
 * - 'alaska_only': an all-Alaska trip (SerpApi include_airlines=AS) — what
 *   alaskaair.com would sell. Every watch created from 2026-10-22.
 * - 'alaska_leg': the legacy pick — cheapest itinerary with ANY Alaska leg.
 *   On a round trip only the outbound is checked, so the return can be
 *   another airline (SEA→TPA: AS 326 out, Delta DL 1090 back).
 */
export type ItineraryFareScope = 'alaska_only' | 'alaska_leg'

/**
 * What ONE stored price actually was: an itinerary's scope, or
 * 'any_airline' when no Alaska itinerary existed and the provider fell back.
 * An 'alaska_only' itinerary records 'alaska_leg' on a day no all-Alaska
 * trip existed. Null on rows written before migration 010.
 */
export type PriceFareScope = ItineraryFareScope | 'any_airline'

/**
 * A priceable journey, independent of who is watching it. Unique on
 * (origin, destination, depart_date, return_date, cabin_class) — so N users
 * watching the same trip cost ONE price check, not N.
 *
 * `return_date === null` means one-way. There is deliberately no trip_type
 * column: two sources of truth for one fact drift apart.
 */
export interface Itinerary {
  id: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: CabinClass
  // Stop limit (migration 006): null = any, 0 = nonstop only, 1 = up to 1
  // stop, 2 = up to 2 stops. Part of the itinerary's identity.
  max_stops: number | null
  // Migration 010 — see ItineraryFareScope. Part of the identity.
  fare_scope: ItineraryFareScope
  created_at: string
}

/** One user's subscription to an itinerary. */
export interface Watch {
  id: string
  user_id: string
  itinerary_id: string
  status: WatchStatus
  created_at: string
  // Set by a DB trigger whenever `status` changes — see
  // supabase/migrations/003_watch_status_changed_at.sql.
  status_changed_at: string
}

/** A price observation. Belongs to the itinerary, not to any one watcher. */
/**
 * One flight in the tracked itinerary (migration 005). `flight` is stored
 * without the space SerpApi sends ("AS326"); `from`/`to` are IATA codes.
 */
export interface FlightLeg {
  flight: string | null
  from: string | null
  to: string | null
}

export interface PriceCheck {
  id: string
  itinerary_id: string
  checked_at: string
  cash_price: number | null
  cash_currency: string
  miles_price: number | null
  airline: string
  flight_number: string | null
  duration_minutes: number | null
  stops: number
  // Cheapest fare on any airline in the same search, when it beat the
  // Alaska fare above (migration 004). Null when nothing beat it, or when
  // `airline` is itself a non-Alaska fallback. Display-only — alerts
  // deliberately ignore it (see lib/alerts.ts).
  competitor_cash_price: number | null
  competitor_airline: string | null
  // Outbound legs in order, or null on rows written before migration 005.
  legs: FlightLeg[] | null
  // What this price was (migration 010); null before it — those rows are
  // all 'alaska_leg'/'any_airline' in practice.
  fare_scope?: PriceFareScope | null
  // Migration 011: 'check' = our own daily/creation check; 'google_history'
  // = a day from Google's price history, copied in when the watch was
  // created (cash only). See lib/price-check-row.ts googleHistoryRows.
  source?: 'check' | 'google_history'
}

/**
 * Alerts stay keyed to a WATCH: evaluation happens per itinerary, but
 * delivery and the 24h throttle are per user.
 */
export interface Alert {
  id: string
  watch_id: string
  user_id: string
  triggered_at: string
  alert_type: 'drop_10pct' | 'new_low' | 'cumulative_drop'
  cash_price: number | null
  miles_price: number | null
  prev_cash_price: number | null
  prev_miles_price: number | null
  email_sent: boolean
  /** What the alert was measured against — null on rows before migration 009. */
  baseline_cash_price?: number | null
  baseline_miles_price?: number | null
}

/**
 * A watch with its itinerary flattened in and its recent prices attached —
 * what the UI actually renders. Built by lib/watches.ts so that components
 * never need to know a join happened.
 */
export interface WatchWithLatestPrice {
  id: string
  user_id: string
  status: WatchStatus
  created_at: string
  status_changed_at: string

  itinerary_id: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: CabinClass
  // Stop limit (migration 006): null = any, 0 = nonstop only, 1 = up to 1
  // stop, 2 = up to 2 stops. Part of the itinerary's identity.
  max_stops: number | null

  latest_cash: number | null
  latest_miles: number | null
  prev_cash: number | null
  prev_miles: number | null
  price_history: PriceCheck[]
}
