import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setLoading(true)
    setError('')

    // Linking.createURL resolves to the right thing per environment:
    // as-price://auth-callback in a standalone/dev-client build, or the
    // exp:// dev-server URL inside Expo Go. Either way this must also be
    // added to Supabase's Auth → URL Configuration → Redirect URLs
    // allow-list (as-price://** ) or signInWithOtp succeeds but the link
    // silently fails to redirect anywhere.
    const redirectTo = Linking.createURL('auth-callback')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>We sent a magic link to {email}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AS Price Watch</Text>
      <Text style={styles.subtitle}>
        Track Alaska Airlines fares — cash &amp; miles
      </Text>

      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading || !email}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send magic link</Text>
        )}
      </Pressable>

      <Text style={styles.hint}>No password needed — we&apos;ll email you a sign-in link</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111827',
    marginBottom: 12,
  },
  error: {
    color: '#dc2626',
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0060ac',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
    color: '#9ca3af',
  },
})
