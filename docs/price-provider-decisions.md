# AS Price Watcher — data provider decisions

Last updated: 2026-08-21

## Cash prices → SerpApi (Google Flights)

**Active.** `lib/flights/serpapi-provider.ts`, wired in `lib/flights/index.ts`.

- Free tier: **250 searches/month** (shared across cron + on-site search)
- Starter: $25/mo for 1,000 searches
- Env: `SERPAPI_KEY`, optional `SERPAPI_STRICT_AS=true`

Quota math — 1 search per active watch per cron tick:

| Cron interval | per day | per month | watches on free tier |
|---|---|---|---|
| every 4h | 6 | ~180 | 1 |
| every 6h | 4 | ~120 | 2 |
| every 12h | 2 | ~60 | 4 |

## Rejected: Amadeus

Free tier is the **test** environment, which serves synthetic data, not real
Alaska fares. Production access is paid and gated. `lib/amadeus/client.ts`
remains only for reference; it is not imported anywhere.

## Rejected: Duffel

Alaska Airlines *is* available (via Travelport GDS), but:

1. Test mode hits airline **sandbox** environments — same synthetic-data dead
   end as Amadeus. Duffel's own fake carrier ("Duffel Airways", IATA `ZZ`)
   explicitly gives unrealistic schedules and prices.
2. Searching is **not free**. The free allowance is 1,500 searches *per
   confirmed booking*; with zero bookings that is $0.005/search.
3. Live mode requires onboarding as a travel seller.

`lib/flights/duffel-provider.ts` is kept as a stub but its "free to search"
comment is wrong.

## Miles / award prices → seats.aero

`lib/miles/seats-aero-provider.ts`. Self-disables when `SEATS_AERO_KEY` is
absent, so cash tracking works without it.

- seats.aero crawls ~28 mileage programs' award engines on a schedule and
  serves results from its own cache. `sources=alaska` = Alaska Mileage Plan /
  Atmos Rewards.
- Access: Pro subscription ~$9.99/mo → Settings → API → generate key.
  ~1,000 calls/day. Not every Pro account gets API access; not available in
  every country.
- Endpoint: `GET https://seats.aero/partnerapi/search`, header
  `Partner-Authorization: <key>`.
- Semantics: returns the mileage cost only when **saver award space exists**
  in the requested cabin. No space → null → UI shows a dash. That is correct
  behaviour, not a failure.

### Retired: hand-rolled Alaska scraper

`lib/alaska/miles.ts` POSTed to `https://www.alaskaair.com/search/api/award-pricing`,
described in its own comments as "reverse-engineered from DevTools". The
endpoint could not be verified to exist and the payload shape looks invented.
It swallowed every error and returned null, so miles silently never populated.
**Deleted.** Do not reinstate without a real browser network trace.

## Security fix applied at the same time

`POST /api/search` was unauthenticated and fanned out up to **14 SerpApi
searches per request**. Two page loads would have drained a month of free
quota, and anyone could hit it. Now requires a signed-in Supabase user and
caps the range at `SEARCH_MAX_DAYS` (default 5).

## Env vars

```
SERPAPI_KEY=...
SERPAPI_STRICT_AS=false     # optional
SEATS_AERO_KEY=...          # optional — omit to disable miles
SEATS_AERO_SOURCES=alaska   # optional
SEARCH_MAX_DAYS=5           # optional
```