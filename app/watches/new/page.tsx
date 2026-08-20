'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { cn } from '@/lib/utils'

const CABIN_OPTIONS = [
  { value: 'economy', label: 'Economy (Saver / Main)' },
  { value: 'premium_economy', label: 'Premium Economy' },
  { value: 'business', label: 'Business / First' },
] as const

// Popular AS airport pairs for quick-fill
const POPULAR_ROUTES = [
  { o: 'SEA', d: 'LAX', label: 'SEA → LAX' },
  { o: 'SEA', d: 'SFO', label: 'SEA → SFO' },
  { o: 'SEA', d: 'JFK', label: 'SEA → JFK' },
  { o: 'SEA', d: 'ORD', label: 'SEA → ORD' },
  { o: 'SEA', d: 'HNL', label: 'SEA → HNL' },
  { o: 'PDX', d: 'LAX', label: 'PDX → LAX' },
]

export default function NewWatchPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    departDate: '',
    returnDate: '',
    cabinClass: 'economy',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: form.origin.toUpperCase().trim(),
        destination: form.destination.toUpperCase().trim(),
        departDate: form.departDate,
        returnDate: form.returnDate || null,
        cabinClass: form.cabinClass,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    router.push(`/watches/${data.id}`)
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
          Watch a route
        </h1>

        {/* Quick-fill popular routes */}
        <div className="mb-6">
          <p className="text-xs text-slate-500 mb-2">Popular routes</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_ROUTES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => { set('origin', r.o); set('destination', r.d) }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                  form.origin === r.o && form.destination === r.d
                    ? 'bg-[#0060ac] text-white border-[#0060ac]'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-[#0060ac]'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Origin / Destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                From (IATA)
              </label>
              <input
                required
                maxLength={3}
                value={form.origin}
                onChange={(e) => set('origin', e.target.value)}
                placeholder="SEA"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                           uppercase font-mono placeholder:normal-case placeholder:font-sans placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#0060ac]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                To (IATA)
              </label>
              <input
                required
                maxLength={3}
                value={form.destination}
                onChange={(e) => set('destination', e.target.value)}
                placeholder="LAX"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                           uppercase font-mono placeholder:normal-case placeholder:font-sans placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#0060ac]"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Depart date
              </label>
              <input
                type="date"
                required
                min={minDate}
                value={form.departDate}
                onChange={(e) => set('departDate', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                           focus:outline-none focus:ring-2 focus:ring-[#0060ac]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Return date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                min={form.departDate || minDate}
                value={form.returnDate}
                onChange={(e) => set('returnDate', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                           focus:outline-none focus:ring-2 focus:ring-[#0060ac]"
              />
            </div>
          </div>

          {/* Cabin class */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Cabin class
            </label>
            <div className="flex gap-2">
              {CABIN_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('cabinClass', c.value)}
                  className={cn(
                    'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors text-center',
                    form.cabinClass === c.value
                      ? 'bg-[#0060ac] text-white border-[#0060ac]'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0060ac] hover:bg-[#004f91] text-white font-semibold
                       rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating watch…' : 'Start watching'}
          </button>

          <p className="text-xs text-center text-slate-400">
            Prices are checked every 4 hours. You'll get an email when the price drops ≥10% or hits a new low.
          </p>
        </form>
      </main>
    </>
  )
}
