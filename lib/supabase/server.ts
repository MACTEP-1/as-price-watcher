import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

/**
 * Cookie-backed client. Use in SERVER COMPONENTS, where the caller is always
 * a browser carrying a session cookie.
 *
 * API routes should use createSupabaseRouteClient() instead — see below.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — can't set cookies, that's fine
          }
        },
      },
    }
  )
}

/**
 * Client for API ROUTES, accepting either authentication scheme:
 *
 *   Browser         → session cookie          → createSupabaseServerClient()
 *   Native / Expo   → Authorization: Bearer   → token-scoped client
 *
 * Why this exists: `createSupabaseServerClient` only ever inspects cookies.
 * A React Native client keeps its JWT in SecureStore and sends it as a
 * header, so every route would have seen an anonymous request and returned
 * 401. Browsers never send that header, so web behaviour is unchanged.
 *
 * The token path uses the ANON key with the caller's JWT attached, so RLS
 * still applies as that user. It must never use the service-role key —
 * that would let any caller bypass RLS entirely.
 *
 * Sessions are not persisted or refreshed here: each request is
 * independently authenticated, and a serverless invocation has nowhere
 * durable to keep a session anyway.
 */
export async function createSupabaseRouteClient() {
  const headerStore = await headers()
  const token = headerStore.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (token) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
  }

  return createSupabaseServerClient()
}

/**
 * Service-role client — BYPASSES RLS ENTIRELY.
 *
 * Only for the cron job, which must read every user's watches. Never reachable
 * from a request that a user can influence.
 */
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
