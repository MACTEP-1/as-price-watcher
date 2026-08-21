# AS Price Watcher — data provider decisions

Last updated: 2026-08-21

Verified: `npm run build` passes clean (13 routes, TypeScript OK) and both
providers were probed against fixtures.

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
| daily | 1 | ~30 | 8 |

**Actual schedule is daily at 6:00 AM local (13:00 UTC)** via cron-job.org.
~30 searches/month, lots of headroom.

**Round-trip gotcha (bug found and fixed during testing).** For `type=1`,
SerpApi's initial response contains only the **outbound** legs in `flights[]`;
the return legs need a second call with `departure_token`. But `price` is
already the full round-trip fare. Stop count must therefore be
`legs.length - 1`, not `legs.length - 2`. The second call is deliberately
skipped — it would double quota use for data we don't display.

**AS detection.** The original implementation filtered on
`seg.airline_logo?.includes('alaska')`, a URL substring match that would have
silently never matched. Now the marketing carrier is parsed out of
`flight_number` ("AS 673" → `AS`).

**Tie-breaking (fixed 2026-08-21).** Google Flights returns several Alaska
nonstops in the same fare bucket, and SerpApi's result order is not stable
between calls. The original `reduce` picked "the first cheapest", so the
stored `flight_number` flipped between equal-priced flights while the price
never moved — observed live as AS281 → AS623, both $609, both nonstop,
297 min, ten hours apart.

Replaced with an explicit comparator: cheapest → fewest stops → shortest
duration → lowest flight number. Flight numbers are zero-padded before
comparison, otherwise a string compare puts AS1000 ahead of AS281. The sort
runs on a copy, since `candidates` aliases `alaska`/`all`.

Side effect worth knowing: among same-priced options the provider now prefers
a nonstop over a connection, and the faster of two nonstops. Previously both
were coin flips.

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
absent, so cash tracking works without it and subscribing later needs no code
change.

- seats.aero crawls ~28 mileage programs' award engines on a schedule and
  serves results from its own cache. `sources=alaska` = Alaska Mileage Plan /
  Atmos Rewards.
- Access: Pro subscription ~$9.99/mo → Settings → API → generate key.
  ~1,000 calls/day. Not every Pro account gets API access; not available in
  every country.
- Endpoint: `GET https://seats.aero/partnerapi/search`, header
  `Partner-Authorization: <key>`.
- Mileage costs come back as strings on some records and numbers on others —
  the provider coerces both.
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

## Known issue — alert noise at low history

`evaluateAlerts` fires `new_low` whenever the latest price is below the
minimum of all previous checks. At `history.length === 2` that means any
decrease at all — a $2 dip sends "🏆 New all-time low!". The 7-day rolling
average has the same shape: early on it averages a single data point, so the
10% rule degrades to "10% below yesterday".

On a daily schedule this noisy window lasts about a week. **Fix before
enabling Resend**: add a minimum-history guard (e.g. require 5+ checks) in
`lib/alerts.ts`.

## Env vars

```
SERPAPI_KEY=...
SERPAPI_STRICT_AS=false     # optional
SEATS_AERO_KEY=...          # optional — omit to disable miles
SEATS_AERO_SOURCES=alaska   # optional
SEARCH_MAX_DAYS=5           # optional
```

## Still open

- Alert minimum-history guard (see above) — do this first
- Resend email alerts not yet configured/tested
- seats.aero subscription for miles (optional, ~$9.99/mo)
- UI review, deferred
- Cron loop is sequential at ~5.8s per watch; cron-job.org caps at 30s, so
  ~5 watches is the ceiling before it needs parallelising
