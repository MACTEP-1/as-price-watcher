import { useCallback, useEffect, useState } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { createSessionFromUrl } from '../lib/auth-linking'

/**
 * Auth guard + magic-link deep-link handler, in one place so no screen has
 * to think about either. Two things happen here:
 *
 * 1. Track the Supabase session and redirect to /login (or away from it)
 *    based on whether one exists.
 * 2. Catch the as-price://auth-callback link the magic-link email opens —
 *    both the cold-start case (app wasn't running: Linking.getInitialURL)
 *    and the warm case (app was already open: the 'url' event) — and turn
 *    it into a session via createSessionFromUrl.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleUrl = useCallback(async (url: string | null) => {
    if (!url) return
    try {
      await createSessionFromUrl(url)
    } catch (err) {
      // A malformed or expired link shouldn't crash the app — surfacing
      // this on the login screen itself is the natural next step once
      // this is running end-to-end.
      console.warn('[auth] failed to handle deep link', err)
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    // auth-callback counts as "in the auth flow" alongside login: while
    // sitting on it with no session yet, that's the normal in-flight state
    // (createSessionFromUrl hasn't resolved yet) — bouncing to /login here
    // would race the async token exchange and kick the user out before it
    // ever finishes. Once session appears, this effect re-runs and the
    // second branch below sends them on to the dashboard from either screen.
    const inAuthFlow = segments[0] === 'login' || segments[0] === 'auth-callback'

    if (!session && !inAuthFlow) {
      router.replace('/login')
    } else if (session && inAuthFlow) {
      router.replace('/')
    }
  }, [ready, session, segments, router])

  // Render nothing until the first getSession() resolves, to avoid a
  // flash of the wrong screen (login vs dashboard) on cold start.
  if (!ready) return null

  return <Slot />
}
