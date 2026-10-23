import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { createWatch } from '../../lib/api'
import DatePickerField from '../../components/DatePickerField'
import AirportAutocomplete from '../../components/AirportAutocomplete'
import { FARE_SCOPE_OPTIONS, fareScopeHint, parseFlightList } from '../../../lib/format'

const CABIN_OPTIONS = [
  { value: 'economy', label: 'Economy' },
  { value: 'premium_economy', label: 'Premium Econ.' },
  { value: 'business', label: 'Business/First' },
] as const

const TRIP_OPTIONS = [
  { value: 'one_way', label: 'One-way' },
  { value: 'round_trip', label: 'Round trip' },
] as const

type TripType = (typeof TRIP_OPTIONS)[number]['value']

/**
 * Stop limit (migration 006). "Up to 2 stops" exists in the API but isn't
 * offered: it's barely different from Any on the routes this app watches.
 * If no Alaska itinerary fits the limit, the watch tracks the cheapest
 * fitting one on any airline and the card says "no Alaska leg" (user's
 * choice 09/24, over tracking nothing).
 */
const STOP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 0, label: 'Nonstop only' },
  { value: 1, label: 'Up to 1 stop' },
]


// Same list as the web form's POPULAR_ROUTES (app/watches/new/page.tsx).
const POPULAR_ROUTES = [
  { o: 'SEA', d: 'LAX', label: 'SEA → LAX' },
  { o: 'SEA', d: 'SFO', label: 'SEA → SFO' },
  { o: 'SEA', d: 'JFK', label: 'SEA → JFK' },
  { o: 'SEA', d: 'ORD', label: 'SEA → ORD' },
  { o: 'SEA', d: 'HNL', label: 'SEA → HNL' },
  { o: 'PDX', d: 'LAX', label: 'PDX → LAX' },
]

function todayPlusDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * New-watch screen, mirroring app/watches/new/page.tsx on the web: same
 * fields, same validation rules, same POST /api/watches + navigate-to-detail
 * flow. Dates use components/DatePickerField.tsx (@react-native-community/
 * datetimepicker) rather than the web form's native <input type="date"> —
 * see that component's header comment for the parsing details. This
 * replaced a plain YYYY-MM-DD text field (2026-09-15), deferred until then
 * because the native module needs a dev-client rebuild to test against.
 * DATE_RE below still guards the submit path defensively even though the
 * picker itself can't produce a malformed string — same "don't only trust
 * the UI" reasoning as the web form re-checking what the API also enforces.
 */
export default function NewWatchScreen() {
  const router = useRouter()
  // Pre-fill from a watch screen's "Watch just this flight" (migration 012).
  const prefill = useLocalSearchParams<{
    from?: string; to?: string; depart?: string; return?: string; cabin?: string; out?: string
  }>()
  const [tripType, setTripType] = useState<TripType>(prefill.return ? 'round_trip' : 'one_way')
  const [form, setForm] = useState({
    origin: prefill.from ?? '',
    destination: prefill.to ?? '',
    departDate: prefill.depart ?? '',
    returnDate: prefill.return ?? '',
    cabinClass: (prefill.cabin ?? 'economy') as string,
  })
  // Pinned flights — behind a small link unless pre-filled.
  const [showPins, setShowPins] = useState(!!prefill.out)
  const [pinOut, setPinOut] = useState(prefill.out ?? '')
  const [pinRet, setPinRet] = useState('')
  const [maxStops, setMaxStops] = useState<number | null>(null)
  const [fareScope, setFareScope] = useState<'alaska_only' | 'alaska_leg'>('alaska_only')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Same rule as the web form: switching to one-way clears any return date
  // so a stale value can never be submitted.
  function chooseTripType(next: TripType) {
    setTripType(next)
    if (next === 'one_way') set('returnDate', '')
  }

  const minDate = todayPlusDays(1)
  const isRoundTrip = tripType === 'round_trip'

  async function handleSubmit() {
    setError('')

    const origin = form.origin.toUpperCase().trim()
    const destination = form.destination.toUpperCase().trim()

    if (!origin || !destination || !form.departDate) {
      setError('Origin, destination, and depart date are required.')
      return
    }
    if (!DATE_RE.test(form.departDate)) {
      setError('Depart date must be in YYYY-MM-DD format.')
      return
    }
    if (form.departDate < minDate) {
      setError('Depart date must be in the future.')
      return
    }
    if (isRoundTrip) {
      if (!form.returnDate) {
        setError('Pick a return date, or switch to one-way.')
        return
      }
      if (!DATE_RE.test(form.returnDate)) {
        setError('Return date must be in YYYY-MM-DD format.')
        return
      }
      if (form.returnDate < form.departDate) {
        setError('Return date cannot be before the departure date.')
        return
      }
    }

    const outboundFlights = parseFlightList(pinOut)
    const returnFlights = isRoundTrip ? parseFlightList(pinRet) : []
    if (outboundFlights === null || returnFlights === null) {
      setError("Couldn't read the flight numbers — use e.g. AS 326, or AS 623, AS 625 for a connection.")
      return
    }
    if (returnFlights.length && !outboundFlights.length) {
      setError('Add the outbound flight too, or clear the return flight.')
      return
    }

    setLoading(true)
    try {
      const watch = await createWatch({
        origin,
        destination,
        departDate: form.departDate,
        returnDate: isRoundTrip ? form.returnDate : null,
        cabinClass: form.cabinClass,
        maxStops,
        fareScope,
        outboundFlights: outboundFlights.length ? outboundFlights : null,
        returnFlights: returnFlights.length ? returnFlights : null,
      })
      router.replace(`/watches/${watch.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const sameDayReturn =
    isRoundTrip && !!form.returnDate && form.returnDate === form.departDate

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 40 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Watch a route</Text>

      <View style={styles.card}>
      <Text style={[styles.label, styles.labelFirst]}>Popular routes</Text>
      <View style={styles.pillRow}>
        {POPULAR_ROUTES.map((r) => {
          const active = form.origin === r.o && form.destination === r.d
          return (
            <Pressable
              key={r.label}
              onPress={() => {
                set('origin', r.o)
                set('destination', r.d)
              }}
              style={[styles.pillSmall, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {r.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.label}>Trip type</Text>
      <View style={styles.pillRow}>
        {TRIP_OPTIONS.map((t) => {
          const active = tripType === t.value
          return (
            <Pressable
              key={t.value}
              onPress={() => chooseTripType(t.value)}
              style={[styles.pillFlex, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <AirportAutocomplete
            label="From"
            value={form.origin}
            onChange={(v) => set('origin', v)}
            placeholder="Seattle or SEA"
          />
        </View>
        <View style={styles.half}>
          <AirportAutocomplete
            label="To"
            value={form.destination}
            onChange={(v) => set('destination', v)}
            placeholder="Los Angeles or LAX"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={isRoundTrip ? styles.half : styles.full}>
          <DatePickerField
            label="Depart date"
            value={form.departDate}
            onChange={(v) => set('departDate', v)}
            minimumDate={minDate}
            placeholder={minDate}
          />
        </View>
        {isRoundTrip && (
          <View style={styles.half}>
            <DatePickerField
              label="Return date"
              value={form.returnDate}
              onChange={(v) => set('returnDate', v)}
              minimumDate={form.departDate || minDate}
              placeholder={form.departDate || minDate}
            />
          </View>
        )}
      </View>

      {sameDayReturn && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>
            Same-day return — this prices a there-and-back on{' '}
            {form.departDate}. Intended?
          </Text>
        </View>
      )}

      <Text style={styles.label}>Cabin class</Text>
      <View style={styles.pillRow}>
        {CABIN_OPTIONS.map((c) => {
          const active = form.cabinClass === c.value
          return (
            <Pressable
              key={c.value}
              onPress={() => set('cabinClass', c.value)}
              style={[styles.pillFlex, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.label}>Stops</Text>
      <View style={styles.pillRow}>
        {STOP_OPTIONS.map((o) => {
          const active = maxStops === o.value
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => setMaxStops(o.value)}
              style={[styles.pillFlex, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.label}>Airlines</Text>
      <View style={styles.pillRow}>
        {FARE_SCOPE_OPTIONS.map((o) => {
          const active = fareScope === o.value
          return (
            <Pressable
              key={o.value}
              onPress={() => setFareScope(o.value)}
              style={[styles.pillFlex, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={styles.fieldHint}>{fareScopeHint(fareScope, isRoundTrip)}</Text>

      {/* Pinned flights — a small link until used. */}
      {!showPins ? (
        <Pressable onPress={() => setShowPins(true)} hitSlop={8}>
          <Text style={styles.pinLink}>Specific flights (optional)</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.label}>Specific flights</Text>
          <View style={styles.row}>
            <TextInput
              value={pinOut}
              onChangeText={setPinOut}
              placeholder="Outbound, e.g. AS 326"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.pinInput, isRoundTrip ? styles.half : styles.full]}
            />
            {isRoundTrip && (
              <TextInput
                value={pinRet}
                onChangeText={setPinRet}
                placeholder="Return (optional)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.pinInput, styles.half]}
              />
            )}
          </View>
          <Text style={styles.fieldHint}>
            Only these flights are priced; Stops and Airlines are ignored. If they aren't on sale that
            day, no price is recorded. A connection: AS 623, AS 625.
            {isRoundTrip ? ' No return flight = the cheapest return with that outbound.' : ''}
          </Text>
          <Pressable
            onPress={() => {
              setShowPins(false)
              setPinOut('')
              setPinRet('')
            }}
            hitSlop={8}
          >
            <Text style={styles.pinLink}>Clear</Text>
          </Pressable>
        </>
      )}
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submit, loading && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitText}>
          {loading ? 'Creating watch…' : 'Start watching'}
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        Prices are checked daily. You&apos;ll get an email when the price
        drops ≥10% or hits a new low.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  back: { color: '#0060ac', fontSize: 15, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 18,
    // See mobile/app/index.tsx's card style for why this is boxShadow, not
    // shadow*/elevation.
    boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  labelFirst: { marginTop: 0 },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  pinLink: { fontSize: 12, color: '#0060ac', marginTop: 12 },
  pinInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  row: { flexDirection: 'row', gap: 16, marginTop: 4 },
  half: { flex: 1 },
  full: { flex: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillSmall: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  pillFlex: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#0060ac', borderColor: '#0060ac' },
  pillText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  pillTextActive: { color: '#fff' },
  warnBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  warnText: { color: '#b45309', fontSize: 13 },
  errorBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  submit: {
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#0060ac',
    alignItems: 'center',
    boxShadow: '0 4px 10px rgba(0,96,172,0.25)',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
    color: '#94a3b8',
  },
})
