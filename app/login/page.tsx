'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#0060ac] rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">AS Price Watch</h1>
          <p className="mt-1 text-sm text-slate-500">Track Alaska Airlines fares — cash & miles</p>
        </div>

        {sent ? (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 text-center">
            <div className="text-2xl mb-2">✉️</div>
            <p className="font-medium text-green-800 dark:text-green-300">Check your email</p>
            <p className="mt-1 text-sm text-green-600 dark:text-green-400">
              We sent a magic link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                           placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0060ac]"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#0060ac] hover:bg-[#004f91] text-white font-semibold
                         rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>

            <p className="text-xs text-center text-slate-400">
              No password needed — we'll email you a sign-in link
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
