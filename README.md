# AS Price Watch

Track Alaska Airlines flight prices — cash fares (via Amadeus) and award miles (via Alaska's internal API) — and get email alerts when prices drop without setting a target price.

## How it works

- Add a route watch (e.g. SEA → LAX, Oct 12, Economy)
- Every 4 hours the cron job fetches the current best cash fare from Amadeus and the miles price from Alaska's site
- You get an email alert when the price drops ≥10% from the 7-day rolling average, or hits a new all-time low for that route
- The detail page shows cash and miles history on the same chart with low/avg/high stats

## Stack (all free tiers)

| Service | Purpose | Free tier |
|---------|---------|-----------|
| [Vercel](https://vercel.com) | Next.js hosting + cron jobs | Hobby |
| [Supabase](https://supabase.com) | Postgres DB + Auth | 500 MB, 50k MAU |
| [Amadeus](https://developers.amadeus.com) | Cash flight prices | 2,000 API calls/mo (test) |
| [Resend](https://resend.com) | Email alerts | 3,000 emails/mo |

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Copy your **Project URL**, **anon key**, and **service role key** from Settings → API

### 2. Amadeus

1. Sign up at [developers.amadeus.com](https://developers.amadeus.com)
2. Create a new app → get Client ID and Client Secret
3. Start on the **test** environment (sandbox data). When ready, apply for production access.

> ⚠️ The Amadeus test environment returns synthetic flight data, not real Alaska prices. The app still works end-to-end for development; switch `AMADEUS_ENV=production` when you go live.

### 3. Resend

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Create an API key
4. Set `ALERT_FROM_EMAIL` to an address at your verified domain

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

### 5. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Deploy to Vercel

```bash
npx vercel
```

Set all environment variables in the Vercel dashboard (Settings → Environment Variables). The cron job is automatically configured via `vercel.json` — it runs at `:00` every 4 hours UTC.

Vercel crons require the **Hobby** plan (free). The cron calls `GET /api/cron/check-prices` with an `Authorization: Bearer <CRON_SECRET>` header.

---

## Miles pricing note

Alaska Airlines doesn't expose a public award pricing API. The miles fetcher (`lib/alaska/miles.ts`) replicates the internal API calls their website makes. This works well but is fragile — if Alaska redesigns their search, `miles_price` will come back null while cash prices continue working normally. The cron job logs a warning and continues without crashing.

## PWA / mobile install

The app ships a `manifest.json` so Chrome and Safari will offer an "Add to Home Screen" option. On iOS: Safari → Share → Add to Home Screen.

---

## Project structure

```
app/
  api/
    auth/callback/     — Supabase magic-link callback
    cron/check-prices/ — Vercel cron job (price fetch + alert logic)
    watches/           — CRUD endpoints
    alerts/unsubscribe/— One-click email unsubscribe
  dashboard/           — Watch list page
  login/               — Magic-link login
  watches/
    new/               — Add watch form
    [id]/              — Watch detail + price history chart
components/
  Nav.tsx
  WatchCard.tsx        — Dashboard card with sparklines
  PriceSparkline.tsx   — Mini chart for dashboard cards
  PriceHistoryChart.tsx— Full chart for detail page
lib/
  amadeus/client.ts   — Amadeus API (cash prices)
  alaska/miles.ts     — Alaska internal API (miles prices)
  alerts.ts           — Alert trigger logic
  email.ts            — Resend email template
  supabase/           — Server + browser Supabase clients
  utils.ts            — Formatting helpers
supabase/
  schema.sql          — Run once in Supabase SQL editor
types/index.ts
vercel.json           — Cron schedule
```
