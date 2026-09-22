/**
 * A "go look at this trip" link for the price we stored.
 *
 * Points at GOOGLE FLIGHTS, not alaskaair.com, on purpose: the cash number
 * comes from Google via SerpApi, and the two genuinely disagree. Observed
 * 2026-09-22 on SEA→TPA Nov 10–15: Google showed $686 for Alaska's AS 326
 * nonstop while alaskaair.com's cheapest fare for that same flight was $932
 * (Main). Linking to Alaska would send the user somewhere the tracked price
 * doesn't exist; linking to Google lands them where it does, with Alaska's
 * own booking one click further on.
 *
 * This is a SEARCH prefill, not a link to one itinerary — Google's
 * per-itinerary links are opaque, short-lived tokens, and the point here is
 * "show me this route on these dates" rather than "hold this exact fare".
 * The cabin word is included because Google's natural-language search does
 * honour it; it is not guaranteed, which is another reason this is framed
 * as a search rather than a booking.
 *
 * No `next/*` imports — shared with mobile per lib/watches.ts's rule.
 */

const CABIN_PHRASE: Record<string, string> = {
  economy: '',
  premium_economy: 'premium economy',
  business: 'business class',
  first: 'first class',
}

export function googleFlightsUrl(itinerary: {
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  cabin_class: string
}): string {
  const cabin = CABIN_PHRASE[itinerary.cabin_class] ?? ''
  const q = [
    'Flights from',
    itinerary.origin,
    'to',
    itinerary.destination,
    'on',
    itinerary.depart_date,
    itinerary.return_date ? `through ${itinerary.return_date}` : 'one way',
    cabin,
  ]
    .filter(Boolean)
    .join(' ')

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`
}
