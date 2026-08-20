# AS Price Watcher — Project Context

## What This App Does

Tracks Alaska Airlines flight prices (both **cash fares** and **miles/award prices**) for routes and date ranges the user cares about. Sends email alerts when prices drop significantly — no target price needed; alerts fire on smart thresholds (≥10% drop from 7-day rolling average, or new all-time low). Free infrastructure only.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | File-based routing, server components, API routes |
| Database + Auth | Supabase (free tier) | Postgres + magic link / OTP auth |
| Cash prices | Amadeus Flight Offers Search API | Free tier: 2000 calls/month |
| Miles prices | Alaska internal award API scraper | Unofficial; may break if Alaska changes their API |
| Email | Resend | Free tier: 100 emails/day |
| Hosting | Vercel (free tier) | Cron jobs every 4 hours |
| Styling | Tailwind CSS v4 + inline styles | Tailwind v4 was unreliable with Next 16, so critical layout uses inline styles |
| Charts | Recharts | Sparklines + dual-axis price history |
| Language | TypeScript |  |

## UX Philosophy

**Search-first, login-optional.** Like Google Flights — anyone can search and see results without an account. Login (magic link email) is only required when saving a price alert watch. This lowers friction for casual users.

## Data Sources — Important Details

### Cash Prices (swappable provider)
- Provider lives in `lib/flights/` — swap by editing ONE line in `lib/flights/index.ts`
- **Current: Mock** — deterministic fake data, no API key, for development
- **SerpApi** (serpapi.com) — Google Flights scraper, $50/mo for 5k searches, env var: `SERPAPI_KEY`
- **Duffel** (duffel.com) — legitimate airline API, free to search, charges per booking only, env var: `DUFFEL_ACCESS_TOKEN`
- Note: Amadeus self-service portal was decommissioned July 17, 2026 — enterprise only now

### Miles/Award Prices (Alaska internal API)
- Scrapes Alaska's internal API at `https://www.alaskaair.com/search/results`
- **Unofficial** — not documented, may break without warning
- 8-second timeout; gracefully returns null on failure
- Maps cabin classes: economy→coach, business→first

### Why Not Use a Paid Data Provider?
- seats.aero, Skyscanner API, etc. cost money
- Google Flights data is not publicly licensable
- Amadeus free tier covers our use case for personal use
- Award data from Alaska's own app is the most accurate source for their miles prices

## File Structure

```
as-price-watcher/
├── app/
│   ├── layout.tsx              # Root layout, PWA metadata, viewport export
│   ├── globals.css             # Tailwind v4 import, box-sizing reset
│   ├── page.tsx                # Main search page (search-first homepage)
│   ├── login/page.tsx          # Magic link OTP login (all inline styles)
│   ├── dashboard/page.tsx      # Server component: user's watches grid
│   ├── watches/
│   │   ├── new/page.tsx        # Add watch form
│   │   └── [id]/page.tsx       # Watch detail: price history chart, alert log
│   └── api/
│       ├── auth/
│       │   ├── callback/route.ts   # Supabase magic link callback
│       │   └── me/route.ts         # GET current user or 401
│       ├── search/route.ts         # POST: search cash+miles for date range
│       ├── watches/
│       │   ├── route.ts            # GET list, POST create
│       │   └── [id]/route.ts       # DELETE (soft-delete)
│       ├── alerts/
│       │   └── unsubscribe/route.ts # One-click unsubscribe from email
│       └── cron/
│           └── check-prices/route.ts # Vercel cron, runs every 4h
├── components/
│   ├── WatchCard.tsx           # Dashboard card with sparklines
│   ├── PriceSparkline.tsx      # Recharts mini sparkline
│   ├── PriceHistoryChart.tsx   # Full dual-axis Recharts LineChart
│   └── Nav.tsx                 # Top nav
├── lib/
│   ├── flights/
│   │   ├── index.ts            # ← EDIT THIS to swap providers (one line change)
│   │   ├── types.ts            # Shared FlightPriceProvider interface
│   │   ├── mock-provider.ts    # Fake data for development
│   │   ├── serpapi-provider.ts # Google Flights via SerpApi
│   │   └── duffel-provider.ts  # Duffel airline API
│   ├── alaska/miles.ts         # Alaska award scraper, getCheapestMilesPrice()
│   ├── alerts.ts               # evaluateAlerts(), rolling avg logic
│   ├── email.ts                # Resend email template, sendAlertEmail()
│   ├── supabase/
│   │   ├── server.ts           # createSupabaseServerClient(), createSupabaseServiceClient()
│   │   └── client.ts           # createSupabaseBrowserClient()
│   └── utils.ts                # cn(), formatCash(), formatMiles(), formatDate(), pctChange()
├── types/index.ts              # Watch, PriceCheck, Alert, CabinClass interfaces
├── supabase/schema.sql         # Full DB schema — run this in Supabase SQL editor
├── public/
│   ├── manifest.json           # PWA manifest
│   └── icons/                  # PWA icons
├── vercel.json                 # Cron schedule: every 4 hours
├── .env.example                # All required env vars (template)
├── .env.local                  # NOT committed — create locally with real keys
└── CLAUDE.md                   # This file
```

## Database Schema (Supabase)

Three tables with Row Level Security (RLS):

**watches** — a user's saved route+date watch
- id, user_id, origin, destination, depart_date, return_date (nullable), cabin_class, active, created_at

**price_checks** — historical price snapshots (written by cron)
- id, watch_id, checked_at, cash_price, currency, miles_price, flight_number, duration_minutes, stops

**alerts** — log of sent alerts
- id, watch_id, sent_at, trigger_type ('rolling_avg_drop' | 'all_time_low'), cash_price, miles_price, pct_change

**latest_prices** — view joining watches + most recent price_check

## Alert Logic

Fires when EITHER:
1. Cash price drops ≥10% below the 7-day rolling average, OR
2. New all-time low for that watch

Throttled: max 1 alert per watch per 24 hours (prevents spam during volatile pricing).
Cron runs every 4 hours via Vercel.

## Environment Variables

Create `.env.local` in project root (never commit this file):

```bash
# Supabase — get from your project settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # for cron job (bypasses RLS)

# Flight prices — uncomment the one matching your provider in lib/flights/index.ts
# SERPAPI_KEY=...           # serpapi.com
# DUFFEL_ACCESS_TOKEN=...   # duffel.com
# (no key needed for mock provider)

# Resend — from resend.com (need verified domain for production)
RESEND_API_KEY=re_...
ALERT_FROM_EMAIL=alerts@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000   # change to Vercel URL in production
CRON_SECRET=some_random_secret_string       # must match vercel.json cron auth header
```

## Pending Tasks (Before App Works)

1. **Sign up for Amadeus** — https://developers.amadeus.com
   - Create app, get Client ID + Secret
   - Test environment gives free API access
   - Switch to Production for real data (requires approval)

2. **Sign up for Supabase** — https://supabase.com
   - Create project, get URL + anon key + service role key
   - Run `supabase/schema.sql` in Supabase SQL editor to create tables

3. **Sign up for Resend** — https://resend.com
   - Free tier: 100 emails/day, 3000/month
   - Add and verify your domain (or use their onboarding sandbox for testing)

4. **Create `.env.local`** with all the keys above

5. **Add geolocation to app/page.tsx** — detects nearest Alaska hub airport for origin default:

   Add above the component function:
   ```ts
   const HUBS = [
     { code: 'SEA', lat: 47.45, lon: -122.31 },
     { code: 'PDX', lat: 45.59, lon: -122.60 },
     { code: 'ANC', lat: 61.17, lon: -149.99 },
     { code: 'SFO', lat: 37.62, lon: -122.38 },
     { code: 'LAX', lat: 33.94, lon: -118.41 },
     { code: 'JFK', lat: 40.64, lon: -73.78 },
     { code: 'BOS', lat: 42.37, lon: -71.00 },
   ]
   function nearestHub(lat: number, lon: number): string {
     let best = HUBS[0], bestDist = Infinity
     for (const hub of HUBS) {
       const d = Math.hypot(hub.lat - lat, hub.lon - lon)
       if (d < bestDist) { bestDist = d; best = hub }
     }
     return best.code
   }
   ```

   Add after the useState declarations (update import to include useEffect):
   ```ts
   useEffect(() => {
     if (!navigator.geolocation) return
     navigator.geolocation.getCurrentPosition((pos) => {
       setOrigin(nearestHub(pos.coords.latitude, pos.coords.longitude))
     })
   }, [])
   ```

6. **Deploy to Vercel** — connect GitHub repo, add env vars in Vercel dashboard

## Known Issues / Gotchas

- **Tailwind v4 + Next.js 16**: Tailwind classes may not apply reliably. Critical layout components use inline styles instead. Don't fight this — just use inline styles for new components too.
- **Alaska miles API**: Unofficial endpoint. If miles prices stop showing, Alaska may have changed their internal API. Check `lib/alaska/miles.ts` — the URL or payload format may need updating.
- **Amadeus test vs production**: Test environment returns simulated/cached data. Switch `AMADEUS_ENV=production` for real live prices.
- **SVG icons**: Always set explicit `width` and `height` attributes on SVG elements — without them, Next.js may render them fullscreen.
- **next/headers in Next.js 16**: `cookies()` is async — must be `await cookies()`. Already handled in `lib/supabase/server.ts`.
- **SSL issues on Windows with Avast One**: Avast HTTPS scanning intercepts SSL certificates. If npm/git fails with SSL errors, temporarily disable "HTTPS scanning" in Avast One → Menu → Settings → Protection → Core Shields → Web Shield.

## Future Considerations

### For Personal/Private Use
The current setup is fine as-is. Keep the GitHub repo private if you prefer not to expose the project structure (env vars are never committed regardless).

### For Public/Production Use
If you ever want to open this app to other users:

1. **Rate limiting** — Add rate limiting to `/api/search` (e.g., with Upstash Redis). Currently anyone can hammer the Amadeus API using your quota.

2. **Amadeus production tier** — Apply for production access at Amadeus (requires describing your use case). Free production tier allows 2000 calls/month.

3. **Domain + email** — Resend requires a verified domain for production sending. Register a domain, add DNS records in Resend dashboard.

4. **Alaska miles API TOS** — Scraping Alaska's internal API is technically against their ToS. For a public app, consider partnering with a data provider (seats.aero has an API for award data) or only offering cash price tracking.

5. **GDPR / privacy** — If users are in EU, you need a privacy policy and explicit consent for email alerts.

6. **Supabase paid tier** — Free tier pauses projects after 1 week of inactivity. Paid tier ($25/month) keeps it always-on.

7. **Vercel paid tier** — Free tier cron minimum interval is 1 day (daily), not every 4 hours. To run cron every 4 hours, you need Vercel Pro ($20/month). Alternative: use a free external cron service (cron-job.org) to call the endpoint instead.

8. **Error monitoring** — Add Sentry (free tier) to catch API failures silently.

### Potential Features
- Return flight search (currently tracks one-way)
- Price calendar heatmap (best day to fly in a month)
- Push notifications (Web Push API) instead of email
- Multiple currency support
- Seat map availability tracking
- Comparison mode (AS miles vs cash vs competitor cash)
- Mobile app via Capacitor (wraps the PWA in a native shell for app store distribution)

## How Claude AI Fits In (Using Cursor)

- **Ctrl+L** — Chat panel; ask questions or request changes, can reference files with @filename
- **Ctrl+K** — Inline edit at cursor position; describe what you want and it edits in place
- **Ctrl+Shift+L** — Adds current file to chat context automatically
- Open the whole `as-price-watcher/` folder in Cursor (not individual files) for best context

When asking Cursor to make changes, reference this file with `@CLAUDE.md` to give it full project context.

## Development Commands

```bash
npm run dev        # Start local dev server at localhost:3000
npm run build      # Production build (catches type errors)
npm run lint       # ESLint check
```

## Git / GitHub

- Repo: https://github.com/[your-username]/as-price-watcher
- Main branch: `main`
- `.env.local` is gitignored — never committed
- `node_modules/` is gitignored
