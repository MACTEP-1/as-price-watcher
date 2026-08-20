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
  const sign = pct < 0 ? '▼ ' : '▲ '
  return `${sign}${Math.abs(Math.round(pct))}%`
}
