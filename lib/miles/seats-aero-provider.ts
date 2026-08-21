/**
 * seats.aero miles/award price provider
 *
 * seats.aero crawls ~28 mileage programs' award search engines on a schedule
 * and serves the results from its own cache. `sources=alaska` is Alaska
 * Mileage Plan / Atmos Rewards.
 *
 * Access: a seats.aero Pro subscription (~$9.99/mo). Generate a key under
 * Settings → API. Pro keys allow ~1,000 calls/day. Not all Pro accounts have
 * API access enabled, and the API is not available in every country.
 *
 * Env vars:
 *   SEATS_AERO_KEY      (required — omit to disable miles tracking entirely)
 *   SEATS_AERO_SOURCES  (optional, default "alaska")
 *
 * Docs: https://developers.seats.aero/reference/getting-started-p
 */

import type { MilesFareResult, MilesSearchParams, MilesPriceProvider } from './types'

const SEARCH_URL = 'https://seats.aero/partnerapi/search'

// seats.aero cabin letters: Y economy, W premium economy, J business, F first
const CABIN_LETTER: Record<string, 'Y' | 'W' | 'J' | 'F'> = {
  economy: 'Y',
  premium_economy: 'W',
  business: 'J',
  first: 'F',
}

const CABIN_NAME: Record<string, string> = {
  economy: 'economy',
  premium_economy: 'premium',
  business: 'business',
  first: 'first',
}

/** seats.aero returns mileage costs as strings on some records, numbers on others. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseInt(value.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

export class SeatsAeroMilesProvider implements MilesPriceProvider {
  async getCheapestMilesPrice(
    params: MilesSearchParams
  ): Promise<MilesFareResult | null> {
    const key = process.env.SEATS_AERO_KEY
    if (!key) return null // miles tracking disabled — cash still works

    const letter = CABIN_LETTER[params.cabinClass] ?? 'Y'

    const query = new URLSearchParams({
      origin_airport: params.origin,
      destination_airport: params.destination,
      start_date: params.departDate,
      end_date: params.departDate,
      sources: process.env.SEATS_AERO_SOURCES ?? 'alaska',
      cabins: CABIN_NAME[params.cabinClass] ?? 'economy',
      take: '100',
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    let data: any
    try {
      const res = await fetch(`${SEARCH_URL}?${query}`, {
        headers: {
          'Partner-Authorization': key,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`seats.aero HTTP ${res.status}: ${text.slice(0, 300)}`)
      }

      data = await res.json()
    } finally {
      clearTimeout(timer)
    }

    const records: any[] = data?.data ?? []
    if (records.length === 0) return null

    // Keep only records that actually have saver space in the requested cabin.
    const costs = records
      .filter((r) => r[`${letter}Available`] === true)
      .map((r) => toNumber(r[`${letter}MileageCost`]))
      .filter((n): n is number => n !== null)

    if (costs.length === 0) return null

    return {
      milesPrice: Math.min(...costs),
      cabin: CABIN_NAME[params.cabinClass] ?? 'economy',
    }
  }
}