'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import AirportAutocomplete from '@/components/AirportAutocomplete'
import { FARE_SCOPE_OPTIONS, fareScopeHint, parseFlightList } from '@/lib/format'

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

/**
 * Stop limit (migration 006). "Up to 2 stops" exists in the API but isn't
 * offered: it's barely different from Any on the routes this app watches.
 * If no Alaska itinerary fits the limit, the watch tracks the cheapest
 * fitting one on any airline and the card says "no Alaska leg" (user's
 * choice 09/24, over tracking nothing).
 */
const STOP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 0, label: 'Nonstop only' },
  { value: 1, label: 'Up to 1 stop' },
]


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
  const [maxStops, setMaxStops] = useState<number | null>(null)
  const [fareScope, setFareScope] = useState<'alaska_only' | 'alaska_leg'>('alaska_only')
  // Pinned flights (migration 012) — tucked behind a small link; most
  // watches want the cheapest trip.
  const [showPins, setShowPins] = useState(false)
  const [pinOut, setPinOut] = useState('')
  const [pinRet, setPinRet] = useState('')
  const [loading, setLoading] = useState(false)

  // Pre-fill from a watch page's "Watch just this flight" link
  // (?from=&to=&depart=&return=&cabin=&out=). Read from window rather than
  // useSearchParams, which would need a Suspense boundary for this page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.get('out')) return
    setForm((f) => ({
      ...f,
      origin: q.get('from') ?? f.origin,
      destination: q.get('to') ?? f.destination,
      departDate: q.get('depart') ?? f.departDate,
      returnDate: q.get('return') ?? '',
      cabinClass: q.get('cabin') ?? f.cabinClass,
    }))
    setTripType(q.get('return') ? 'round_trip' : 'one_way')
    setPinOut(q.get('out') ?? '')
    setShowPins(true)
  }, [])
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

    const outboundFlights = parseFlightList(pinOut)
    const returnFlights = isRoundTrip ? parseFlightList(pinRet) : []
    if (outboundFlights === null || returnFlights === null) {
      setError('Couldn\'t read the flight numbers — use e.g. AS 326, or AS 623, AS 625 for a connection.')
      return
    }
    if (returnFlights.length && !outboundFlights.length) {
      setError('Add the outbound flight too, or clear the return flight.')
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
        maxStops,
        fareScope,
        outboundFlights: outboundFlights.length ? outboundFlights : null,
        returnFlights: returnFlights.length ? returnFlights : null,
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
            <AirportAutocomplete
              label="From"
              value={form.origin}
              onChange={(v) => set('origin', v)}
              placeholder="Seattle or SEA"
            />
            <AirportAutocomplete
              label="To"
              value={form.destination}
              onChange={(v) => set('destination', v)}
              placeholder="Los Angeles or LAX"
            />
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

          <div>
            <label style={labelStyle}>Stops</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {STOP_OPTIONS.map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => setMaxStops(o.value)}
                  style={{ ...pill(maxStops === o.value), flex: 1, padding: '8px 4px', fontSize: 12 }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Airlines</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {FARE_SCOPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFareScope(o.value)}
                  style={{ ...pill(fareScope === o.value), flex: 1, padding: '8px 4px', fontSize: 12 }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
              {fareScopeHint(fareScope, tripType === 'round_trip')}
            </p>
          </div>

          {/* Pinned flights — deliberately low-key: a small link until used. */}
          <div>
            {!showPins ? (
              <button
                type="button"
                onClick={() => setShowPins(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#0060ac', fontSize: 12, cursor: 'pointer' }}
              >
                Specific flights (optional)
              </button>
            ) : (
              <>
                <label style={labelStyle}>Specific flights</label>
                <div style={{ display: 'grid', gridTemplateColumns: isRoundTrip ? '1fr 1fr' : '1fr', gap: 8 }}>
                  <input
                    value={pinOut}
                    onChange={(e) => setPinOut(e.target.value)}
                    placeholder="Outbound, e.g. AS 326"
                    style={inputStyle}
                  />
                  {isRoundTrip && (
                    <input
                      value={pinRet}
                      onChange={(e) => setPinRet(e.target.value)}
                      placeholder="Return (optional)"
                      style={inputStyle}
                    />
                  )}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Only these flights are priced; Stops and Airlines are ignored. If they aren&apos;t on sale
                  that day, no price is recorded. A connection: AS 623, AS 625.
                  {isRoundTrip && ' No return flight = the cheapest return with that outbound.'}{' '}
                  <button
                    type="button"
                    onClick={() => { setShowPins(false); setPinOut(''); setPinRet('') }}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#0060ac', fontSize: 12, cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </p>
              </>
            )}
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
