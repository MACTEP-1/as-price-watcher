import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fare Alerts',
  description: 'Get an email when Alaska Airlines fares drop — cash & miles. Not affiliated with Alaska Airlines.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Fare Alerts' },
}

export const viewport: Viewport = {
  themeColor: '#0060ac',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#f8fafc' }}>
        {children}
      </body>
    </html>
  )
}
