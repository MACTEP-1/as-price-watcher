import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

/**
 * Expo Router treats the magic-link redirect's path ("auth-callback") as a
 * navigation target in its own right — not just a deep-link event to
 * intercept — so without a real screen registered here, Router shows its
 * built-in "Unmatched Route" 404 instead of ever reaching the app.
 *
 * The actual token exchange still happens where it always did: the
 * Linking listener in app/_layout.tsx calls createSessionFromUrl(), which
 * calls supabase.auth.setSession(). This screen's only job is to exist, so
 * Router has somewhere valid to land while that runs — see _layout.tsx's
 * redirect effect for what moves the user off this screen once the
 * session is actually set.
 */
export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0060ac" />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  text: { color: '#64748b', fontSize: 14 },
})