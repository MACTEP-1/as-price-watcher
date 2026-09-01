import { supabase } from './supabase'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL!

/**
 * Calls the Next.js POST /api/search route with the signed-in user's
 * access token as a Bearer header — exactly what createSupabaseRouteClient()
 * on the server was built to accept (see lib/supabase/server.ts's own
 * comment on the dual-scheme auth). SerpApi and seats.aero keys never reach
 * this app; SEARCH_MAX_DAYS is enforced server-side regardless of what a
 * client sends.
 *
 * Not yet wired to a screen — the dashboard and watch-detail screens in
 * this scaffold only read existing watches. Creating a new watch/search
 * from the app is the natural next piece once this compiles and runs.
 */
export async function searchFlights(params: {
  origin: string
  destination: string
  startDate: string
  endDate?: string
  cabinClass: string
  returnDate?: string | null
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Search failed (${res.status})`)
  }

  return res.json()
}
