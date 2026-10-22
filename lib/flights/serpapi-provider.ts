/**
 * SerpApi Google Flights provider
 *
 * Sign up: https://serpapi.com
 *   Free tier:   250 searches/month
 *   Starter:     $25/mo for 1,000 searches
 *
 * Env vars:
 *   SERPAPI_KEY            (required)
 *   SERPAPI_STRICT_AS      (optional) "true" = return null when no Alaska
 *                          flight exists on the route, instead of falling
 *                          back to the cheapest flight on any carrier.
 *
 * Quota math (one daily cron run): a legacy 'alaska_leg' itinerary costs
 * 1 search per day; an 'alaska_only' one (every watch created from
 * 2026-10-22) costs 2 — the Alaska-only search plus an unfiltered one for
 * the "cheaper elsewhere" line. Free tier 250/month ≈ 4 alaska_only
 * itineraries at once. Creating a watch spends the same once more.
 */

import type { FlightPriceProvider, FlightSearchParams, CashFareResult } from './types'

const SERPAPI_URL = 'https://serpapi.com/search'

// SerpApi travel_class: 1=economy 2=premium economy 3=business 4=first
const CABIN_MAP: Record<string, string> = {
  economy: '1',
  premium_economy: '2',
  business: '3',
  first: '4',
}

/** A SerpApi itinerary carries one or more legs in `flights[]`. */
interface SerpFlightLeg {
  airline?: string
  flight_number?: string
  departure_airport?: { id?: string; time?: string }
  arrival_airport?: { id?: string; time?: string }
}

interface SerpItinerary {
  price?: number
  total_duration?: number
  flights?: SerpFlightLeg[]
  layovers?: unknown[]
}

/** `flight_number` comes back as "AS 1234". Marketing carrier = the prefix. */
function carrierOf(leg: SerpFlightLeg | undefined): string | null {
  const raw = leg?.flight_number?.trim()
  if (!raw) return null
  const match = raw.match(/^([A-Z0-9]{2})\s*\d+/i)
  return match ? match[1].toUpperCase() : null
}

/**
 * How Google names the marketing carrier, e.g. "United". Falls back to the
 * two-letter code when the name is missing, so the UI always has something
 * to print next to a competitor price.
 */
function airlineNameOf(itin: SerpItinerary): string | null {
  const leg = itin.flights?.[0]
  return leg?.airline ?? carrierOf(leg) ?? null
}

interface SearchResult {
  itineraries: SerpItinerary[]
  priceHistory: { at: string; price: number }[]
}

function isAlaska(itin: SerpItinerary): boolean {
  return (itin.flights ?? []).some(
    (leg) => carrierOf(leg) === 'AS' || leg.airline === 'Alaska Airlines'
  )
}

/**
 * Zero-padded sort key so "AS281" sorts before "AS1000" (a plain string
 * compare would put "AS1000" first).
 */
function flightKey(itin: SerpItinerary): string {
  const raw = itin.flights?.[0]?.flight_number?.replace(/\s+/g, '') ?? ''
  const match = raw.match(/^([A-Z0-9]{2})(\d+)$/i)
  return match ? `${match[1].toUpperCase()}${match[2].padStart(5, '0')}` : raw
}

/**
 * Deterministic ordering. Google Flights routinely returns several Alaska
 * nonstops in the same fare bucket, and SerpApi's result order is not stable
 * between calls — so picking "the first cheapest" made the stored
 * flight_number flip between equal-priced flights while the price never
 * moved. Tie-break explicitly: cheapest → fewest stops → shortest → lowest
 * flight number.
 */
function compareItineraries(a: SerpItinerary, b: SerpItinerary): number {
  if (a.price !== b.price) return a.price! - b.price!

  const aLegs = a.flights?.length ?? Number.MAX_SAFE_INTEGER
  const bLegs = b.flights?.length ?? Number.MAX_SAFE_INTEGER
  if (aLegs !== bLegs) return aLegs - bLegs

  const aDur = a.total_duration ?? Number.MAX_SAFE_INTEGER
  const bDur = b.total_duration ?? Number.MAX_SAFE_INTEGER
  if (aDur !== bDur) return aDur - bDur

  return flightKey(a).localeCompare(flightKey(b))
}

export class SerpApiFlightProvider implements FlightPriceProvider {
  async getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null> {
    if (params.fareScope !== 'alaska_only') {
      const { itineraries: all } = await this.search(params)
      return all.length ? pickAlaskaLeg(all) : null
    }

    // ── All-Alaska (migration 010, user's choice 2026-10-22) ───────────
    // Why: the legacy pick below takes the cheapest itinerary with ANY
    // Alaska leg — on a round trip only the OUTBOUND is visible, so SEA→TPA
    // tracked "$688 Alaska" that was really AS 326 out + Delta DL 1090
    // back (confirmed on Google Flights 10/22), while an Alaska round trip
    // cost $854–932. So: one search restricted to Alaska for the tracked
    // price, plus one unfiltered search for the cheaper-elsewhere line.
    // In parallel, each under its own 8s timeout.
    const [alaskaOnly, unfiltered] = await Promise.allSettled([
      this.search(params, 'AS'),
      this.search(params),
    ])

    // A failed Alaska-only search is an error, not a reason to substitute a
    // different kind of price: one missing day beats a series that quietly
    // mixes "Alaska round trip" with "Alaska there, anyone back".
    if (alaskaOnly.status === 'rejected') throw alaskaOnly.reason
    const others = unfiltered.status === 'fulfilled' ? unfiltered.value.itineraries : []

    if (alaskaOnly.value.itineraries.length === 0) {
      // No all-Alaska trip exists for this search (e.g. ZRH→SEA). Fall back
      // to the legacy pick — the row's fare_scope then says what it is, and
      // the card says the return may be another airline.
      if (unfiltered.status === 'rejected') throw unfiltered.reason
      return others.length ? pickAlaskaLeg(others) : null
    }

    const best = [...alaskaOnly.value.itineraries].sort(compareItineraries)[0]

    // Rival: cheapest itinerary flying NO Alaska leg outbound. Excludes the
    // mixed AS-out/DL-back trips — "Alaska Airlines has it for $688" would
    // be nonsense next to an Alaska price. Null if the unfiltered search
    // failed: the tracked price is still good, the context just goes
    // missing for a day.
    const rival = others
      .filter((it) => !isAlaska(it) && it.price! < best.price!)
      .sort(compareItineraries)[0]

    return {
      ...toResult(best, rival ?? null, 'alaska_only'),
      // Same filtered search, so Google's history describes the same thing
      // we track — the head start for a new watch (lib/price-check-row.ts
      // googleHistoryRows). Verified 10/22: its last point ($854) equalled
      // the cheapest all-Alaska trip returned.
      priceHistory: alaskaOnly.value.priceHistory,
    }
  }

  /**
   * One SerpApi Google Flights request. Returns every priced itinerary
   * (best_flights + other_flights), [] when Google has no results, and
   * throws on anything else (quota, HTTP, timeout).
   */
  private async search(params: FlightSearchParams, includeAirlines?: string): Promise<SearchResult> {
    const apiKey = process.env.SERPAPI_KEY
    if (!apiKey) throw new Error('SERPAPI_KEY env var is not set')

    const query = new URLSearchParams({
      engine: 'google_flights',
      api_key: apiKey,
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.departDate,
      currency: 'USD',
      hl: 'en',
      gl: 'us',
      adults: String(params.adults ?? 1),
      travel_class: CABIN_MAP[params.cabinClass] ?? '1',
      // 1 = round trip, 2 = one way
      type: params.returnDate ? '1' : '2',
    })

    if (params.returnDate) query.set('return_date', params.returnDate)

    // SerpApi's `stops`: 0 = any (its default), 1 = nonstop only, 2 = 1 stop
    // or fewer, 3 = 2 stops or fewer — i.e. our max_stops + 1. Filtering
    // happens inside the same single search, so a stop limit costs no extra
    // quota. If no Alaska itinerary fits the limit, the fallback below picks
    // the cheapest fitting itinerary on any airline (user's choice, 09/24);
    // the card then says "no Alaska leg" (lib/format.ts).
    if (params.maxStops != null) query.set('stops', String(params.maxStops + 1))

    // 'AS' for the all-Alaska search (migration 010). Google then returns
    // only itineraries whose every flight is Alaska — the round trip
    // alaskaair.com itself would sell.
    if (includeAirlines) query.set('include_airlines', includeAirlines)

    // Keep the request inside the cron's 30s budget.
    //
    // This was 20s, which did NOT achieve that: cron-job.org's timeout is a
    // hard 30s (their maximum — not raisable on this account), and the cron
    // route spends that budget on a cold start, several Supabase round trips
    // and, on an alert day, a Resend send. A single 20s fetch left no room,
    // and with the itinerary loop then running sequentially, two routes could
    // reach 40s on their own. That combination produced a real "Failed
    // (timeout)" on 2026-09-08 whose timing breakdown showed ~0s for DNS/
    // connect/TLS and the full 30s waiting on the response body.
    //
    // Measured latency against the live API is ~2s per search, so 8s is still
    // 4x headroom. Exceeding it now costs one null data point for one route on
    // one cycle — the run continues — instead of taking the whole check down.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)

    let data: any
    try {
      const res = await fetch(`${SERPAPI_URL}?${query}`, {
        signal: controller.signal,
      })

      // SerpApi signals quota exhaustion with 401/429 — worth surfacing loudly.
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`SerpApi HTTP ${res.status}: ${text.slice(0, 300)}`)
      }

      data = await res.json()
    } finally {
      clearTimeout(timer)
    }

    // SerpApi also returns 200 with an `error` string for "no results" cases.
    if (typeof data?.error === 'string') {
      if (/hasn't returned any results|no results/i.test(data.error)) return { itineraries: [], priceHistory: [] }
      throw new Error(`SerpApi error: ${data.error}`)
    }

    const all: SerpItinerary[] = [
      ...(data.best_flights ?? []),
      ...(data.other_flights ?? []),
    ].filter((it: SerpItinerary) => typeof it.price === 'number')

    // [[unix seconds, price], ...] — Google's lowest price for THIS search,
    // one point a day. Malformed points are dropped, not guessed at.
    const rawHistory: unknown = data.price_insights?.price_history
    const priceHistory = Array.isArray(rawHistory)
      ? rawHistory
          .filter(
            (pt): pt is [number, number] =>
              Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && pt[1] > 0
          )
          .map(([ts, price]) => ({ at: new Date(ts * 1000).toISOString(), price }))
      : []

    return { itineraries: all, priceHistory }
  }
}

/**
 * The legacy pick ('alaska_leg' itineraries, and the fallback when no
 * all-Alaska trip exists): cheapest itinerary with ANY Alaska leg, else
 * cheapest on any airline.
 */
function pickAlaskaLeg(all: SerpItinerary[]): CashFareResult | null {
  const alaska = all.filter(isAlaska)

  if (alaska.length === 0 && process.env.SERPAPI_STRICT_AS === 'true') {
    return null
  }

  const candidates = alaska.length > 0 ? alaska : all

  // Sort a COPY — Array.sort mutates in place, and `candidates` is a live
  // reference to `alaska` or `all`. See compareItineraries above for why
  // this is a full sort rather than a cheaper "min by price" reduce:
  // ties have to break the same way on every call, or the stored
  // flight_number churns between equal-priced flights.
  const best = [...candidates].sort(compareItineraries)[0]

  // ── Cheapest on ANY airline, for context ───────────────────────────
  //
  // Free: `all` is already in hand — every carrier came back in the same
  // response and our own filter above is what narrows it to Alaska. On
  // SEA→TPA Nov 10–15 that discarded a $427 United fare while tracking
  // Alaska at $686, with nothing in the UI hinting it existed.
  //
  // Reported only when it genuinely beats the tracked fare AND isn't the
  // same itinerary: when the route has no Alaska service at all,
  // `candidates` IS `all`, so `best` is already the cheapest of any
  // airline and there is no "competitor" to name (`airline` on the row
  // describes it instead). Same deterministic ordering, so the airline
  // named doesn't churn between equal-priced rivals.
  const cheapestOverall = [...all].sort(compareItineraries)[0]
  const hasCheaperRival =
    cheapestOverall !== best && cheapestOverall.price! < best.price!

  return toResult(
    best,
    hasCheaperRival ? cheapestOverall : null,
    alaska.length > 0 ? 'alaska_leg' : 'any_airline'
  )
}

/** Shape the tracked itinerary (+ optional cheaper rival) into a result. */
function toResult(
  best: SerpItinerary,
  rival: SerpItinerary | null,
  fareScope: CashFareResult['fareScope']
): CashFareResult {
  const legs = best.flights ?? []
  const firstLeg = legs[0]

  // Even for a round trip, `flights[]` holds ONLY the outbound legs — the
  // return leg requires a second call with `departure_token`, which we skip
  // to stay inside quota. `price`, however, is already the full round-trip
  // fare. So stops/duration describe the outbound journey, and the price
  // covers both directions.
  const stops = Math.max(0, legs.length - 1)

  return {
    cashPrice: best.price!,
    currency: 'USD',
    flightNumber: firstLeg?.flight_number?.replace(/\s+/g, '') ?? null,
    durationMinutes: best.total_duration ?? null,
    stops,
    competitorCashPrice: rival ? rival.price! : null,
    competitorAirline: rival ? airlineNameOf(rival) : null,
    fareScope,
    // All legs, not just the first: on ZRH->SEA the tracked "Alaska
    // itinerary" started with Icelandair/LOT and only a later leg was AS,
    // so the first flight number alone misdescribed it (migration 005).
    legs: legs.map((leg) => ({
      flight: leg.flight_number?.replace(/\s+/g, '') ?? null,
      from: leg.departure_airport?.id ?? null,
      to: leg.arrival_airport?.id ?? null,
    })),
  }
}
