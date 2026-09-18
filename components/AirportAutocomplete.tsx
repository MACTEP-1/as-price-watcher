'use client'

import { useEffect, useRef, useState } from 'react'
import { searchAirports, type Airport } from '@/lib/airports'

/**
 * Origin/destination field for app/watches/new/page.tsx. Typing a city or
 * airport name shows matches from lib/airports.ts to pick from, but this is
 * purely a lookup aid: the raw typed text is still what's reported via
 * onChange, so someone who already knows the 3-letter code can just type it
 * and submit exactly as before — the API (app/api/watches/route.ts) is the
 * one place that actually enforces "3 uppercase letters", unchanged.
 */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 15, color: '#0f172a',
  background: '#f8fafc', boxSizing: 'border-box', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#475569', marginBottom: 6,
}

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}

export default function AirportAutocomplete({ label, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const results = searchAirports(value, 6)

  function pick(airport: Airport) {
    onChange(airport.code)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 20,
            maxHeight: 220, overflowY: 'auto',
          }}
        >
          {results.map((a) => (
            <button
              key={a.code}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur/the
              // outside-click listener above can close this dropdown first.
              onMouseDown={(e) => { e.preventDefault(); pick(a) }}
              style={{
                display: 'flex', width: '100%', padding: '8px 14px',
                border: 'none', background: 'none', cursor: 'pointer',
                textAlign: 'left', fontSize: 13, alignItems: 'baseline', gap: 8,
              }}
            >
              <span style={{ fontWeight: 700, color: '#0f172a', minWidth: 34 }}>{a.code}</span>
              <span style={{ color: '#64748b' }}>{a.city}, {a.country} — {a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
