import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getWatchesWithPrices } from '@/lib/watches'
import { getCheapestFare } from '@/lib/flights'
import { getCheapestMilesPrice } from '@/lib/miles'
import type { CabinClass } from '@/types'

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

  // ── First price check, right now ────────────────────────────────────
  // A brand-new watch otherwise shows nothing until tomorrow's cron run —
  // an unfriendly first impression. Only worth doing (and only worth the
  // SerpApi quota) when this itinerary has no history yet; if it's shared
  // with an existing watcher, their price data already answers the same
  // question for free. `itineraryId` here is never arbitrary user input —
  // it's the id this exact request just had RLS confirm belongs to the
  // watch it created a moment ago, via the normal user-scoped client. The
  // service-role client below is used ONLY for the one insert that requires
  // it (price_checks has no insert policy for regular users — see
  // supabase/schema.sql), never for anything shaped by what the caller sent.
  //
  // Best-effort: if this fails for any reason, the watch is already created
  // and saved — surfacing that failure to the client would be worse than
  // just falling back to "wait for the next cron run," so this only logs.
  try {
    const { count } = await supabase
      .from('price_checks')
      .select('id', { count: 'exact', head: true })
      .eq('itinerary_id', itineraryId)

    if (!count) {
      const [cashResult, milesResult] = await Promise.allSettled([
        getCheapestFare({
          origin,
          destination,
          departDate,
          returnDate: normalisedReturn,
          cabinClass: (cabinClass ?? 'economy') as CabinClass,
        }),
        getCheapestMilesPrice({
          origin,
          destination,
          departDate,
          cabinClass: (cabinClass ?? 'economy') as CabinClass,
        }),
      ])

      const cash = cashResult.status === 'fulfilled' ? cashResult.value : null
      const miles = milesResult.status === 'fulfilled' ? milesResult.value : null

      const serviceClient = createSupabaseServiceClient()
      const { error: checkInsertError } = await serviceClient
        .from('price_checks')
        .insert({
          itinerary_id: itineraryId,
          cash_price: cash?.cashPrice ?? null,
          cash_currency: cash?.currency ?? 'USD',
          miles_price: miles?.milesPrice ?? null,
          airline: 'AS',
          flight_number: cash?.flightNumber ?? null,
          duration_minutes: cash?.durationMinutes ?? null,
          stops: cash?.stops ?? 0,
        })

      if (checkInsertError) {
        console.error('[watches] immediate price check insert failed:', checkInsertError)
      }
    }
  } catch (err) {
    console.error('[watches] immediate price check failed:', err)
  }

  return NextResponse.json(data, { status: 201 })
}
