import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AS Price Watch',
  description: 'Track Alaska Airlines flight prices — cash & miles',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AS Watch' },
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
