import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { deleteAccount, PRIVACY_URL } from '../lib/api'
import { ACCOUNT_DELETION_SUMMARY } from '../../lib/format'

/**
 * Mirrors app/account/page.tsx on the web: who you're signed in as, Sign
 * out, Delete account. Apple (5.1.1(v)) and Google Play both require the
 * deletion to be startable inside the app.
 */
export default function AccountScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function doDelete() {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount()
      // The user no longer exists, so only the local session is cleared;
      // the root layout's guard then routes to /login.
      await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account?',
      `${email ? `${email} and ` : ''}all your watches and alerts will be deleted permanently. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{email || '—'}</Text>
        <Pressable style={styles.secondaryButton} onPress={signOut} disabled={deleting}>
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Delete account</Text>
        <Text style={styles.body}>{ACCOUNT_DELETION_SUMMARY}</Text>
        <Pressable
          style={[styles.dangerButton, deleting && styles.dangerButtonDisabled]}
          onPress={confirmDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.dangerText}>Delete my account…</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.legal}>
        Fare Alerts is not affiliated with Alaska Airlines.{' '}
        <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 16, paddingTop: 56, paddingBottom: 8 },
  back: { color: '#0060ac', fontSize: 15, marginBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  label: { fontSize: 13, color: '#64748b', marginBottom: 2 },
  email: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 6 },
  body: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 14 },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  secondaryText: { color: '#0060ac', fontSize: 14 },
  dangerButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 150,
    alignItems: 'center',
  },
  dangerButtonDisabled: { opacity: 0.6 },
  dangerText: { color: '#b91c1c', fontSize: 14 },
  error: { color: '#dc2626', fontSize: 14, marginTop: 12 },
  legal: { marginTop: 24, marginHorizontal: 16, fontSize: 12, textAlign: 'center', color: '#94a3b8' },
  legalLink: { textDecorationLine: 'underline' },
})
