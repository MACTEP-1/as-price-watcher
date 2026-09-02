import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Price/date formatting helpers now live in lib/format.ts (no web-only
// deps, so mobile can import them too) — re-exported here so existing
// '@/lib/utils' imports on the web side don't need to change.
export {
  formatCash,
  formatMiles,
  formatDate,
  pctChange,
  formatPctChange,
  changeColor,
} from './format'
