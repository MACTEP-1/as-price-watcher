import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { createWatch } from '../../lib/api'

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
 * flow. The one deliberate difference is the date inputs — the web form
 * uses a native <input type="date">, which has no RN equivalent without a
 * new native dependency (@react-native-community/datetimepicker), and
 * adding a native module here means rebuilding the iOS dev client, which
 * this project has already been burned by once. Plain YYYY-MM-DD text
 * fields send the exact same string shape the API expects, so nothing
 * downstream needs to know the difference. A native date picker is a fine
 * follow-up once there's a dev build handy to test it against.
 */
export default function NewWatchScreen() {
  const router = useRouter()
  const [tripType, setTripType] = useState<TripType>('one_way')
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    departDate: '',
    returnDate: '',
    cabinClass: 'economy' as string,
  })
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

    setLoading(true)
    try {
      const watch = await createWatch({
        origin,
        destination,
        departDate: form.departDate,
        returnDate: isRoundTrip ? form.returnDate : null,
        cabinClass: form.cabinClass,
      })
      router.replace(`/watches/${watch.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const sameDayReturn =
    isRoundTrip && form.returnDate && form.returnDate === form.departDate

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 40 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Watch a route</Text>

      <Text style={styles.label}>Popular routes</Text>
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
          <Text style={styles.label}>From (IATA)</Text>
          <TextInput
            style={styles.input}
            value={form.origin}
            onChangeText={(v) => set('origin', v.toUpperCase())}
            placeholder="SEA"
            placeholderTextColor="#94a3b8"
            maxLength={3}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>To (IATA)</Text>
          <TextInput
            style={styles.input}
            value={form.destination}
            onChangeText={(v) => set('destination', v.toUpperCase())}
            placeholder="LAX"
            placeholderTextColor="#94a3b8"
            maxLength={3}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={isRoundTrip ? styles.half : styles.full}>
          <Text style={styles.label}>Depart date</Text>
          <TextInput
            style={styles.input}
            value={form.departDate}
            onChangeText={(v) => set('departDate', v)}
            placeholder={minDate}
            placeholderTextColor="#94a3b8"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        {isRoundTrip && (
          <View style={styles.half}>
            <Text style={styles.label}>Return date</Text>
            <TextInput
              style={styles.input}
              value={form.returnDate}
              onChangeText={(v) => set('returnDate', v)}
              placeholder={form.departDate || minDate}
              placeholderTextColor="#94a3b8"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 16,
  },
  row: { flexDirection: 'row', gap: 16, marginTop: 4 },
  half: { flex: 1 },
  full: { flex: 1 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
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
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0060ac',
    alignItems: 'center',
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
