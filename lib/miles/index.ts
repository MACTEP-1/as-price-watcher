/**
 * ─── AWARD / MILES PRICE PROVIDER ────────────────────────────────────────────
 *
 * Current options:
 *   SeatsAeroMilesProvider  — seats.aero Pro API (needs SEATS_AERO_KEY)
 *   NoopMilesProvider       — always returns null (miles tracking off)
 *
 * SeatsAeroMilesProvider self-disables when SEATS_AERO_KEY is absent, so it is
 * safe to leave active even before you subscribe — miles simply stay null.
 *
 * NOTE: the old lib/alaska/miles.ts hit an alaskaair.com endpoint that was
 * never verified to exist and failed silently on every call. It has been
 * retired in favour of this module. Do not reinstate it without confirming
 * the endpoint against a real browser network trace.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SeatsAeroMilesProvider } from './seats-aero-provider'
import type { MilesPriceProvider } from './types'

class NoopMilesProvider implements MilesPriceProvider {
  async getCheapestMilesPrice() {
    return null
  }
}

const provider: MilesPriceProvider = new SeatsAeroMilesProvider()
// const provider: MilesPriceProvider = new NoopMilesProvider()

export type { MilesFareResult, MilesSearchParams, MilesPriceProvider } from './types'
export { NoopMilesProvider }
export const getCheapestMilesPrice = provider.getCheapestMilesPrice.bind(provider)