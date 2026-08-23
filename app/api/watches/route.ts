import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('watches')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { origin, destination, departDate, returnDate, cabinClass } = body

  // Basic validation
  if (!origin || !destination || !departDate) {
    return NextResponse.json({ error: 'origin, destination, and departDate are required' }, { status: 400 })
  }
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return NextResponse.json({ error: 'origin and destination must be 3-letter IATA codes' }, { status: 400 })
  }
  if (new Date(departDate) < new Date()) {
    return NextResponse.json({ error: 'departDate must be in the future' }, { status: 400 })
  }

  /**
   * Trip type is encoded by return_date: null = one-way, set = round trip.
   * There is deliberately no separate trip_type column — two sources of
   * truth for one fact drift apart.
   *
   * A returnDate BEFORE departDate is nonsense and was previously accepted,
   * as was an accidental same-day return (the form's date picker allowed
   * the departure date itself). Same-day is legitimate — a business
   * day-trip — so it is allowed, but only when explicitly chosen; the UI
   * now makes that choice deliberate and warns about it.
   */
  if (returnDate != null && returnDate !== '') {
    if (returnDate < departDate) {
      return NextResponse.json(
        { error: 'returnDate cannot be before departDate' },
        { status: 400 }
      )
    }
  }

  // Prevent duplicates
  const { data: existing } = await supabase
    .from('watches')
    .select('id')
    .eq('user_id', user.id)
    .eq('origin', origin)
    .eq('destination', destination)
    .eq('depart_date', departDate)
    .eq('active', true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'You already have an active watch for this route and date', id: existing.id }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('watches')
    .insert({
      user_id: user.id,
      origin,
      destination,
      depart_date: departDate,
      // Empty string must normalise to null, or it would read as a round trip
      return_date: returnDate ? returnDate : null,
      cabin_class: cabinClass ?? 'economy',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
