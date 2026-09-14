// expo-sqlite's localStorage shim is Expo's current recommended session
// store for a Supabase client on native — this import must run before the
// client is created. See https://docs.expo.dev/guides/using-supabase/
import 'expo-sqlite/localStorage/install'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.'
  )
}

/**
 * The RN client used for everything this app reads directly: watches,
 * itineraries, price_checks. RLS scopes every query to the signed-in user,
 * the same policies the web app runs under (see security-rls-audit.md).
 *
 * detectSessionInUrl is false because there is no browser URL bar here —
 * the magic-link callback is handled explicitly in lib/auth-linking.ts via
 * the app's own deep-link listener instead.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // REQUIRED, and not optional despite persistSession below. The
    // 'expo-sqlite/localStorage/install' import above only *provides*
    // localStorage; supabase-js will not reach for it on its own. It picks
    // localStorage automatically only when it detects a browser, which it
    // does by checking for `document` — absent in React Native. Without
    // this line it silently falls back to IN-MEMORY storage, so
    // persistSession:true becomes a no-op and the session dies with the JS
    // context: a magic-link sign-in on every single app launch. Caught
    // 2026-09-14 when a simulator reload logged the user straight out.
    // Expo's own guide passes it explicitly for exactly this reason:
    // https://docs.expo.dev/guides/using-supabase/
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
