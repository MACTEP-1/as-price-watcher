import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getWatchDetail } from '../../../lib/watches'
import type { PriceCheck, WatchWithLatestPrice } from '../../../types'
import {
  formatCash,
  formatMiles,
  formatDate,
  pctChange,
  formatPctChange,
  changeColor,
} from '../../../lib/format'

export default function WatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [watch, setWatch] = useState<WatchWithLatestPrice | null>(null)
  const [checks, setChecks] = useState<PriceCheck[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !id) return

      const result = await getWatchDetail(supabase, id, user.id)
      if (cancelled) return
      if (result) {
        setWatch(result.watch)
        setChecks(result.checks)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    )
  }

  if (!watch) {
    return (
      <View style={styles.center}>
        <Text>Watch not found.</Text>
      </View>
    )
  }

  const cashChange = pctChange(watch.latest_cash, watch.prev_cash)
  const milesChange = pctChange(watch.latest_miles, watch.prev_miles)

  // "New low" badge: a check whose cash price is lower than every check
  // before it. Only meaningful once there's a prior price to beat, so the
  // very first check never gets one.
  const chronological = checks.slice()
  let runningMin = Infinity
  const newLowIds = new Set<string>()
  chronological.forEach((c, i) => {
    if (c.cash_price != null) {
      if (i > 0 && c.cash_price < runningMin) newLowIds.add(c.id)
      runningMin = Math.min(runningMin, c.cash_price)
    }
  })

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <Text style={styles.route}>
          {watch.origin} → {watch.destination}
        </Text>
        <Text style={styles.meta}>
          {formatDate(watch.depart_date)}
          {watch.return_date ? ` – ${formatDate(watch.return_date)}` : ' · one-way'}
          {' · '}
          <Text style={styles.metaCabin}>{watch.cabin_class.replace('_', ' ')}</Text>
        </Text>

        <View style={styles.grid}>
          <View style={styles.col}>
            <Text style={styles.microLabel}>Cash</Text>
            <Text
              style={[styles.cash, watch.latest_cash === null && styles.priceMuted]}
            >
              {formatCash(watch.latest_cash)}
            </Text>
            {cashChange !== null && (
              <Text style={[styles.change, { color: changeColor(cashChange) }]}>
                {formatPctChange(cashChange)} vs prev
              </Text>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.microLabel}>Miles</Text>
            <Text
              style={[styles.miles, watch.latest_miles === null && styles.priceMuted]}
            >
              {formatMiles(watch.latest_miles)}
            </Text>
            {milesChange !== null && (
              <Text style={[styles.change, { color: changeColor(milesChange) }]}>
                {formatPctChange(milesChange)} vs prev
              </Text>
            )}
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Price history ({checks.length} check{checks.length !== 1 ? 's' : ''})
      </Text>

      <View style={styles.historyCard}>
        {checks
          .slice()
          .reverse()
          .map((c, i, arr) => (
            <View
              key={c.id}
              style={[styles.row, i === arr.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rowDate}>
                {new Date(c.checked_at).toLocaleDateString()}
              </Text>
              <View style={styles.rowPriceWrap}>
                {newLowIds.has(c.id) && (
                  <Text style={styles.badge}>NEW LOW</Text>
                )}
                <Text style={styles.rowCash}>
                  {c.cash_price != null ? `$${c.cash_price}` : '—'}
                </Text>
              </View>
            </View>
          ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  back: { color: '#0060ac', fontSize: 15, marginBottom: 18 },
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 20,
    // See app/index.tsx's card style for why this is boxShadow, not
    // shadow*/elevation.
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  route: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 4 },
  metaCabin: { textTransform: 'capitalize' },
  grid: { marginTop: 18, flexDirection: 'row', gap: 20 },
  col: { flex: 1 },
  microLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cash: { fontSize: 28, fontWeight: '700', color: '#0060ac' },
  miles: { fontSize: 28, fontWeight: '700', color: '#00a551' },
  // Overrides cash/miles color when there's no price yet — see the same
  // style in app/index.tsx for why.
  priceMuted: { color: '#94a3b8' },
  change: { fontSize: 12, fontWeight: '500', marginTop: 3 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 28,
    marginBottom: 12,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLast: { borderBottomWidth: 0 },
  rowDate: { color: '#64748b', fontSize: 13 },
  rowPriceWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCash: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
})
