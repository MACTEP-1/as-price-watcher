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
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/watches/${item.id}`)}
          >
            <Text style={styles.route}>
              {item.origin} → {item.destination}
            </Text>
            <Text style={styles.date}>
              {item.depart_date}
              {item.return_date ? ` – ${item.return_date}` : ' (one-way)'}
            </Text>
            <Text style={styles.price}>
              {item.latest_cash != null ? `$${item.latest_cash}` : '—'}
              {item.latest_miles != null
                ? `  ·  ${item.latest_miles.toLocaleString()} mi`
                : ''}
            </Text>
          </Pressable>
        )}
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
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  newWatch: { color: '#0060ac', fontSize: 14, fontWeight: '600' },
  signOut: { color: '#0060ac', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  route: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  date: { fontSize: 13, color: '#64748b', marginTop: 2 },
  price: { fontSize: 15, fontWeight: '600', color: '#0060ac', marginTop: 8 },
})
