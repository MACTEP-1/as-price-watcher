# AS Price Watcher — Project Context

## What This App Does

Tracks Alaska Airlines flight prices (both **cash fares** and **miles/award prices**) for routes and date ranges the user cares about. Sends email alerts when prices drop significantly — no target price needed; alerts fire on smart thresholds (≥10% drop from 7-day rolling average, or new all-time low). Free infrastructure only.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | File-based routing, server components, API routes |
| Database + Auth | Supabase (free tier) | Postgres + magic link / OTP auth |
| Cash prices | SerpApi (Google Flights engine) | Free tier: 250 searches/month |
| Miles prices | seats.aero Partner API | Needs seats.aero Pro (~$9.99/mo); optional |
| Email | Resend | Free tier: 100 emails/day |
| Hosting | Vercel (free tier) | Cron jobs every 4 hours |
| Styling | Tailwind CSS v4 + inline styles | Tailwind v4 was unreliable with Next 16, so critical layout uses inline styles |
| Charts | Recharts | Sparklines + dual-axis price history |
| Language | TypeScript |  |

## UX Philosophy

**Search-first, login-required-to-search.** The homepage still leads with search, but `/api/search` now requires a signed-in user. Reason: every date in a search range costs one real SerpApi call against a 250/month quota, and an open endpoint could be drained by anyone in two page loads. If you move to a paid SerpApi plan plus rate limiting, this can go back to being anonymous.

## Data Sources — Important Details

### Cash Prices (SerpApi → Google Flights)
- `lib/flights/serpapi-provider.ts`, selected in `lib/flights/index.ts`
- Prefers AS-marketed flights (carrier prefix parsed from `flight_number`),
  falls back to the cheapest on any carrier unless `SERPAPI_STRICT_AS=true`
- Free tier: **250 searches/month**, shared between the cron and on-site search
- Round trips: SerpApi returns outbound legs only in `flights[]`, but `price`
  is already the full round-trip fare. Stops/duration therefore describe the
  outbound journey. Fetching return legs needs a second call
  (`departure_token`) and would double quota use — deliberately skipped.

Quota math — 1 search per active watch per cron tick:

| Cron interval | per day | per month | watches on free tier |
|---|---|---|---|
| every 4h | 6 | ~180 | 1 |
| every 6h | 4 | ~120 | 2 |
| every 12h | 2 | ~60 | 4 |

### Miles/Award Prices (seats.aero)
- `lib/miles/seats-aero-provider.ts`, selected in `lib/miles/index.ts`
- **Self-disables when `SEATS_AERO_KEY` is unset** — cash tracking works fine
  without it and miles simply stay null. Subscribing needs no code change.
- `GET https://seats.aero/partnerapi/search`, header `Partner-Authorization`
- `sources=alaska` is Alaska Mileage Plan / Atmos Rewards
- Returns a mileage cost only when **saver award space exists** in the
  requested cabin. No space → null → UI shows a dash. That is correct, not a bug.
- Pro subscription ~$9.99/mo, ~1,000 calls/day. Not every Pro account gets API
  access enabled, and the API is geo-restricted in some countries.

### Rejected Providers — do not revisit without reading this

**Amadeus.** Its free tier is the *test* environment, which serves synthetic
data, not real Alaska fares. Production is paid and gated. `lib/amadeus/client.ts`
survives for reference only and is imported nowhere.

**Duffel.** Alaska *is* available (via Travelport GDS), but test mode hits
airline sandboxes — the same synthetic-data dead end — and their fallback fake
carrier ("Duffel Airways", IATA `ZZ`) has explicitly unrealistic prices.
Searching is also not free: the allowance is 1,500 searches *per confirmed
booking*, so with zero bookings it is $0.005/search, and live mode requires
onboarding as a travel seller.

**The old hand-rolled Alaska scraper.** `lib/alaska/miles.ts` POSTed to
`https://www.alaskaair.com/search/api/award-pricing`, described in its own
comments as reverse-engineered. That endpoint could not be verified to exist
and the payload shape appears invented. It swallowed every error and returned
null, so miles silently never populated. **Deleted.** Do not reinstate without
a real browser network trace.

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
│   ├── flights/                # CASH prices — swappable provider
│   │   ├── index.ts            # ← the ONE place to switch provider
│   │   ├── types.ts            # FlightPriceProvider interface
│   │   ├── serpapi-provider.ts # ACTIVE
│   │   ├── mock-provider.ts    # fake data, no key needed
│   │   └── duffel-provider.ts  # stub, see "Rejected Providers"
│   ├── miles/                  # AWARD prices — swappable provider
│   │   ├── index.ts            # ← the ONE place to switch provider
│   │   ├── types.ts            # MilesPriceProvider interface
│   │   └── seats-aero-provider.ts  # ACTIVE (no-ops without a key)
│   ├── amadeus/client.ts       # UNUSED — reference only, see "Rejected Providers"
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

# SerpApi — from serpapi.com (free tier: 250 searches/month)
SERPAPI_KEY=your_serpapi_key
SERPAPI_STRICT_AS=false   # true = null instead of a non-AS fallback fare

# seats.aero — OPTIONAL. Omit to disable miles tracking entirely.
# Requires seats.aero Pro; key from Settings > API.
SEATS_AERO_KEY=
SEATS_AERO_SOURCES=alaska

# Max days per /api/search request — each day costs one SerpApi search
SEARCH_MAX_DAYS=5

# Resend — from resend.com (need verified domain for production)
RESEND_API_KEY=re_...
ALERT_FROM_EMAIL=alerts@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000   # change to Vercel URL in production
CRON_SECRET=some_random_secret_string       # must match vercel.json cron auth header
```

## Status

**Live, and the full loop works.** https://as-price-watcher.vercel.app,
as of 2026-08-21.

```
cron-job.org → /api/cron/check-prices → SerpApi → Google Flights
            → Supabase → evaluateAlerts → Resend → inbox
```

Done:
- ✅ Supabase project, schema, magic-link auth (confirmed end-to-end in prod)
- ✅ Vercel deploy
- ✅ External cron on cron-job.org, `Authorization: Bearer <CRON_SECRET>`
- ✅ SerpApi wired in and verified — real Alaska fare in `price_checks`
      (AS281, $609, nonstop, 297 min, BNA→SEA)
- ✅ Deterministic tie-breaking in the SerpApi provider (see
      docs/price-provider-decisions.md)
- ✅ Alert noise guards in `lib/alerts.ts`
- ✅ Resend email alerts — **verified end-to-end**
- ✅ RLS audit + fix — removed two policies that allowed public writes to
      `price_checks` and `alerts`; made `latest_prices` `security_invoker`
- ✅ `CRON_SECRET` rotated 2026-08-21
- ✅ All pages converted from Tailwind to inline styles

See **Secrets and environment variables** below for how to rotate things.

### Live configuration — read this before debugging email

| Thing | Value |
|---|---|
| Cron schedule | **Daily, 6:00 AM local = 13:00 UTC** (not every 4h) |
| SerpApi usage | ~30 searches/month against a 250 free-tier limit |
| App login / alert recipient | a Hotmail address — look it up, see below |
| Resend sender | `onboarding@resend.dev` (no domain verified) |
| Earliest genuine alert | **Tue 2026-08-26** — see below |

**The recipient address is load-bearing.** Alerts go to the Supabase user's
email, looked up by the cron via `supabase.auth.admin.getUserById()`. Because
the sender is `onboarding@resend.dev` — Resend's shared testing domain — it
**only delivers to the email that owns the Resend account**.

So there is one invariant to preserve:

> The Resend account owner's email MUST equal the app user's email.

A valid API key from a Resend account under any *other* address will 403 on
every send while looking perfectly configured. This is the single most likely
cause of "alerts stopped working".

To see the current value, query it rather than trusting a note — Supabase →
SQL Editor:

```sql
select w.origin || ' → ' || w.destination as route, u.email
from watches w
join auth.users u on u.id = w.user_id
where w.active = true;
```

Whatever that returns is the address that must own the Resend account. Check
it against Resend → Settings → the account email. (The address is deliberately
not written down here — it is PII, and this file is in git.)

To send to anyone else, verify a domain in Resend and change
`ALERT_FROM_EMAIL`. `lib/email.ts` already reads it from env — no code change.

**Why no alerts until Aug 26:** `ALERT_MIN_CHECKS` defaults to 5 and the cron
runs once a day, so five days of history must accumulate first. Silence before
then is expected behaviour, not a fault.

### How email was verified (2026-08-21)

Real conditions couldn't produce an alert (2 checks, flat price), so it was
forced:

1. `delete from alerts; delete from price_checks;`
2. Inserted four synthetic checks at $890–910, dated 1–4 days back
3. Ran a cron test run → `{"status":"alert fired","type":"new_low"}`
4. "🔔 New price low: BNA → SEA" arrived in Hotmail showing $609
5. Deleted the seed data so it wouldn't skew the chart or rolling average

Repeat that recipe to re-test after changing alert logic. Always clean up
step 5 — synthetic rows poison the 7-day average for a week.

## Pending Tasks

1. **Bearer-token auth helper** — NEXT. Every API route authenticates via
   cookies (`createSupabaseServerClient` → `next/headers`). A React Native
   client sends `Authorization: Bearer <token>` and would get 401. ~15-line
   helper: check the header first, fall back to the cookie client. Web
   unchanged. This is the first real step toward the Expo app.

2. **seats.aero for miles** — optional, ~$9.99/mo. Set `SEATS_AERO_KEY` and
   miles start populating. No code change required.

3. **UI review** — deferred. Pages work but haven't had a design pass since
   the Tailwind → inline-styles conversion.

## Secrets and environment variables

### Which vars should be Sensitive

Mark **Sensitive** in Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `SERPAPI_KEY`,
`RESEND_API_KEY`, `SEATS_AERO_KEY`, `CRON_SECRET`.

Leave **plain**: everything `NEXT_PUBLIC_*` (it ships in the browser bundle
regardless, so hiding it buys nothing and makes it impossible to verify),
plus config values like `ALERT_FROM_EMAIL`, `SEARCH_MAX_DAYS`,
`SERPAPI_STRICT_AS`.

Sensitive vars are **write-only** — Vercel never decrypts them for the
dashboard, CLI, or API. You can replace a value but never read it back. That
is permanent for that variable; switching sensitivity requires delete and
re-add. Sensitive vars also cannot exist in the Development environment,
only Production and Preview.

### Edit vs Rotate

The three-dot menu on a variable offers both. They differ in bookkeeping,
not in effect on the running app.

**Edit** — just replaces the value.

**Rotate** — replaces the value *and* captures two things Edit doesn't:

- a **Note** ("where to rotate, or who to contact"), which matters precisely
  because you can never read a sensitive value back. Without it you end up
  holding a key you can neither inspect nor trace to its source.
- a **confirmation checkbox**: *"I've revoked the old value at the service
  that issued it. I understand that without revoking, the old value will
  still work."*

That checkbox states the single most important fact about rotation:

> **Updating Vercel does NOT invalidate the old credential.** Only the
> issuing service can. Rotating a leaked key without revoking it upstream
> leaves the leaked key working indefinitely.

So for `RESEND_API_KEY`, `SERPAPI_KEY`, `SEATS_AERO_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`, rotation is always two jobs: new key in the
provider's dashboard, then **delete the old key there**. Prefer Rotate over
Edit for these — the note and the checkbox are the point.

⚠️ Rotate appears to store the new value as **Sensitive**. Don't use it on a
plain config var like `SEARCH_MAX_DAYS` — you'd convert a readable value into
a write-only one and only delete-and-re-add would undo it.

### Rotating `CRON_SECRET`

`CRON_SECRET` is different: there is no issuing service. You invented the
string, and a copy lives in the cron-job.org `Authorization` header. Nothing
automated can rotate a shared secret whose other half lives in a service
Vercel has never heard of — overwriting it in both places *is* the
revocation.

Order matters, or the cron 401s in the gap:

1. Generate 32 random chars (PowerShell):
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})`
2. Vercel → Environment Variables → `CRON_SECRET` → **Rotate** (or Edit) →
   paste → note it is also set in cron-job.org → Save
3. **Redeploy and wait for Ready.** Env changes never reach a running
   deployment.
4. cron-job.org → job → **Advanced** → set header to
   `Authorization: Bearer <new-secret>` — keep the word `Bearer` and the
   single space
5. **TEST RUN** → expect 200. A 401 means the two values disagree: usually a
   stray space, a missing `Bearer `, or the redeploy hadn't finished.
6. Optionally update `.env.local` so local testing matches production.

Costs one SerpApi search for the test run.

Last rotated: 2026-08-21.

### Rotating Supabase keys

If the Supabase vars came in through the Vercel Supabase integration, rotate
via Integrations → the product → Settings → **Secure This Resource** →
Rotate Secrets. That regenerates on Supabase's side and syncs to Vercel in
one motion, rather than copying JWTs between dashboards. Redeploy after.

Be careful: rotating `SUPABASE_SERVICE_ROLE_KEY` breaks anything else using
it until updated. The cron depends on it.

## Working on a second machine (Windows ↔ macOS)

Development happens on a Windows 11 PC and a MacBook Air. The repo is public,
so cloning is trivial; the only real friction is `.env.local`, which is
gitignored by design and must be recreated by hand.

### ⚠️ `.env.local` is the single point of failure

Two values cannot be recovered if the machine holding them is lost:

- `RESEND_API_KEY` — Resend displays a key **once**. Lost means creating a new one.
- `CRON_SECRET` — Vercel's copy is Sensitive, therefore write-only. (Recoverable
  in practice from the cron-job.org `Authorization` header, which displays it.)

Everything else is readable from its provider's dashboard: Supabase URL / anon
key / service-role key, and `SERPAPI_KEY`.

**Keep `.env.local` in a password manager secure note.** That doubles as the
transfer mechanism between machines and as the backup. Do not email or message
it to yourself.

`vercel env pull .env.local` looks like the right tool and isn't — it cannot
pull Sensitive variables, so it produces a partial file and a confusing
debugging session.

### Setting up a new machine

1. **Node ≥ 20.9.0** — required by Next 16. On macOS: `brew install node`, or
   nvm if juggling versions. Check with `node -v`.
2. `git clone` the repo, then `npm install`.
3. Create `.env.local` from the password manager note. `.env.example` lists
   every key with explanations if starting from scratch.
4. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` locally — it points at the
   Vercel URL in production.
5. `npm run build` to verify, then `npm run dev`.

Notes:
- `npm run build` succeeds without valid credentials; it only compiles. A green
  build does **not** prove the keys work.
- The cron endpoint and email sending need `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
  and `RESEND_API_KEY` respectively. For UI and search work, omit them.
- If you'd rather not copy `RESEND_API_KEY` around, create a second Resend key
  named for the machine. Multiple keys are fine and revoking one doesn't affect
  the other.

### Line endings

`.gitattributes` normalises everything to LF. Without it, editing a
Windows-committed file on macOS can rewrite every line, producing diffs where
nothing changed and destroying `git blame`.

It was added after the fact, so run this **once** to normalise files already
committed with CRLF:

```bash
git add --renormalize .
git status          # expect a large but content-free diff
git commit -m "Normalise line endings to LF"
```

Do it on one machine, push, and pull on the other **before** making edits
there — otherwise both machines rewrite the same files and you get a conflict
in every one.

### Platform-specific gotchas

- **Windows + Avast One**: HTTPS scanning intercepts SSL certificates. If npm
  or git fails with SSL errors, disable Avast One → Settings → Protection →
  Core Shields → Web Shield → HTTPS scanning.
- **PowerShell has no `grep`.** Use `git grep` or `Select-String`. Commands in
  this file that look like bash are macOS/Git-Bash; PowerShell equivalents are
  noted where they differ.

## Roadmap: mobile (Expo / App Store) and multi-user

An iOS app is a stated goal. Nothing below needs doing yet — it is here so
that day-to-day changes don't quietly make it harder.

### What already helps

`supabase-js` runs natively in React Native, so an Expo app can query Postgres
directly under RLS — auth, watches, price history, all of it. Only two things
genuinely need a server: SerpApi search (holds the key) and the cron.

### Architecture habits to preserve

- **Keep `lib/` free of `next/*` imports.** `lib/alerts.ts` is already pure
  and portable to React Native as-is. `lib/utils.ts` is portable except
  `cn()` (clsx + tailwind-merge), which is web-only — worth splitting the
  formatters out from it eventually.
- **Don't put business logic in server components.** `app/dashboard/page.tsx`
  currently does query-and-enrich inline (fetch watches → fetch history →
  merge into `WatchWithLatestPrice`). Mobile cannot reuse a server component,
  so that logic would get duplicated and drift. Extract to `lib/watches.ts`.
- **Keep `types/` framework-agnostic.** It already is.

### The one blocking change

Every API route authenticates via cookies — `createSupabaseServerClient()`
reads `next/headers`. A React Native client keeps its JWT in SecureStore and
sends `Authorization: Bearer <token>`, so every route would 401.

Fix is a ~15-line helper: check the Authorization header first, fall back to
the cookie client. Web behaviour unchanged. **This is the next task.**

### Also needed before an app ships

- **Magic-link deep linking** — needs a custom scheme
  (`as-price://auth/callback`) rather than the current redirect to `/dashboard`.
- **RLS audit** — if mobile queries Supabase directly, policies are the only
  boundary. See the SECURITY MODEL header in `supabase/schema.sql`.

### Real multi-user blockers, in the order they bite

1. **SerpApi quota is the binding constraint** — not email, not hosting.
   250 searches/month free. Ten users × three watches × daily = ~900/month.
   Starter is $25/mo for 1,000. This is what caps user count.
2. **Supabase magic-link rate limit** — the built-in SMTP allows only a few
   sends per hour on the free tier. Multi-user signup needs custom SMTP.
   Convenient: point it at Resend, so one verified domain serves both login
   emails and alerts.
3. **Per-user rate limiting on `/api/search`** — it requires a signed-in user
   and caps the range at `SEARCH_MAX_DAYS`, but a logged-in user can still
   burn quota by searching repeatedly.
4. **RLS re-audit** before anyone else's data is in the database.

Swapping Resend off `resend.dev` is genuinely one env var (`ALERT_FROM_EMAIL`)
— `lib/email.ts` already reads it from env.

### The cheaper alternative, honestly

The app already ships a `manifest.json`, and since iOS 16.4 home-screen PWAs
support web push. If notifications are the main reason for wanting an app,
that path may get there for near-zero effort. Expo earns its keep for App
Store presence, background location, or native widgets.

4. **Add geolocation to app/page.tsx** — detects nearest Alaska hub airport for origin default:

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

## Known Issues / Gotchas

- **Tailwind v4 + Next.js 16**: Tailwind classes may not apply reliably. Critical layout components use inline styles instead. Don't fight this — just use inline styles for new components too.
- **Miles show as "—" forever**: expected unless `SEATS_AERO_KEY` is set. Even with a key, a dash means no saver award space on that date — not a failure.
- **Test-environment flight APIs are a trap**: Amadeus and Duffel both serve synthetic data on their free tiers. Any provider you evaluate, confirm it returns *real* fares before wiring it in.
- **SerpApi quota is shared** between the cron and `/api/search`. A 5-day search burns 5 of your 250. Watch it in the SerpApi dashboard.
- **Email silently not sending**: check `ALERT_FROM_EMAIL` exists in Vercel. If it is missing, `lib/email.ts` falls back to `alerts@yourdomain.com`, Resend rejects the unverified domain, the error is caught and logged, and the alert row just gets `email_sent: false`. No crash, no email. Look for `[email] Resend error:` in Vercel → Deployments → Functions logs.
- **Vercel "Sensitive" env vars are write-only** — never readable again, only replaceable. See **Secrets and environment variables** above for which vars should be sensitive, Edit vs Rotate, and rotation procedures.
- **Cron loop is sequential**, ~5.8s per watch, and cron-job.org caps at 30s — roughly 5 watches before it needs parallelising.
- **SVG icons**: Always set explicit `width` and `height` attributes on SVG elements — without them, Next.js may render them fullscreen.
- **next/headers in Next.js 16**: `cookies()` is async — must be `await cookies()`. Already handled in `lib/supabase/server.ts`.
- **SSL issues on Windows with Avast One**: Avast HTTPS scanning intercepts SSL certificates. If npm/git fails with SSL errors, temporarily disable "HTTPS scanning" in Avast One → Menu → Settings → Protection → Core Shields → Web Shield.

## Future Considerations

### For Personal/Private Use
The current setup is fine as-is. Keep the GitHub repo private if you prefer not to expose the project structure (env vars are never committed regardless).

### For Public/Production Use
If you ever want to open this app to other users:

1. **Rate limiting** — `/api/search` now requires a signed-in user and caps the range at `SEARCH_MAX_DAYS`, but a logged-in user can still burn quota by searching repeatedly. Add per-user rate limiting (e.g. Upstash Redis) before opening signups.

2. **SerpApi paid tier** — Starter is $25/mo for 1,000 searches. Needed the moment you have more than one or two watches, or real search traffic.

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
