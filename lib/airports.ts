/**
 * Airport lookup for the origin/destination autocomplete on both the web
 * and mobile "new watch" forms (components/AirportAutocomplete.tsx and
 * mobile/components/AirportAutocomplete.tsx). No `next/*` imports, so it's
 * safe to share as-is \u2014 see the header comment on lib/watches.ts for why
 * that rule exists.
 *
 * DATA: lib/airports-data.ts, GENERATED from OurAirports (public domain) by
 * scripts/build-airports.mjs \u2014 3,244 large/medium airports with scheduled
 * service. Regenerate it; don't hand-edit it.
 *
 * This replaced a hand-curated ~170-airport list on 2026-09-23. The small
 * list was fine while it was only a lookup aid, but `9cccc2b` added a
 * "not in our airport list \u2014 double-check the code" hint, which turned
 * every gap into a false warning on a real airport (GVA was the one that
 * surfaced it). The hand list had also gone stale: Palm Beach's code
 * changed PBI → DJT on 2026-08-18, and it still said PBI. This was the
 * planned first step (status doc, 09/18); a live network lookup remains
 * the step after, only if typo-tolerant search or airports outside
 * scheduled service become a real need.
 *
 * Still a lookup aid only \u2014 it does not gate what a user can submit. The
 * API (app/api/watches/route.ts) validates "3 uppercase letters", so a real
 * code this data doesn't know about still works; it just gets the hint.
 */

import { AIRPORT_ROWS } from './airports-data'

export interface Airport {
  code: string
  city: string
  country: string
  name: string
}

/**
 * Case-, accent- AND punctuation-insensitive: "cancun" must find Cancún,
 * "sao paulo" São Paulo, "st thomas" St. Thomas, "ixtapa zihuatanejo"
 * Ixtapa-Zihuatanejo. The old hand list stored plain ASCII, so none of
 * this mattered; the real dataset keeps accents, dots, hyphens and slashes.
 * Punctuation becomes a space (not nothing) so "Sea-Tac" still splits into
 * words and "St.Thomas" can't glue into one.
 */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[./\-\u2013\u2014,'\u2019()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Indexed {
  airport: Airport
  large: boolean
  code: string
  city: string
  name: string
  aliases: string[]
  keywords: string[]
}

// Normalised once at module load \u2014 the search runs on every keystroke.
const INDEX: Indexed[] = AIRPORT_ROWS.map(([code, city, country, name, large, aliases, keywords]) => ({
  airport: { code, city, country, name },
  large: large === 1,
  code: code.toLowerCase(),
  city: norm(city),
  name: norm(name),
  aliases: aliases ? aliases.split('|').map(norm) : [],
  keywords: keywords
    ? keywords
        .split(',')
        .map(norm)
        .filter((k) => k.length > 0)
    : [],
}))

export const AIRPORTS: readonly Airport[] = INDEX.map((i) => i.airport)

const KNOWN_CODES = new Set(AIRPORT_ROWS.map((r) => r[0]))

/**
 * Whether `code` is a known scheduled-service airport. Used ONLY for a
 * soft, non-blocking "double-check this code" hint on the new-watch forms
 * \u2014 never to reject a submission. Added 2026-09-21 after a ZEH→SEA watch
 * (a typo for ZRH) ran 5 daily checks without ever returning a price.
 */
export function isKnownAirport(code: string): boolean {
  return KNOWN_CODES.has(code.trim().toUpperCase())
}

/**
 * Ranked search by code, city, airport name, alias or keyword. An empty
 * query returns [] so the dropdown doesn't dump the list on focus.
 *
 * Rank, best first:
 *   0 exact code · 1 code prefix · 2 city or alias prefix · 3 name prefix
 *   4 keyword prefix · 5 city/alias/name substring · 6 keyword substring
 *   7 code substring
 * Aliases (hand-kept in scripts/build-airports.mjs \u2014 "Maui", "Kona"…) rank
 * with the city because they ARE what people call the place; OurAirports
 * keywords ("NYC", "Sea-Tac", "PBI") rank just below names.
 *
 * Ties: large airports before medium ("Portland" → PDX before PWM, "kona"
 * → KOA before Iran's Konarak), then city, then code \u2014 deterministic, so
 * the list doesn't reshuffle between keystrokes.
 */
export function searchAirports(query: string, limit = 6): Airport[] {
  const q = norm(query)
  if (!q) return []

  const scored: { entry: Indexed; score: number }[] = []
  for (const e of INDEX) {
    let score = -1
    if (e.code === q) score = 0
    else if (e.code.startsWith(q)) score = 1
    else if (e.city.startsWith(q) || e.aliases.some((a) => a.startsWith(q))) score = 2
    else if (e.name.startsWith(q)) score = 3
    else if (e.keywords.some((k) => k.startsWith(q))) score = 4
    else if (e.city.includes(q) || e.name.includes(q) || e.aliases.some((a) => a.includes(q)))
      score = 5
    else if (e.keywords.some((k) => k.includes(q))) score = 6
    else if (e.code.includes(q)) score = 7

    if (score >= 0) scored.push({ entry: e, score })
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.entry.large) - Number(a.entry.large) ||
      a.entry.airport.city.localeCompare(b.entry.airport.city) ||
      a.entry.airport.code.localeCompare(b.entry.airport.code)
  )
  return scored.slice(0, limit).map((s) => s.entry.airport)
}
