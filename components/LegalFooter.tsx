import Link from 'next/link'

/**
 * "Not affiliated" + privacy link, shown on public pages. Stores ask for a
 * reachable privacy policy, and naming Alaska Airlines (whose fares this
 * tracks) without a disclaimer is what trademark reviews flag.
 */
export default function LegalFooter({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const color = tone === 'dark' ? 'rgba(255,255,255,0.65)' : '#94a3b8'
  return (
    <p style={{ margin: '24px 0 0', padding: '0 16px 24px', fontSize: 12, textAlign: 'center', color }}>
      Fare Alerts is not affiliated with Alaska Airlines.{' '}
      <Link href="/privacy" style={{ color, textDecoration: 'underline' }}>Privacy</Link>
    </p>
  )
}
