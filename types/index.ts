export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first'

/**
 * Why a watch was deactivated. Replaces an `active` boolean that meant three
 * different things and, once set, could not tell you which.
 */
export type WatchStatus = 'active' | 'expired' | 'removed' | 'unsubscribed'

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
  created_at: string
}

/** One user's subscription to an itinerary. */
export interface Watch {
  id: string
  user_id: string
  itinerary_id: string
  status: WatchStatus
  created_at: string
}

/** A price observation. Belongs to the itinerary, not to any one watcher. */
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
  alert_type: 'drop_10pct' | 'new_low'
  cash_price: number | null
  miles_price: number | null
  prev_cash_price: number | null
  prev_miles_price: number | null
  email_sent: boolean
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

  itinerary_id: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: CabinClass

  latest_cash: number | null
  latest_miles: number | null
  prev_cash: number | null
  prev_miles: number | null
  price_history: PriceCheck[]
}
