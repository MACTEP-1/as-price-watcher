'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="bg-[#0060ac] text-white">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          AS Watch
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className={cn(
              'text-sm font-medium hover:text-blue-100 transition-colors',
              pathname === '/dashboard' ? 'text-white' : 'text-blue-200'
            )}
          >
            Watches
          </Link>
          <Link
            href="/watches/new"
            className="text-sm font-medium bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            + New watch
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-blue-200 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
