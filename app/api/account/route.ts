import { NextResponse } from 'next/server'
import { createSupabaseRouteClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { deleteAccount } from '@/lib/account'

/**
 * DELETE /api/account — permanently delete the signed-in user's account.
 * Web (session cookie) and mobile (Bearer token) both land here; see
 * lib/account.ts for exactly what is removed and why in that order.
 *
 * The user id comes ONLY from the verified session (auth.getUser asks the
 * auth server, so a forged or already-deleted token gets 401) — never from
 * the request body. The service-role client is created only after that.
 */
export async function DELETE() {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await deleteAccount(createSupabaseServiceClient(), user.id)
    if (result.cleanupError) {
      console.error(`[account] deleted ${user.id}; orphan-trip cleanup failed:`, result.cleanupError)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[account] delete failed for ${user.id}:`, err)
    return NextResponse.json(
      { error: 'Could not delete your account. Nothing was removed — please try again.' },
      { status: 500 }
    )
  }
}
