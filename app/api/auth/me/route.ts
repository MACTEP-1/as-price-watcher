import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ id: user.id, email: user.email })
}
