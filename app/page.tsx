'use client'

import { useState, useEffect } from 'react'
import type { SearchResult } from './api/search/route'

const POPULAR = [
  { o: 'SEA', d: 'LAX' }, { o: 'SEA', d: 'SFO' }, { o: 'SEA', d: 'JFK' },
  { o: 'SEA', d: 'HNL' }, { o: 'PDX', d: 'LAX' }, { o: 'ANC', d: 'SEA' },
]

const CABINS = [
  { value: 'economy', label: 'Economy' },
  { value: 'premium_economy', label: 'Premium' },
  { value: 'business', label: 'Business/First' },
]

const HUBS = [
  { code: 'SEA', lat: 47.45, lon: -122.31 },
  { code: 'PDX', lat: 45.59, lon: -122.60 },
  { code: 'ANC', lat: 61.17, lon: -149.99 },
  { code: 'FAI', lat: 64.82, lon: -147.86 },
  { code: 'SFO', lat: 37.62, lon: -122.38 },
  { code: 'SJC', lat: 37.36, lon: -121.93 },
  { code: 'SMF', lat: 38.70, lon: -121.59 },
  { code: 'LAX', lat: 33.94, lon: -118.41 },
  { code: 'SAN', lat: 32.73, lon: -117.19 },
  { code: 'LAS', lat: 36.08, lon: -115.15 },
  { code: 'PHX', lat: 33.44, lon: -112.01 },
  { code: 'RNO', lat: 39.50, lon: -119.77 },
  { code: 'GEG', lat: 47.62, lon: -117.53 },
  { code: 'DEN', lat: 39.86, lon: -104.67 },
  { code: 'ORD', lat: 41.98, lon: -87.90 },
  { code: 'DCA', lat: 38.85, lon: -77.04 },
  { code: 'JFK', lat: 40.64, lon: -73.78 },
  { code: 'BOS', lat: 42.37, lon: -71.00 },
]

function nearestHub(lat: number, lon: number): string {
  let best = HUBS[0]
  let bestDist = Infinity
  for (const hub of HUBS) {
    const d = Math.hypot(hub.lat - lat, hub.lon - lon)
    if (d < bestDist) { bestDist = d; best = hub }
  }
  return best.code
}

function fmt(n: number | null, currency = 'USD') {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtMiles(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString() + ' mi'
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtDuration(mins: number | null) {
  if (!mins) return ''
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function Home() {
  const [origin, setOrigin] = useState('SEA')
  const [destination, setDestination] = useState('LAX')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cabin, setCabin] = useState('economy')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState('')
  const [watchedDates, setWatchedDates] = useState<Set<string>>(new Set())
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [pendingWatch, setPendingWatch] = useState<SearchResult | null>(null)


  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      setOrigin(nearestHub(latitude, longitude))
    })
  }, [])

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  function swap() {
    setOrigin(destination)
    setDestination(origin)
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!origin || !destination || !startDate) return
    setLoading(true)
    setError('')
    setResults(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: origin.toUpperCase().trim(),
          destination: destination.toUpperCase().trim(),
          startDate,
          endDate: endDate || startDate,
          cabinClass: cabin,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.results)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleWatch(result: SearchResult) {
    // Check if logged in
    const authRes = await fetch('/api/auth/me')
    if (!authRes.ok) {
      setPendingWatch(result)
      setShowLoginPrompt(true)
      return
    }

    // Create watch
    const res = await fetch('/api/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        departDate: result.date,
        cabinClass: cabin,
      }),
    })

    if (res.ok) {
      setWatchedDates(prev => new Set([...prev, result.date]))
    }
  }

  const s: Record<string, React.CSSProperties> = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #003f7a 0%, #0060ac 45%, #0284c7 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    header: {
      padding: '20px 24px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      color: '#fff',
      fontWeight: '700',
      fontSize: '18px',
      textDecoration: 'none',
    },
    loginBtn: {
      background: 'rgba(255,255,255,0.15)',
      border: '1px solid rgba(255,255,255,0.3)',
      color: '#fff',
      padding: '7px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      cursor: 'pointer',
      fontWeight: '500',
    },
    hero: {
      textAlign: 'center' as const,
      padding: '48px 24px 32px',
    },
    heroTitle: {
      margin: '0 0 8px',
      fontSize: '36px',
      fontWeight: '800',
      color: '#fff',
      letterSpacing: '-0.5px',
    },
    heroSub: {
      margin: 0,
      fontSize: '16px',
      color: 'rgba(255,255,255,0.75)',
    },
    card: {
      background: '#fff',
      borderRadius: '20px',
      padding: '24px',
      margin: '0 auto',
      maxWidth: '680px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    },
    row: { display: 'flex', gap: '12px', marginBottom: '12px' },
    inputWrap: { flex: 1, position: 'relative' as const },
    label: { display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    input: {
      width: '100%',
      padding: '10px 12px',
      fontSize: '16px',
      fontWeight: '600',
      border: '1.5px solid #e5e7eb',
      borderRadius: '10px',
      outline: 'none',
      boxSizing: 'border-box' as const,
      color: '#111827',
      background: '#f9fafb',
    },
    swapBtn: {
      alignSelf: 'flex-end' as const,
      marginBottom: '2px',
      width: '36px',
      height: '40px',
      border: '1.5px solid #e5e7eb',
      borderRadius: '10px',
      background: '#f9fafb',
      cursor: 'pointer',
      fontSize: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    searchBtn: {
      width: '100%',
      padding: '13px',
      background: '#0060ac',
      color: '#fff',
      fontSize: '16px',
      fontWeight: '700',
      border: 'none',
      borderRadius: '12px',
      cursor: 'pointer',
      marginTop: '4px',
    },
    pills: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '16px' },
    pill: (active: boolean): React.CSSProperties => ({
      padding: '5px 12px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
      border: `1.5px solid ${active ? '#0060ac' : '#e5e7eb'}`,
      background: active ? '#eff6ff' : '#fff',
      color: active ? '#0060ac' : '#6b7280',
      cursor: 'pointer',
    }),
    results: {
      maxWidth: '680px',
      margin: '24px auto 0',
      paddingBottom: '48px',
    },
    resultCard: (isBest: boolean): React.CSSProperties => ({
      background: '#fff',
      borderRadius: '14px',
      padding: '16px 20px',
      marginBottom: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      boxShadow: isBest ? '0 0 0 2px #0060ac, 0 4px 16px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.08)',
      position: 'relative' as const,
    }),
    bestBadge: {
      position: 'absolute' as const,
      top: '-10px',
      left: '16px',
      background: '#0060ac',
      color: '#fff',
      fontSize: '11px',
      fontWeight: '700',
      padding: '2px 8px',
      borderRadius: '10px',
      letterSpacing: '0.03em',
    },
    watchBtn: (watching: boolean): React.CSSProperties => ({
      marginLeft: 'auto',
      flexShrink: 0,
      padding: '8px 16px',
      background: watching ? '#f0fdf4' : '#0060ac',
      color: watching ? '#16a34a' : '#fff',
      border: watching ? '1.5px solid #bbf7d0' : 'none',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: watching ? 'default' : 'pointer',
      whiteSpace: 'nowrap' as const,
    }),
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '16px',
    },
    modal: {
      background: '#fff',
      borderRadius: '16px',
      padding: '28px',
      maxWidth: '360px',
      width: '100%',
      textAlign: 'center' as const,
    },
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          AS Price Watch
        </div>
        <a href="/login" style={s.loginBtn}>Sign in</a>
      </div>

      {/* Hero */}
      <div style={s.hero}>
        <h1 style={s.heroTitle}>Find the best Alaska fare</h1>
        <p style={s.heroSub}>Search cash & miles prices across a date range — no account needed</p>
      </div>

      {/* Search card */}
      <div style={{ padding: '0 16px' }}>
        <div style={s.card}>
          <form onSubmit={search}>
            {/* Origin / Destination */}
            <div style={s.row}>
              <div style={s.inputWrap}>
                <label style={s.label}>From</label>
                <input
                  style={s.input}
                  value={origin}
                  onChange={e => setOrigin(e.target.value.toUpperCase())}
                  placeholder="SEA"
                  maxLength={3}
                  required
                />
              </div>
              <button type="button" style={s.swapBtn} onClick={swap}>⇄</button>
              <div style={s.inputWrap}>
                <label style={s.label}>To</label>
                <input
                  style={s.input}
                  value={destination}
                  onChange={e => setDestination(e.target.value.toUpperCase())}
                  placeholder="LAX"
                  maxLength={3}
                  required
                />
              </div>
            </div>

            {/* Popular routes */}
            <div style={s.pills}>
              {POPULAR.map(r => {
                const active = origin === r.o && destination === r.d
                return (
                  <button
                    key={r.o + r.d}
                    type="button"
                    style={s.pill(active)}
                    onClick={() => { setOrigin(r.o); setDestination(r.d) }}
                  >
                    {r.o} → {r.d}
                  </button>
                )
              })}
            </div>

            {/* Dates */}
            <div style={s.row}>
              <div style={s.inputWrap}>
                <label style={s.label}>Depart from</label>
                <input type="date" style={s.input} min={minDate} value={startDate}
                  onChange={e => setStartDate(e.target.value)} required />
              </div>
              <div style={s.inputWrap}>
                <label style={s.label}>Depart to <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional range)</span></label>
                <input type="date" style={s.input} min={startDate || minDate} value={endDate}
                  onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Cabin */}
            <div style={{ marginBottom: '16px' }}>
              <label style={s.label}>Cabin</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {CABINS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    style={{ ...s.pill(cabin === c.value), flex: 1, textAlign: 'center' }}
                    onClick={() => setCabin(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>}

            <button type="submit" disabled={loading} style={s.searchBtn}>
              {loading ? 'Searching…' : 'Search flights'}
            </button>
          </form>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div style={{ padding: '0 16px' }}>
          <div style={s.results}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '12px' }}>
              {results.filter(r => r.cashPrice !== null).length} dates with fares found
              · sorted cheapest first
            </p>
            {results.map((r, i) => {
              const isWatched = watchedDates.has(r.date)
              const isBest = i === 0 && r.cashPrice !== null
              return (
                <div key={r.date} style={s.resultCard(isBest)}>
                  {isBest && <div style={s.bestBadge}>BEST PRICE</div>}

                  {/* Date */}
                  <div style={{ minWidth: '110px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827' }}>{fmtDate(r.date)}</div>
                    {r.flightNumber && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{r.flightNumber}</div>
                    )}
                    {r.durationMinutes && (
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {fmtDuration(r.durationMinutes)} · {r.stops === 0 ? 'Nonstop' : `${r.stops} stop`}
                      </div>
                    )}
                  </div>

                  {/* Cash */}
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>CASH</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#0060ac' }}>
                      {fmt(r.cashPrice, r.currency)}
                    </div>
                  </div>

                  {/* Miles */}
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>MILES</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#00a551' }}>
                      {fmtMiles(r.milesPrice)}
                    </div>
                  </div>

                  {/* Watch button */}
                  <button
                    style={s.watchBtn(isWatched)}
                    onClick={() => !isWatched && handleWatch(r)}
                    disabled={isWatched}
                  >
                    {isWatched ? '✓ Watching' : '🔔 Watch'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Login prompt modal */}
      {showLoginPrompt && (
        <div style={s.overlay} onClick={() => setShowLoginPrompt(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
              Sign in to set alerts
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#6b7280' }}>
              We&apos;ll email you when the price drops for{' '}
              <strong>{origin} → {destination}</strong>
              {pendingWatch ? ` on ${fmtDate(pendingWatch.date)}` : ''}.
              No password needed.
            </p>
            <a
              href={`/login?next=/`}
              style={{
                display: 'block',
                padding: '12px',
                background: '#0060ac',
                color: '#fff',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '15px',
                textDecoration: 'none',
                marginBottom: '10px',
              }}
            >
              Sign in with email
            </a>
            <button
              onClick={() => setShowLoginPrompt(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '14px', cursor: 'pointer' }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
