import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AS Price Watch',
  description: 'Track Alaska Airlines flight prices — cash & miles',
  manifest: '/manifest.json',
  themeColor: '#0060ac',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AS Watch' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {children}
      </body>
    </html>
  )
}
