import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
