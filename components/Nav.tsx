'use client'

import Link from 'next/link'

export default function Nav() {

  return (
    <nav style={{ background: '#0060ac', color: '#fff' }}>
      <div style={{ maxWidth: 896, margin: '0 auto', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 18, color: '#fff', textDecoration: 'none' }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          AS Watch
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ fontSize: 14, fontWeight: 500, color: '#bfdbfe', textDecoration: 'none' }}>
            Watches
          </Link>
          <Link href="/archive" style={{ fontSize: 14, fontWeight: 500, color: '#bfdbfe', textDecoration: 'none' }}>
            Archive
          </Link>
          <Link href="/watches/new" style={{ fontSize: 14, fontWeight: 500, background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '6px 12px', borderRadius: 8, textDecoration: 'none' }}>
            + New watch
          </Link>
          {/* Sign out lives on the Account page, next to Delete account. */}
          <Link href="/account" style={{ fontSize: 14, fontWeight: 500, color: '#bfdbfe', textDecoration: 'none' }}>
            Account
          </Link>
        </div>
      </div>
    </nav>
  )
}