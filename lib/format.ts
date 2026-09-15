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
