'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ACCOUNT_DELETION_SUMMARY } from '@/lib/format'

export default function AccountActions({ email }: { email: string }) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function deleteAccount() {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Could not delete your account (${res.status})`)
      }
      // The user no longer exists, so a server-side sign-out would fail;
      // just drop the local session cookies.
      await supabase.auth.signOut({ scope: 'local' })
      router.push('/login?deleted=1')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  }

  return (
    <>
      <section style={card}>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>Signed in as</p>
        <p style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{email}</p>
        <button
          onClick={signOut}
          style={{ fontSize: 14, color: '#0060ac', background: 'none', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </section>

      <section style={card}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Delete account</h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
          {ACCOUNT_DELETION_SUMMARY}
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ fontSize: 14, color: '#b91c1c', background: 'none', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
          >
            Delete my account…
          </button>
        ) : (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14 }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#991b1b' }}>
              Delete {email} permanently? This can&apos;t be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: deleting ? '#fca5a5' : '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                style={{ fontSize: 14, color: '#374151', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p style={{ margin: '12px 0 0', fontSize: 14, color: '#dc2626' }}>{error}</p>}
      </section>
    </>
  )
}
