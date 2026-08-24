# AS Price Watch

Track Alaska Airlines flight prices — cash fares via Google Flights, award miles via seats.aero — and get email alerts when prices drop, without setting a target price.

## How it works

- Add a route watch (e.g. SEA → LAX, Oct 12, Economy)
- Once a day a cron job fetches the current best Alaska fare and, if miles tracking is enabled, the lowest saver award price
- Several people watching the same trip share one price check — cost scales with distinct itineraries, not with users
- You get an email alert when the price drops ≥10% from the 7-day rolling average, or hits a new all-time low for that route
- The detail page shows cash and miles history on the same chart with low/avg/high stats

## Stack

| Service | Purpose | Tier |
|---------|---------|------|
| [Vercel](https://vercel.com) | Next.js hosting | Hobby (free) |
| [cron-job.org](https://cron-job.org) | Daily scheduler (13:00 UTC) | Free |
| [Supabase](https://supabase.com) | Postgres DB + Auth | Free — 500 MB, 50k MAU |
| [SerpApi](https://serpapi.com) | Cash flight prices | Free — 250 searches/mo |
| [seats.aero](https://seats.aero) | Award/miles prices | **Optional** — Pro ~$9.99/mo |
| [Resend](https://resend.com) | Email alerts | Free — 3,000 emails/mo |

Everything except seats.aero runs on a free tier. Miles tracking is opt-in: without a seats.aero key the app works normally and `miles_price` stays null.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Copy your **Project URL**, **anon key**, and **service role key** from Settings → API

> Use the **legacy JWT** keys (long `eyJ...` strings), not the newer
> `sb_publishable_...` / `sb_secret_...` format — `@supabase/ssr` is wired for
> the legacy shape here.

### 2. SerpApi (cash prices — required)

1. Sign up at [serpapi.com](https://serpapi.com) — free tier, no card
2. Copy your private API key into `SERPAPI_KEY`

**Watch your quota.** The free tier is 250 searches/month, shared between the
cron job and on-site search. One search = one **itinerary** per cron tick —
not one per watch, so N users tracking the same trip cost one call:

| Cron interval | per day | per month | itineraries on free tier |
|---|---|---|---|
| daily (current) | 1 | ~30 | 8 |
| every 12h | 2 | ~60 | 4 |
| every 6h | 4 | ~120 | 2 |

Adjust the schedule in cron-job.org, or move to SerpApi Starter ($25/mo,
1,000 searches).

### 3. seats.aero (miles prices — optional)

1. Subscribe to [seats.aero](https://seats.aero) Pro (~$9.99/mo)
2. Settings → API → generate a key → `SEATS_AERO_KEY`

Skip this entirely if you only care about cash. No code change is needed
either way — the provider self-disables when the key is absent.

Caveats: not every Pro account has API access enabled, and the API is not
available in all countries. Pro keys allow ~1,000 calls/day.

### 4. Resend

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Create an API key
4. Set `ALERT_FROM_EMAIL` to an address at your verified domain

### 5. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

### 6. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 7. Deploy to Vercel

```bash
npx vercel
```

Set all environment variables in the Vercel dashboard (Settings → Environment
Variables), for **Production and Preview**.

### 8. Schedule the cron

Scheduling runs from an external caller rather than Vercel:

1. Create a job at [cron-job.org](https://cron-job.org)
2. URL: `https://<your-app>.vercel.app/api/cron/check-prices`
3. Schedule: daily (`0 13 * * *`)
4. Under **Advanced**, add header `Authorization: Bearer <CRON_SECRET>`

⚠️ **There is deliberately no `vercel.json`.** It used to declare a cron of
its own, and because Vercel injects `Authorization: Bearer $CRON_SECRET`
automatically, that entry authenticated fine and fired every day at 00:00 UTC
alongside this one — silently doubling SerpApi usage. Do not re-add it.

---

## Data sources — and the ones that didn't work

### Cash: SerpApi (Google Flights)

`lib/flights/serpapi-provider.ts`, selected in `lib/flights/index.ts`.

Prefers Alaska-marketed flights — the carrier is parsed from `flight_number`
("AS 673" → `AS`) — and falls back to the cheapest fare on any carrier unless
`SERPAPI_STRICT_AS=true`.

For round trips, SerpApi's first response contains **outbound legs only**;
the return legs require a second call with `departure_token`. `price` is
already the full round-trip fare, so that second call is skipped to conserve
quota. Stops and duration therefore describe the outbound journey.

### Miles: seats.aero

`lib/miles/seats-aero-provider.ts`, selected in `lib/miles/index.ts`.

seats.aero crawls ~28 mileage programs' award engines on a schedule and serves
results from its own cache. `sources=alaska` is Alaska Mileage Plan / Atmos
Rewards. A price is returned only when **saver award space exists** in the
requested cabin — a dash in the UI means no space, not a failure.

### Rejected: Amadeus

Its free tier is the **test** environment, which serves synthetic data rather
than real Alaska fares. Production access is paid and gated.
`lib/amadeus/client.ts` remains for reference and is imported nowhere.

### Rejected: Duffel

Alaska *is* available (via Travelport GDS), but test mode hits airline
sandboxes — the same synthetic-data dead end — and the fallback fake carrier
("Duffel Airways", IATA `ZZ`) has explicitly unrealistic prices. Searching is
also not free: the allowance is 1,500 searches *per confirmed booking*, so at
zero bookings it costs $0.005/search, and live mode requires onboarding as a
travel seller.

### Retired: hand-rolled Alaska scraper

`lib/alaska/miles.ts` POSTed to `https://www.alaskaair.com/search/api/award-pricing`,
described in its own comments as reverse-engineered from DevTools. That
endpoint could not be verified to exist and the payload shape appears
invented. It swallowed every error and returned null, so miles silently never
populated. **Deleted** — do not reinstate without a real browser network trace.

---

## Search endpoint is authenticated

`POST /api/search` requires a signed-in Supabase user and caps the date range
at `NEXT_PUBLIC_SEARCH_MAX_DAYS` (default 5). Each date in a range costs one real SerpApi
search, so an open, uncapped endpoint could drain a month of free quota in a
couple of page loads.

If you move to a paid SerpApi plan, add per-user rate limiting (e.g. Upstash
Redis) before making it anonymous again.

## PWA / mobile install

The app ships a `manifest.json` so Chrome and Safari will offer an "Add to Home
Screen" option. On iOS: Safari → Share → Add to Home Screen.

---

## Project structure

```
app/
  api/
    auth/callback/     — Supabase magic-link callback
    cron/check-prices/ — Cron job (price fetch + alert logic)
    search/            — Multi-date search (auth required, quota-capped)
    watches/           — CRUD endpoints
    alerts/unsubscribe/— One-click email unsubscribe
  dashboard/           — Watch list page
  login/               — Magic-link login
  watches/
    new/               — Add watch form
    [id]/              — Watch detail + price history chart
components/
  Nav.tsx
  WatchCard.tsx         — Dashboard card with sparklines
  PriceSparkline.tsx    — Mini chart for dashboard cards
  PriceHistoryChart.tsx — Full chart for detail page
lib/
  config.ts             — SEARCH_MAX_DAYS, shared client + server
  watches.ts            — getWatchesWithPrices(), getWatchDetail()
  flights/              — CASH prices, swappable provider
    index.ts            — ← the one place to switch provider
    types.ts            — FlightPriceProvider interface
    serpapi-provider.ts — ACTIVE
    mock-provider.ts    — fake data, no key needed
    duffel-provider.ts  — stub, see "Rejected" above
  miles/                — AWARD prices, swappable provider
    index.ts            — ← the one place to switch provider
    types.ts            — MilesPriceProvider interface
    seats-aero-provider.ts — ACTIVE (no-ops without a key)
  amadeus/client.ts     — UNUSED, reference only
  alerts.ts             — Alert trigger logic
  email.ts              — Resend email template
  supabase/             — Server + browser Supabase clients
  utils.ts              — Formatting helpers
supabase/
  schema.sql            — Run once in Supabase SQL editor
docs/                   — Design notes and provider decisions
types/index.ts
```

## Styling note

Tailwind v4 did not apply reliably under Next.js 16 in production, so all
layout uses React inline styles. Keep new components consistent with that —
don't reintroduce Tailwind classes for layout.
