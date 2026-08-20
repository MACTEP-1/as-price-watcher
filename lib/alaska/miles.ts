/**
 * Alaska Airlines miles/award price fetcher
 *
 * Alaska's website calls an internal GraphQL-like API.
 * This module replicates those calls to fetch award pricing
 * without requiring a full browser.
 *
 * ⚠️  Internal API — may break if Alaska updates their site.
 *     If it does, the cron job logs the error and skips miles_price (leaves null).
 *     The cash price from Amadeus is always the source of truth.
 *
 * Env var (optional):
 *   ALASKA_USER_AGENT  — override the User-Agent header
 */

export interface MilesFareResult {
  milesPrice: number
  cabin: string
}

// Alaska's internal award search endpoint (reverse-engineered from their website)
const ALASKA_AWARD_URL =
  'https://www.alaskaair.com/search/api/award-pricing'

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * Returns the lowest saver-level award price in miles for Alaska/partner flights.
 * Returns null if award pricing is unavailable or the endpoint is unreachable.
 */
export async function getCheapestMilesPrice(params: {
  origin: string
  destination: string
  departDate: string   // YYYY-MM-DD
  cabin: string        // 'coach' | 'first'
}): Promise<MilesFareResult | null> {
  try {
    // Alaska's search page sends a POST to their pricing API.
    // Payload shape reverse-engineered from browser DevTools network tab.
    const body = {
      origin: params.origin,
      destination: params.destination,
      departDate: params.departDate,
      passengerCount: 1,
      awardType: 'saver',
      cabin: params.cabin === 'first' ? 'first' : 'coach',
    }

    const res = await fetch(ALASKA_AWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': process.env.ALASKA_USER_AGENT ?? DEFAULT_UA,
        Referer: 'https://www.alaskaair.com/search/results',
        Origin: 'https://www.alaskaair.com',
      },
      body: JSON.stringify(body),
      // Short timeout — we don't want the cron to hang on this
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      console.warn(`[alaska-miles] API returned ${res.status} — skipping miles`)
      return null
    }

    const data = await res.json()

    // Expected shape: { fares: [{ milesRequired: number, cabin: string }, ...] }
    const fares: Array<{ milesRequired: number; cabin: string }> =
      data?.fares ?? data?.data?.fares ?? []

    if (fares.length === 0) return null

    const best = fares.reduce((a, b) =>
      a.milesRequired < b.milesRequired ? a : b
    )

    return { milesPrice: best.milesRequired, cabin: best.cabin }
  } catch (err: unknown) {
    // Network error, timeout, JSON parse failure — all are non-fatal
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.warn('[alaska-miles] Request timed out')
    } else {
      console.warn('[alaska-miles] Unexpected error:', err)
    }
    return null
  }
}

/**
 * Map our cabin_class to Alaska's cabin names
 */
export function toAlaskaCabin(cabinClass: string): 'coach' | 'first' {
  return cabinClass === 'first' || cabinClass === 'business' ? 'first' : 'coach'
}
