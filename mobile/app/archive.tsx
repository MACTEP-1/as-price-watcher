import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { getWatchesWithPrices } from '../../lib/watches'
import type { WatchWithLatestPrice } from '../../types'
import { formatCash, formatMiles, formatDate } from '../../lib/format'

/**
 * Mirrors app/archive/page.tsx on the web: same statuses, same muted
 * treatment (grey route text, status badge, no delete action) so a watch
 * that stopped being tracked reads as history rather than something still
 * live. No status-change timestamp exists on the watches table — only
 * created_at and the itinerary's depart_date — so the subtext below leans
 * on those instead of inventing a date the schema doesn't have.
 */

const STATUS_LABEL: Record<string, string> = {
  expired: 'Expired',
  removed: 'Removed',
  unsubscribed: 'Unsubscribed',
}

function statusSubtext(watch: WatchWithLatestPrice): string {
  switch (watch.status) {
    case 'expired':
      return `Departed ${formatDate(watch.depart_date)}`
    case 'removed':
      return 'You stopped watching this route'
    case 'unsubscribed':
      return 'Alerts turned off from an email link'
    default:
      return ''
  }
}

export default function ArchiveScreen() {
  const [watches, setWatches] = useState<WatchWithLatestPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const rows = await getWatchesWithPrices(supabase, user.id, [
      'expired',
      'removed',
      'unsubscribed',
    ])
    setWatches(rows)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Archive</Text>
        </View>
      </View>

      <FlatList
        data={watches}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Watches that expire, get removed, or have their alerts
            unsubscribed will show up here.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/watches/${item.id}`)}
          >
            <View style={styles.cardBody}>
              <View style={styles.routeRow}>
                <View style={styles.routeGroup}>
                  <Text style={styles.routeText}>{item.origin}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={styles.routeText}>{item.destination}</Text>
                </View>
                <Text style={styles.badge}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
              <Text style={styles.meta}>
                {formatDate(item.depart_date)}
                {item.return_date
                  ? ` · return ${formatDate(item.return_date)}`
                  : ' · one-way'}
                {' · '}
                <Text style={styles.metaCabin}>
                  {item.cabin_class.replace('_', ' ')}
                </Text>
              </Text>

              <View style={styles.grid}>
                <View style={styles.col}>
                  <Text style={styles.microLabel}>Last cash</Text>
                  <Text style={styles.price}>
                    {formatCash(item.latest_cash)}
                  </Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.microLabel}>Last miles</Text>
                  <Text style={styles.price}>
                    {formatMiles(item.latest_miles)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.checkCount}>{statusSubtext(item)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, paddingTop: 56, paddingBottom: 8 },
  back: { color: '#0060ac', fontSize: 15, marginBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 40,
    marginHorizontal: 32,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    // See mobile/app/index.tsx's card style for why this is boxShadow, not
    // shadow*/elevation.
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  cardBody: { padding: 18 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { fontSize: 19, fontWeight: '700', color: '#94a3b8' },
  arrow: { color: '#cbd5e1', fontSize: 15 },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    overflow: 'hidden',
  },
  meta: { marginTop: 4, fontSize: 13, color: '#94a3b8' },
  metaCabin: { textTransform: 'capitalize' },
  grid: { marginTop: 16, flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  microLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  price: { fontSize: 18, fontWeight: '700', color: '#64748b' },
  footer: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  checkCount: { fontSize: 12, color: '#94a3b8' },
})
