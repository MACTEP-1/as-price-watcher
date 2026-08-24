import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase/server'
import { getWatchesWithPrices } from '@/lib/watches'

export async function GET() {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Same enrichment the dashboard uses, so a native client gets an
    // identical shape without reimplementing the join.
    const watches = await getWatchesWithPrices(supabase, user.id)
    return NextResponse.json(watches)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { origin, destination, departDate, returnDate, cabinClass } = body

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
   * There is deliberately no trip_type column — two sources of truth for one
   * fact drift apart.
   *
   * A same-day return is legitimate (a business day-trip) but only when
   * chosen: the form makes that explicit and warns. A return BEFORE the
   * departure is nonsense.
   */
  const normalisedReturn = returnDate ? returnDate : null
  if (normalisedReturn && normalisedReturn < departDate) {
    return NextResponse.json(
      { error: 'returnDate cannot be before departDate' },
      { status: 400 }
    )
  }

  /**
   * Find-or-create the itinerary. This is a SECURITY DEFINER function rather
   * than a direct insert: granting users INSERT on `itineraries` would let
   * anyone write arbitrary rows into a table shared by every user. The
   * function also resolves the race where two users create the same
   * itinerary simultaneously.
   */
  const { data: itineraryId, error: itineraryError } = await supabase.rpc(
    'find_or_create_itinerary',
    {
      p_origin: origin,
      p_destination: destination,
      p_depart_date: departDate,
      p_return_date: normalisedReturn,
      p_cabin_class: cabinClass ?? 'economy',
    }
  )

  if (itineraryError || !itineraryId) {
    return NextResponse.json(
      { error: itineraryError?.message ?? 'Could not resolve itinerary' },
      { status: 500 }
    )
  }

  // One active watch per user per itinerary.
  const { data: existing } = await supabase
    .from('watches')
    .select('id')
    .eq('user_id', user.id)
    .eq('itinerary_id', itineraryId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active watch for this route and date', id: existing.id },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('watches')
    .insert({
      user_id: user.id,
      itinerary_id: itineraryId,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
