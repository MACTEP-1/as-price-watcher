import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy — Fare Alerts' }

/**
 * Privacy policy — the URL both app stores require, and what the Apple
 * "App Privacy" and Google "Data safety" answers must agree with. Keep it
 * true to the code: if a new kind of data or a new service is added, this
 * page changes in the same commit.
 */
const CONTACT = 'mactep.l@gmail.com'
const UPDATED = 'October 29, 2026'

const h2: React.CSSProperties = { margin: '28px 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }
const p: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, lineHeight: 1.6, color: '#334155' }

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 16px 64px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Link href="/" style={{ fontSize: 14, color: '#0060ac', textDecoration: 'none' }}>← Fare Alerts</Link>
      <h1 style={{ margin: '16px 0 4px', fontSize: 28, fontWeight: 700, color: '#0f172a' }}>Privacy policy</h1>
      <p style={{ ...p, color: '#64748b', fontSize: 14 }}>Last updated {UPDATED}</p>

      <p style={p}>
        Fare Alerts watches flight prices for trips you choose and emails you when they drop. This page
        explains what that needs from you, where it goes, and how to remove it. Fare Alerts is an
        independent project and is not affiliated with Alaska Airlines.
      </p>

      <h2 style={h2}>What we collect</h2>
      <p style={p}>
        <strong>Your email address</strong>, to sign you in (with an emailed code or link) and to send your
        price alerts. <strong>The trips you watch</strong>: airports, dates, cabin, and any stop limit or
        specific flight numbers you set, plus the alerts we have sent you. That is all. There is no
        payment information, no location, no contacts, and no advertising or analytics tracking.
      </p>
      <p style={p}>
        Prices we look up are stored against the trip, not against you, and are shared by everyone
        watching the same trip.
      </p>

      <h2 style={h2}>How it is used</h2>
      <p style={p}>
        Only to run the service: checking prices once a day for the trips you watch, showing you the
        history, and emailing you when a price drops. We do not sell or rent your data, show ads, or use it
        to track you across other apps or websites.
      </p>

      <h2 style={h2}>Services that handle it for us</h2>
      <p style={p}>
        <strong>Supabase</strong> stores your account and watches. <strong>Vercel</strong> hosts the
        website and the app&apos;s server. <strong>Resend</strong> delivers our emails, so it receives your
        email address and the alert text. To look up prices we send only flight details — airports and
        dates, never your email or name — to <strong>SerpApi</strong> (Google Flights results) and{' '}
        <strong>seats.aero</strong> (award availability). Like any website, these providers keep short-lived
        technical logs such as IP addresses.
      </p>

      <h2 style={h2}>How long we keep it</h2>
      <p style={p}>
        Until you delete your account. Watches for trips that have departed stay visible in your archive
        until then.
      </p>

      <h2 style={h2}>Deleting your account</h2>
      <p style={p}>
        In the app or on the website, open <strong>Account</strong> and choose <strong>Delete my
        account</strong> (on the website: the <Link href="/account" style={{ color: '#0060ac' }}>Account page</Link>,
        after signing in). This immediately and permanently deletes your email address, your watches and
        your alert history, and the price history of any trip that nobody else is watching. Alert emails
        stop at once. Our database provider&apos;s backups may hold a copy for a short time before it is
        overwritten. You can also email us and we will do it for you.
      </p>

      <h2 style={h2}>Children</h2>
      <p style={p}>Fare Alerts is not directed at children under 13 and we do not knowingly collect their data.</p>

      <h2 style={h2}>Changes and contact</h2>
      <p style={p}>
        If this policy changes, the new version will be posted here with a new date. Questions or requests:{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: '#0060ac' }}>{CONTACT}</a>.
      </p>
    </main>
  )
}
