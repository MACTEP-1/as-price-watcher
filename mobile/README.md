# AS Price Watch — mobile (Expo)

Scaffold for the open "Expo app" item in the project's status doc. Reuses
`lib/watches.ts` and `types/` from the Next.js app unchanged — that file was
already written with no `next/*` imports specifically so this would be
possible without a rewrite.

**Status: scaffolded and type-checks clean, not yet run on a device or
simulator.** This was built without a linked machine, so treat the auth flow
as implemented-per-spec rather than verified end-to-end — the project's own
rule is "verify, don't reason," and the one thing that still needs a real
device is exactly the deep-link redirect.

## Where this goes

Drop this whole `mobile/` folder in at the root of `as-price-watcher`,
alongside `app/`, `lib/`, `types/`:

```
as-price-watcher/
├── app/            (existing Next.js — unchanged)
├── lib/            (existing — watches.ts is now imported by both apps)
├── types/          (existing — same deal)
└── mobile/         (this folder)
```

Nothing in the existing Next.js project was touched. `git status` in the
repo root should show `mobile/` as the only new thing, once you `git add` it.

## Setup

```
cd as-price-watcher/mobile
npm install
cp .env.example .env
```

Fill in `.env`:
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same values
  as the web app's `.env.local`, same Supabase project.
- `EXPO_PUBLIC_API_BASE_URL` — the deployed site, `https://as-price-watcher.vercel.app`.

Then, in the Supabase dashboard → **Authentication → URL Configuration →
Redirect URLs**, add:

```
as-price://**
```

Skip this and `signInWithOtp` will still return success, but the email link
will have nowhere valid to redirect to — a silent failure, not an error you'll
see in the app.

## Running it — read this before testing the magic link

`npx expo start` and scanning the QR code opens the app in **Expo Go**, which
is fine for everything except the one thing you're here for: **Expo Go
cannot register the custom `as-price://` scheme**, so a magic-link email
opened on a phone running Expo Go will not come back to the app. This isn't
a bug in this code — Expo Go only owns its own fixed `exp://` scheme, and
custom schemes need a real build.

To actually test the deep link, build a **development build** once:

```
npx expo install expo-dev-client
npx expo run:ios      # or: npx expo run:android
```

That installs a native app on the simulator/device with `as-price://` wired
up for real. After that, `npx expo start` connects to it the same way it
would to Expo Go. You can also fire the link manually without waiting on an
email, once that build is installed:

```
npx uri-scheme open as-price://auth-callback --ios
```

(That alone won't produce a real session — it has no tokens attached — but
it confirms the OS is routing the scheme to this app at all, which is the
part most likely to be misconfigured.)

## What's here

- `app/_layout.tsx` — the auth guard (redirects to `/login` with no session)
  and the deep-link listener (catches the magic-link callback whether the
  app was cold-started by it or already running).
- `app/login.tsx` — email input, calls `signInWithOtp`.
- `lib/auth-linking.ts` — turns the incoming URL into a session via
  `setSession()`, following Supabase's own native-deep-linking guide.
- `lib/supabase.ts` — the RN client. Uses `expo-sqlite`'s `localStorage` shim
  for session persistence (Expo's current documented recommendation), not a
  hand-rolled SecureStore adapter.
- `app/index.tsx`, `app/watches/[id].tsx` — dashboard and detail screens,
  reading directly from Supabase via `getWatchesWithPrices` /
  `getWatchDetail` from the shared `lib/watches.ts`. RLS scopes these to the
  signed-in user exactly as it does on the web.
- `lib/api.ts` — a `searchFlights()` helper that calls the deployed
  `POST /api/search` with the session's access token as a Bearer header, for
  the day there's a "new watch" screen. Not wired to any UI yet.
- `metro.config.js` — the one non-obvious piece: Metro only watches its own
  project folder by default, so without this, edits to `../lib/watches.ts`
  either fail to resolve in a production bundle or silently don't hot-reload
  in dev, depending on caching. This tells it to also watch the repo root.

## Explicitly not done

- No "create a new watch" or search screen — `lib/api.ts` is ready for it,
  there's just no UI calling it yet.
- No app icon / splash screen assets — this will build and run with Expo's
  defaults; branding is a separate, unrelated task.
- Not tested against a real Supabase project or a real magic-link email —
  verified by type-checking (`npx tsc --noEmit` passes clean) and by
  reading Supabase's and Expo's current docs for the exact API shapes used,
  not by running it. The redirect allow-list step above is the most likely
  thing to trip up the first real test.
