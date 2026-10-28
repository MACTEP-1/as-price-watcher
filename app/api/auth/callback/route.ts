import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { safeNextPath } from '@/lib/format'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  // Only ever a path on this site: `new URL(next, req.url)` with a full URL
  // in ?next= would otherwise send the freshly signed-in user elsewhere.
  const next = safeNextPath(searchParams.get('next'))

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, req.url))
  }

  if (code) {
    const cookieStore = await cookies()
    const response = NextResponse.redirect(new URL(next, req.url))

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)
    return response
  }

  return NextResponse.redirect(new URL('/login', req.url))
}