'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const CABIN_OPTIONS = [
  { value: 'economy', label: 'Economy (Saver / Main)' },
  { value: 'premium_economy', label: 'Premium Economy' },
  { value: 'business', label: 'Business / First' },
] as const

const TRIP_OPTIONS = [
  { value: 'one_way', label: 'One-way' },
  { value: 'round_trip', label: 'Round trip' },
] as const

type TripType = (typeof TRIP_OPTIONS)[number]['value']

const POPULAR_ROUTES = [
  { o: 'SEA', d: 'LAX', label: 'SEA → LAX' },
  { o: 'SEA', d: 'SFO', label: 'SEA → SFO' },
  { o: 'SEA', d: 'JFK', label: 'SEA → JFK' },
  { o: 'SEA', d: 'ORD', label: 'SEA → ORD' },
  { o: 'SEA', d: 'HNL', label: 'SEA → HNL' },
  { o: 'PDX', d: 'LAX', label: 'PDX → LAX' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 15, color: '#0f172a',
  background: '#f8fafc', boxSizing: 'border-box', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#475569', marginBottom: 6,
}

/**
 * Shared pill style for the route / trip-type / cabin selectors.
 * Standalone function rather than a key on a styles object — a
 * Record<string, React.CSSProperties> cannot hold function values.
 */
const pill = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8,
  border: `1.5px solid ${active ? '#0060ac' : '#e2e8f0'}`,
  background: active ? '#0060ac' : '#fff',
  color: active ? '#fff' : '#475569',
  cursor: 'pointer', textAlign: 'center',
})

export default function NewWatchPage() {
  const router = useRouter()
  const [tripType, setTripType] = useState<TripType>('one_way')
  const [form, setForm] = useState({
    origin: '', destination: '', departDate: '', returnDate: '', cabinClass: 'economy',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /**
   * Switching to one-way clears any return date, so a stale value can never
   * be submitted. This is the bug that produced a same-day round trip that
   * nobody chose: the return field defaulted to allowing the departure date
   * and there was no explicit trip-type decision anywhere.
   */
  function chooseTripType(next: TripType) {
    setTripType(next)
    if (next === 'one_way') set('returnDate', '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side guard; the API enforces the same rules independently.
    if (tripType === 'round_trip' && !form.returnDate) {
      setError('Pick a return date, or switch to one-way.')
      return
    }
    if (tripType === 'round_trip' && form.returnDate < form.departDate) {
      setError('Return date cannot be before the departure date.')
      return
    }

    setLoading(true)
    setError('')
    const res = await fetch('/api/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: form.origin.toUpperCase().trim(),
        destination: form.destination.toUpperCase().trim(),
        departDate: form.departDate,
        returnDate: tripType === 'round_trip' ? form.returnDate : null,
        cabinClass: form.cabinClass,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    router.push(`/watches/${data.id}`)
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  const isRoundTrip = tripType === 'round_trip'

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Watch a route</h1>

        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#94a3b8' }}>Popular routes</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {POPULAR_ROUTES.map((r) => {
              const active = form.origin === r.o && form.destination === r.d
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => { set('origin', r.o); set('destination', r.d) }}
                  style={{ ...pill(active), padding: '5px 12px', fontSize: 12 }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Trip type — must be chosen explicitly, never inferred */}
          <div>
            <label style={labelStyle}>Trip type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TRIP_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => chooseTripType(t.value)}
                  style={{ ...pill(tripType === t.value), flex: 1 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>From (IATA)</label>
              <input required maxLength={3} value={form.origin} onChange={(e) => set('origin', e.target.value.toUpperCase())} placeholder="SEA" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To (IATA)</label>
              <input required maxLength={3} value={form.destination} onChange={(e) => set('destination', e.target.value.toUpperCase())} placeholder="LAX" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isRoundTrip ? '1fr 1fr' : '1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Depart date</label>
              <input type="date" required min={minDate} value={form.departDate} onChange={(e) => set('departDate', e.target.value)} style={inputStyle} />
            </div>

            {/* Only rendered for a round trip, so a one-way can never carry one */}
            {isRoundTrip && (
              <div>
                <label style={labelStyle}>Return date</label>
                <input
                  type="date"
                  required
                  min={form.departDate || minDate}
                  value={form.returnDate}
                  onChange={(e) => set('returnDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {isRoundTrip && form.returnDate && form.returnDate === form.departDate && (
            <div style={{ padding: '10px 14px', background: '#fffbeb', color: '#b45309', fontSize: 13, borderRadius: 8 }}>
              Same-day return — this prices a there-and-back on {form.departDate}. Intended?
            </div>
          )}

          <div>
            <label style={labelStyle}>Cabin class</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {CABIN_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('cabinClass', c.value)}
                  style={{ ...pill(form.cabinClass === c.value), flex: 1, padding: '8px 4px', fontSize: 12 }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', fontSize: 14, borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 13, background: '#0060ac', color: '#fff', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating watch…' : 'Start watching'}
          </button>

          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: '#94a3b8' }}>
            Prices are checked daily. You&apos;ll get an email when the price drops ≥10% or hits a new low.
          </p>
        </form>
      </main>
    </>
  )
}
