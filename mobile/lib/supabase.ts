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
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
