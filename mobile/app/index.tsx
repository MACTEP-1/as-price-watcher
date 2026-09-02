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
// Reused unchanged from the web app — this file has no next/* imports by
// design (see its own header comment), so it works from any client that
// hands it a Supabase client and a user id.
import { getWatchesWithPrices } from '../../lib/watches'
import type { WatchWithLatestPrice } from '../../types'
// Pure formatting helpers, split out of lib/utils.ts specifically so mobile
// can share them without pulling in clsx/tailwind-merge (see lib/format.ts's
// own header comment).
import {
  formatCash,
  formatMiles,
  formatDate,
  pctChange,
  formatPctChange,
  changeColor,
} from '../../lib/format'

export default function DashboardScreen() {
  const [watches, setWatches] = useState<WatchWithLatestPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const rows = await getWatchesWithPrices(supabase, user.id)
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

  async function signOut() {
    await supabase.auth.signOut()
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
        <Text style={styles.headerTitle}>Your watches</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/archive')} hitSlop={8}>
            <Text style={styles.archiveLink}>Archive</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/watches/new')} hitSlop={8}>
            <Text style={styles.newWatch}>+ New</Text>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
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
          <Text style={styles.empty}>No active watches yet.</Text>
        }
        renderItem={({ item }) => {
          const cashChange = pctChange(item.latest_cash, item.prev_cash)
          const milesChange = pctChange(item.latest_miles, item.prev_miles)
          return (
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
                  <Text style={styles.chevron}>›</Text>
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
                    <Text style={styles.microLabel}>Cash</Text>
                    <Text style={styles.cash}>
                      {formatCash(item.latest_cash)}
                    </Text>
                    {cashChange !== null && (
                      <Text
                        style={[styles.change, { color: changeColor(cashChange) }]}
                      >
                        {formatPctChange(cashChange)} vs prev
                      </Text>
                    )}
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.microLabel}>Miles</Text>
                    <Text style={styles.miles}>
                      {formatMiles(item.latest_miles)}
                    </Text>
                    {milesChange !== null && (
                      <Text
                        style={[styles.change, { color: changeColor(milesChange) }]}
                      >
                        {formatPctChange(milesChange)} vs prev
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.footer}>
                <Text style={styles.checkCount}>
                  {item.price_history.length} check
                  {item.price_history.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  newWatch: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: '#0060ac',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
  signOut: { color: '#94a3b8', fontSize: 13 },
  archiveLink: { color: '#0060ac', fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    // RN's shadow* props are iOS-only; elevation covers Android. Same
    // silhouette as the web card's `0 1px 4px rgba(0,0,0,0.08)`.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardBody: { padding: 18 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { fontSize: 19, fontWeight: '700', color: '#0f172a' },
  arrow: { color: '#94a3b8', fontSize: 15 },
  chevron: { color: '#94a3b8', fontSize: 15 },
  meta: { marginTop: 4, fontSize: 13, color: '#64748b' },
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
  cash: { fontSize: 22, fontWeight: '700', color: '#0060ac' },
  miles: { fontSize: 22, fontWeight: '700', color: '#00a551' },
  change: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  footer: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  checkCount: { fontSize: 12, color: '#94a3b8' },
})
