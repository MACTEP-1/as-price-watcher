/**
 * ─── FLIGHT PRICE PROVIDER ───────────────────────────────────────────────────
 *
 * To switch providers, change ONE line below.
 *
 * Current options:
 *   MockFlightPriceProvider   — fake data, no API key needed (development)
 *   SerpApiFlightProvider     — Google Flights via SerpApi (250 free searches/mo)
 *   DuffelFlightProvider      — Duffel API (live mode only; searches are billed)
 *
 * Required env vars per provider:
 *   Mock:    (none)
 *   SerpApi: SERPAPI_KEY          — optional: SERPAPI_STRICT_AS=true
 *   Duffel:  DUFFEL_ACCESS_TOKEN
 *
 * NOTE: Amadeus was dropped. Its free tier is the "test" environment, which
 * serves synthetic data rather than real Alaska fares, and production access
 * is paid + gated. lib/amadeus/client.ts is kept only for reference.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// import { MockFlightPriceProvider } from './mock-provider'
import { SerpApiFlightProvider } from './serpapi-provider'
// import { DuffelFlightProvider } from './duffel-provider'

// const provider = new MockFlightPriceProvider()
const provider = new SerpApiFlightProvider()
// const provider = new DuffelFlightProvider()

export type { CashFareResult, FlightSearchParams } from './types'
export const getCheapestFare = provider.getCheapestFare.bind(provider)