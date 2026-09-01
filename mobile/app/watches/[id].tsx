import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getWatchDetail } from '../../../lib/watches'
import type { PriceCheck, WatchWithLatestPrice } from '../../../types'

export default function WatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingTop: 56 }}
    >
      <Text style={styles.route}>
        {watch.origin} → {watch.destination}
      </Text>
      <Text style={styles.date}>
        {watch.depart_date}
        {watch.return_date ? ` – ${watch.return_date}` : ' (one-way)'}
      </Text>
      <Text style={styles.price}>
        {watch.latest_cash != null ? `$${watch.latest_cash}` : '—'}
        {watch.latest_miles != null
          ? `  ·  ${watch.latest_miles.toLocaleString()} mi`
          : ''}
      </Text>

      <Text style={styles.sectionTitle}>
        Price history ({checks.length} checks)
      </Text>
      {checks
        .slice()
        .reverse()
        .map((c) => (
          <View key={c.id} style={styles.row}>
            <Text style={styles.rowDate}>
              {new Date(c.checked_at).toLocaleDateString()}
            </Text>
            <Text style={styles.rowPrice}>
              {c.cash_price != null ? `$${c.cash_price}` : '—'}
            </Text>
          </View>
        ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  route: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  date: { fontSize: 14, color: '#64748b', marginTop: 4 },
  price: { fontSize: 18, fontWeight: '600', color: '#0060ac', marginTop: 12 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  rowDate: { color: '#64748b', fontSize: 13 },
  rowPrice: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
})
