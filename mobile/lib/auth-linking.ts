// Turns the deep link the magic-link email opens into a real Supabase
// session. Supabase's own native-deep-linking guide uses this exact
// approach — parse the redirect URL's query/fragment params with
// expo-auth-session's QueryParams helper, then hand the tokens to
// setSession() directly, rather than exchanging a PKCE code.
// https://supabase.com/docs/guides/auth/native-mobile-deep-linking
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import { supabase } from './supabase'

/**
 * @param url The full incoming URL, e.g. "as-price://auth-callback#access_token=...&refresh_token=...".
 * @returns The new session, or null if this URL wasn't an auth callback at all
 *          (e.g. the app was opened normally, with no link involved).
 */
export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)

  if (errorCode) {
    throw new Error(`Auth callback error: ${errorCode}`)
  }

  const { access_token, refresh_token } = params
  if (!access_token || !refresh_token) return null

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })

  if (error) throw error
  return data.session
}
