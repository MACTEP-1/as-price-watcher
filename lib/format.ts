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
} | null | undefined): string {
  if (!check) return ''
  return [
    formatFlightNumber(check.flight_number),
    formatStops(check.stops),
    formatDuration(check.duration_minutes),
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
}
