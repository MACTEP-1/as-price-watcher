/**
 * ─── SWAP PROVIDER HERE ───────────────────────────────────────────────────────
 * Comment/uncomment ONE provider. That's the only file you need to change.
 *
 * Mock:    no API key needed (development)
 * SerpApi: add SERPAPI_KEY to .env.local
 * Duffel:  add DUFFEL_ACCESS_TOKEN to .env.local
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MockFlightPriceProvider } from './mock-provider'
// import { SerpApiFlightProvider } from './serpapi-provider'
// import { DuffelFlightProvider } from './duffel-provider'

const provider = new MockFlightPriceProvider()
// const provider = new SerpApiFlightProvider()
// const provider = new DuffelFlightProvider()

export type { CashFareResult, FlightSearchParams } from './types'
export const getCheapestFare = provider.getCheapestFare.bind(provider)