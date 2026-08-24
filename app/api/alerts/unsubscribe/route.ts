import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

// One-click unsubscribe from email alerts for a specific watch.
// Linked from alert emails — no auth required (watchId + alertId pair is unguessable).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const watchId = searchParams.get('watchId')
  const alertId = searchParams.get('alertId')

  if (!watchId || !alertId) {
    return new NextResponse('Invalid link', { status: 400 })
  }

  // Verify the alertId belongs to this watchId (prevents guessing)
  const supabase = createSupabaseServiceClient()
  const { data: alert } = await supabase
    .from('alerts')
    .select('id')
    .eq('id', alertId)
    .eq('watch_id', watchId)
    .single()

  if (!alert) {
    return new NextResponse('Link not found', { status: 404 })
  }

  // Soft-delete the watch (stop watching = stop alerts)
  await supabase
    .from('watches')
    .update({ status: 'unsubscribed' })
    .eq('id', watchId)

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center">
      <h2>Watch removed ✓</h2>
      <p>You won't receive any more alerts for this route.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Back to dashboard</a>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
