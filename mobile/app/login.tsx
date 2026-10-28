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
import { normaliseSignInCode } from '../../lib/format'

/**
 * Email sign-in: type the code from the email (the reliable way on a
 * phone), or tap the link in it, which still opens the app via
 * as-price://auth-callback when that works. Same flow as app/login/page.tsx
 * on the web. Successful verifyOtp fires onAuthStateChange, and the root
 * layout's guard moves on to the dashboard — nothing to navigate here.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function sendCode() {
    setLoading(true)
    setError('')

    // Linking.createURL resolves to the right thing per environment:
    // as-price://auth-callback in a standalone/dev-client build, or the
    // exp:// dev-server URL inside Expo Go. Either way this must also be
    // added to Supabase's Auth → URL Configuration → Redirect URLs
    // allow-list (as-price://** ) or signInWithOtp succeeds but the link
    // silently fails to redirect anywhere. The code doesn't depend on it.
    const redirectTo = Linking.createURL('auth-callback')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })

    setLoading(false)
    if (error) setError(error.message)
    else {
      setSent(true)
      setCode('')
    }
  }

  async function verifyCode() {
    const token = normaliseSignInCode(code)
    if (!token) {
      setError('Enter the code from the email — digits only.')
      return
    }
    setVerifying(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    if (error) {
      setVerifying(false)
      setError(
        /expired|invalid/i.test(error.message)
          ? 'That code is wrong or has expired. Check the newest email, or send a new code.'
          : error.message
      )
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>We sent a sign-in code to {email.trim()}</Text>

        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder="12345678"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={14}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={verifyCode}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, verifying && styles.buttonDisabled]}
          onPress={verifyCode}
          disabled={verifying || !code}
        >
          {verifying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>Or tap the link in the same email.</Text>
        <View style={styles.linksRow}>
          <Pressable onPress={sendCode} disabled={loading} hitSlop={8}>
            <Text style={styles.link}>{loading ? 'Sending…' : 'Send a new code'}</Text>
          </Pressable>
          <Pressable onPress={() => { setSent(false); setError('') }} hitSlop={8}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </View>
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
        onPress={sendCode}
        disabled={loading || !email}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Email me a sign-in code</Text>
        )}
      </Pressable>

      <Text style={styles.hint}>No password needed — we&apos;ll email you a code (and a link)</Text>
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
  codeInput: {
    fontSize: 22,
    letterSpacing: 4,
    textAlign: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  link: {
    color: '#0060ac',
    fontSize: 13,
  },
})
