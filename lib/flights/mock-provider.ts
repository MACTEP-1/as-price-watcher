/**
 * Mock flight price provider — returns realistic fake data.
 *
 * Use during development to avoid burning real API quota.
 * Swap out in lib/flights/index.ts when ready for production.
 */

import type { FlightPriceProvider, FlightSearchParams, CashFareResult } from './types'

const ROUTE_DURATIONS: Record<string, number> = {
  'SEA-LAX': 175, 'LAX-SEA': 175,
  'SEA-SFO': 115, 'SFO-SEA': 115,
  'SEA-JFK': 315, 'JFK-SEA': 315,
  'SEA-HNL': 360, 'HNL-SEA': 360,
  'SEA-ANC': 215, 'ANC-SEA': 215,
  'PDX-LAX': 165, 'LAX-PDX': 165,
  'SEA-ORD': 270, 'ORD-SEA': 270,
  'SEA-DFW': 255, 'DFW-SEA': 255,
}

const ROUTE_BASE_PRICES: Record<string, number> = {
  'SEA-LAX': 89,  'LAX-SEA': 89,
  'SEA-SFO': 79,  'SFO-SEA': 79,
  'SEA-JFK': 189, 'JFK-SEA': 189,
  'SEA-HNL': 249, 'HNL-SEA': 249,
  'SEA-ANC': 149, 'ANC-SEA': 149,
  'PDX-LAX': 99,  'LAX-PDX': 99,
  'SEA-ORD': 159, 'ORD-SEA': 159,
  'SEA-DFW': 149, 'DFW-SEA': 149,
}

const CABIN_MULTIPLIERS: Record<string, number> = {
  economy: 1.0,
  premium_economy: 1.6,
  business: 2.8,
  first: 3.5,
}

const AS_FLIGHT_NUMBERS = [
  'AS1', 'AS3', 'AS5', 'AS7', 'AS11', 'AS13', 'AS15', 'AS19',
  'AS21', 'AS25', 'AS27', 'AS31', 'AS33', 'AS35', 'AS41', 'AS43',
]

function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) / 2147483647
}

export class MockFlightPriceProvider implements FlightPriceProvider {
  async getCheapestFare(params: FlightSearchParams): Promise<CashFareResult | null> {
    await new Promise(resolve => setTimeout(resolve, 80 + Math.random() * 120))

    const routeKey = `${params.origin}-${params.destination}`
    const seed = `${routeKey}-${params.departDate}-${params.cabinClass}`
    const rand = seededRandom(seed)

    if (rand < 0.15) return null

    const basePrice = ROUTE_BASE_PRICES[routeKey] ?? 199
    const cabinMultiplier = CABIN_MULTIPLIERS[params.cabinClass] ?? 1.0
    const priceVariance = 0.6 + rand * 0.8
    const cashPrice = Math.round(basePrice * cabinMultiplier * priceVariance / 5) * 5

    const baseDuration = ROUTE_DURATIONS[routeKey] ?? 180
    const durationVariance = seededRandom(seed + 'dur')
    const durationMinutes = Math.round(baseDuration * (0.95 + durationVariance * 0.15))

    const stopsRand = seededRandom(seed + 'stops')
    const stops = baseDuration > 240 && stopsRand > 0.7 ? 1 : 0

    const fnIndex = Math.floor(seededRandom(seed + 'fn') * AS_FLIGHT_NUMBERS.length)
    const flightNumber = AS_FLIGHT_NUMBERS[fnIndex]

    return { cashPrice, currency: 'USD', flightNumber, durationMinutes, stops }
  }
}