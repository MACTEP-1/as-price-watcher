'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { normaliseSignInCode, safeNextPath } from '@/lib/format'

/**
 * Email sign-in, two ways from ONE email: type the code it contains here,
 * or click its link. The code is the reliable path — the link only works
 * in a browser on the same device (and on phones it has to be coaxed into
 * the app), and an app-store reviewer can be given a code without access
 * to a link's device. Both need the Supabase "Magic Link" email template
 * to include {{ .Token }} (and {{ .ConfirmationURL }} for the link).
 */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [next, setNext] = useState('/dashboard')

  const supabase = createSupabaseBrowserClient()

  // Read ?next= and ?deleted= on the client (useSearchParams would need a
  // Suspense boundary for this statically rendered page).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNext(safeNextPath(params.get('next')))
    if (params.get('deleted')) setNotice('Your account has been deleted.')
    if (params.get('error')) setError('That sign-in link didn’t work — request a new code below.')
  }, [])

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
      setCode('')
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = normaliseSignInCode(code)
    if (!token) {
      setError('Enter the code from the email — digits only.')
      return
    }
    setVerifying(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      setVerifying(false)
      setError(
        /expired|invalid/i.test(error.message)
          ? 'That code is wrong or has expired. Check the newest email, or send a new code.'
          : error.message
      )
      return
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
      background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            background: '#0060ac',
            borderRadius: '16px',
            marginBottom: '16px',
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: '700', color: '#0f172a' }}>
            AS Price Watch
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            Track Alaska Airlines fares — cash &amp; miles
          </p>
        </div>

        {notice && !sent && (
          <p style={{ margin: '0 0 16px', padding: '10px 14px', fontSize: 14, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, textAlign: 'center' }}>
            {notice}
          </p>
        )}

        {sent ? (
          <form onSubmit={verifyCode}>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '16px',
            }}>
              <p style={{ margin: '0 0 4px', fontWeight: '600', color: '#166534' }}>Check your email</p>
              <p style={{ margin: 0, fontSize: '14px', color: '#16a34a' }}>
                We sent a sign-in code to <strong>{email}</strong>
              </p>
            </div>

            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px',
            }}>
              Sign-in code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={14}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345678"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '20px',
                letterSpacing: '4px',
                textAlign: 'center',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#fff',
                color: '#111827',
                marginBottom: '12px',
              }}
            />

            {error && (
              <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#dc2626' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={verifying}
              style={{
                width: '100%',
                padding: '11px',
                background: verifying ? '#93c5fd' : '#0060ac',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                border: 'none',
                borderRadius: '8px',
                cursor: verifying ? 'not-allowed' : 'pointer',
                marginBottom: '12px',
              }}
            >
              {verifying ? 'Signing in…' : 'Sign in'}
            </button>

            <p style={{ margin: 0, fontSize: '12px', textAlign: 'center', color: '#9ca3af' }}>
              Or click the link in the same email.{' '}
              <button type="button" onClick={() => sendCode()} disabled={loading} style={{ background: 'none', border: 'none', padding: 0, color: '#0060ac', fontSize: '12px', cursor: 'pointer' }}>
                {loading ? 'Sending…' : 'Send a new code'}
              </button>
              {' · '}
              <button type="button" onClick={() => { setSent(false); setError('') }} style={{ background: 'none', border: 'none', padding: 0, color: '#0060ac', fontSize: '12px', cursor: 'pointer' }}>
                Use a different email
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={sendCode}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '6px',
              }}>
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '15px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#fff',
                  color: '#111827',
                }}
              />
            </div>

            {error && (
              <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#dc2626' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                background: loading ? '#93c5fd' : '#0060ac',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '12px',
              }}
            >
              {loading ? 'Sending…' : 'Email me a sign-in code'}
            </button>

            <p style={{ margin: 0, fontSize: '12px', textAlign: 'center', color: '#9ca3af' }}>
              No password needed — we&apos;ll email you a code (and a link)
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
