/**
 * Pure price/date formatting helpers, split out of lib/utils.ts so they can
 * be imported from the mobile app without dragging in clsx/tailwind-merge
 * (web-only deps `cn` needs, not installed in mobile/node_modules — Metro's
 * resolver is scoped to mobile/node_modules only, so pulling them in here
 * would break the mobile bundle). Nothing in this file imports from
 * next/* or any web-only package, by the same rule lib/watches.ts follows.
 *
 * lib/utils.ts re-exports all of these for existing web callers, so this
 * split changes no import path on the web side.
 */

export function formatCash(amount: number | null, currency = 'USD'): string {
  if (amount === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatMiles(miles: number | null): string {
  if (miles === null) return '—'
  return miles.toLocaleString() + ' mi'
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Short date for a full timestamptz (e.g. `status_changed_at`,
 * `triggered_at`) — NOT for a date-only column like `depart_date`, which
 * needs formatDate's 'T12:00:00' guard against UTC-midnight rollback.
 * A timestamp already carries a real time, so no such guard applies.
 */
export function formatShortDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function pctChange(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev === 0) return null
  return ((current - prev) / prev) * 100
}

export function formatPctChange(pct: number | null): string {
  if (pct === null) return ''
  const rounded = Math.round(pct)
  // A flat price is not an increase. Previously 0 fell through to the ▲
  // branch and rendered as "▲ 0%" in red, reading as bad news.
  if (rounded === 0) return 'no change'
  const sign = rounded < 0 ? '▼ ' : '▲ '
  return `${sign}${Math.abs(rounded)}%`
}

/**
 * Colour for a price change: green when it drops (good for the watcher),
 * red when it rises, neutral grey when flat. Kept next to formatPctChange
 * so the two can't disagree about what counts as "no change".
 */
export function changeColor(pct: number | null): string {
  if (pct === null || Math.round(pct) === 0) return '#94a3b8'
  return pct < 0 ? '#16a34a' : '#ef4444'
}

/**
 * Icon and label for an alert history row — shared so web and mobile can't
 * silently drift out of sync on copy (the type union has three members as
 * of 2026-09-15, not two; a bare ternary here was the original mobile bug
 * this whole feature grew out of fixing).
 */
export function alertIcon(type: 'drop_10pct' | 'new_low' | 'cumulative_drop'): string {
  if (type === 'new_low') return '🏆'
  return '📉'
}

export function alertLabel(type: 'drop_10pct' | 'new_low' | 'cumulative_drop'): string {
  switch (type) {
    case 'new_low':
      return 'New all-time low'
    case 'cumulative_drop':
      // Distinct from drop_10pct's copy on purpose — this fired because of
      // a slow bleed the 7-day-average check structurally can't see (see
      // lib/alerts.ts), against the price the user was last actually told
      // about rather than a rolling average.
      return 'Price down ≥10% since last alert'
    case 'drop_10pct':
      return 'Price dropped ≥10%'
  }
}

/**
 * "AS326" as stored → "AS 326". The provider strips the space SerpApi sends
 * (lib/flights/serpapi-provider.ts) so the value is a stable key; this puts
 * it back for display only.
 */
export function formatFlightNumber(flightNumber: string | null): string | null {
  if (!flightNumber) return null
  const m = flightNumber.match(/^([A-Z]{2})\s*(\d+)$/i)
  return m ? `${m[1].toUpperCase()} ${m[2]}` : flightNumber
}

export function formatStops(stops: number | null): string | null {
  if (stops === null) return null
  if (stops === 0) return 'nonstop'
  return stops === 1 ? '1 stop' : `${stops} stops`
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * One line describing the itinerary a stored price actually belongs to,
 * e.g. "AS 326 · nonstop · 5h 27m". Returns '' when nothing is known.
 *
 * IMPORTANT, and the reason this exists: for a ROUND TRIP these three
 * fields describe the OUTBOUND journey only. SerpApi returns the return
 * legs only behind a second call with a `departure_token`, which the
 * provider skips to stay inside the SerpApi quota — while `price` is
 * already the full round-trip fare. So the card must label this as the
 * outbound, or a one-stop return reads as a nonstop trip. (Fetching the
 * return legs is a deliberate future item, gated on a paid SerpApi plan —
 * see the project status doc, 2026-09-22.)
 */
export function formatItineraryLine(check: {
  flight_number: string | null
  stops: number | null
  duration_minutes: number | null
  legs?: { flight: string | null; from: string | null; to: string | null }[] | null
} | null | undefined): string {
  if (!check) return ''
  return [
    formatRouting(check.legs) ?? formatFlightNumber(check.flight_number),
    formatStops(check.stops),
    formatDuration(check.duration_minutes),
    formatAlaskaLegs(check.legs),
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
}

const isAlaskaLeg = (flight: string | null) => !!flight && /^AS\s*\d/i.test(flight)

/**
 * "LO 412 → LO 3 → AS 6 (ZRH–WAW–ORD–SEA)", or "AS 326 (SEA–TPA)" for a
 * nonstop. Null when legs weren't recorded (rows before migration 005), so
 * the caller falls back to the first flight number alone.
 */
function formatRouting(
  legs: { flight: string | null; from: string | null; to: string | null }[] | null | undefined
): string | null {
  if (!legs?.length) return null
  const flights = legs.map((l) => formatFlightNumber(l.flight) ?? '?').join(' → ')
  const airports = [legs[0].from, ...legs.map((l) => l.to)]
  return airports.every(Boolean) ? `${flights} (${airports.join('–')})` : flights
}

/**
 * Says which leg Alaska actually flies, when that isn't obvious — i.e. on a
 * multi-carrier routing. "Alaska itinerary" in the provider means ANY
 * itinerary with some Alaska leg (lib/flights/serpapi-provider.ts), and on
 * ZRH→SEA/GVA→SEA the first leg was Icelandair, LOT, SAS or TAP (09/23–24),
 * so without this the card read as "tracking Icelandair".
 *
 * - every leg Alaska (the common domestic case): nothing to add
 * - some legs Alaska: "Alaska flies ORD–SEA" (each Alaska leg)
 * - no Alaska leg at all: "no Alaska leg" — the provider's fallback when a
 *   route has no Alaska itinerary; worth saying out loud on an Alaska app
 */
function formatAlaskaLegs(
  legs: { flight: string | null; from: string | null; to: string | null }[] | null | undefined
): string | null {
  if (!legs?.length) return null
  const alaska = legs.filter((l) => isAlaskaLeg(l.flight))
  if (alaska.length === legs.length) return null
  if (alaska.length === 0) return 'no Alaska leg'
  return `Alaska flies ${alaska.map((l) => `${l.from ?? '?'}–${l.to ?? '?'}`).join(', ')}`
}

/**
 * "United has it for $427" — the cheapest fare on any airline in the same
 * search, when it beat the Alaska fare we track (see migration 004 and
 * lib/flights/serpapi-provider.ts). Returns '' when there is nothing to
 * say, which is the common case.
 *
 * Context only, never an alert: lib/alerts.ts deliberately ignores these
 * columns so "price dropped" keeps meaning one thing. The same caveat as
 * the tracked price applies — this is Google's cheapest, which can be an
 * agency fare rather than what that airline's own site charges.
 */
export function formatCompetitorLine(check: {
  competitor_cash_price: number | null
  competitor_airline: string | null
} | null | undefined): string {
  if (!check?.competitor_cash_price) return ''
  const airline = check.competitor_airline ?? 'another airline'
  return `${airline} has it for ${formatCash(check.competitor_cash_price)}`
}

/**
 * A watch's stop limit as shown next to the cabin: "nonstop only",
 * "up to 1 stop", "up to 2 stops" — or null for the default (any), which
 * isn't worth printing. See migration 006.
 */
export function formatStopLimit(maxStops: number | null | undefined): string | null {
  if (maxStops == null) return null
  if (maxStops === 0) return 'nonstop only'
  return maxStops === 1 ? 'up to 1 stop' : `up to ${maxStops} stops`
}

/**
 * What the MILES figure actually covers, as a label suffix: " · one-way",
 * " · any stops", " · one-way · any stops", or "".
 *
 * - one-way: seats.aero is only ever asked about origin→destination on the
 *   depart date, even for a round trip (see 036f772)
 * - any stops: the stop limit filters the CASH search only. seats.aero
 *   records carry a per-cabin "direct available" flag (YDirect, JDirect…),
 *   but its docs don't say whether the record's mileage cost is the direct
 *   one — filtering on it could label a connection's price as nonstop.
 *   Honest label now; filter once a real record has been inspected.
 */
export function milesScope(watch: {
  return_date: string | null
  max_stops?: number | null
}): string {
  const parts: string[] = []
  if (watch.return_date) parts.push('one-way')
  if (watch.max_stops != null) parts.push('any stops')
  return parts.map((p) => ` · ${p}`).join('')
}
