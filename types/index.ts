export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first'

export interface Watch {
  id: string
  user_id: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: CabinClass
  active: boolean
  created_at: string
}

export interface PriceCheck {
  id: string
  watch_id: string
  checked_at: string
  cash_price: number | null
  cash_currency: string
  miles_price: number | null
  airline: string
  flight_number: string | null
  duration_minutes: number | null
  stops: number
}

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

export interface WatchWithLatestPrice extends Watch {
  latest_cash: number | null
  latest_miles: number | null
  prev_cash: number | null
  prev_miles: number | null
  price_history: PriceCheck[]
}

export interface AmadeusFlightOffer {
  price: {
    total: string
    currency: string
  }
  itineraries: Array<{
    duration: string
    segments: Array<{
      carrierCode: string
      number: string
      departure: { iataCode: string; at: string }
      arrival: { iataCode: string; at: string }
      numberOfStops: number
    }>
  }>
}
