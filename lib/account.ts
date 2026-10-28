/**
 * Account deletion — what "delete my account" actually removes.
 *
 * Both stores require it for any app with account creation: Apple
 * (guideline 5.1.1(v)) wants the whole account record and its personal
 * data deleted, not deactivated; Google Play wants an in-app path plus a
 * web page (here: /account on the website).
 *
 * What a user owns, and how each goes:
 *   - auth.users row (email, sessions, identities)  → auth.admin.deleteUser
 *   - watches  (user_id → auth.users ON DELETE CASCADE)  → cascade
 *   - alerts   (user_id and watch_id, both CASCADE)       → cascade
 *   - itineraries + their price_checks: SHARED, no user_id. An itinerary
 *     is one trip (route, dates, cabin, limits) that any number of users
 *     can watch. Deleted here only if no watch at all still points at it —
 *     the trip the user looked up goes with them, other people's history
 *     stays. price_checks are deleted EXPLICITLY first: in production the
 *     price_checks → itineraries key is NO ACTION, not CASCADE (migration
 *     001 added the column without it; schema.sql used to claim cascade —
 *     caught by reading pg_constraint on 2026-10-28).
 *
 * Order matters: read the user's itinerary ids FIRST (the cascade removes
 * the watches that link them), then delete the user, then the orphans.
 * If deleteUser fails nothing has been removed. If the orphan cleanup
 * fails afterwards the account and every personal row are already gone;
 * what's left is an unlinked trip, the same state removing a watch has
 * always left behind — so it's logged, not reported as a failure.
 *
 * Runs with the SERVICE-ROLE client (deleting an auth user needs it, and
 * itineraries are not writable by `authenticated` at all — migration 007).
 * The caller must have authenticated the user first and pass THEIR id.
 */

export interface AccountDeletionClient {
  from(table: string): any // eslint-disable-line @typescript-eslint/no-explicit-any
  auth: {
    admin: {
      deleteUser(id: string): Promise<{ error: { message: string } | null }>
    }
  }
}

export interface AccountDeletionResult {
  /** Itineraries removed because nobody else watches them. */
  itinerariesDeleted: number
  /** Set when the post-deletion cleanup failed (account is still deleted). */
  cleanupError?: string
}

export async function deleteAccount(
  service: AccountDeletionClient,
  userId: string
): Promise<AccountDeletionResult> {
  if (!userId) throw new Error('deleteAccount: no user id')

  // 1. Which trips did this user watch (any status)?
  const owned = await service.from('watches').select('itinerary_id').eq('user_id', userId)
  if (owned.error) throw new Error(owned.error.message)
  const itineraryIds = [
    ...new Set(((owned.data ?? []) as { itinerary_id: string }[]).map((r) => r.itinerary_id)),
  ]

  // 2. The account itself; watches and alerts cascade.
  const { error: delError } = await service.auth.admin.deleteUser(userId)
  if (delError) throw new Error(delError.message)

  if (itineraryIds.length === 0) return { itinerariesDeleted: 0 }

  // 3. Trips nobody watches any more: their price history, then the trip.
  // A watch (or a cron price check) landing in between makes the itinerary
  // delete fail on its foreign key, which leaves the trip in place — the
  // safe way round; it's reported as a cleanup error.
  const stillWatched = await service.from('watches').select('itinerary_id').in('itinerary_id', itineraryIds)
  if (stillWatched.error) {
    return { itinerariesDeleted: 0, cleanupError: stillWatched.error.message }
  }
  const keep = new Set(((stillWatched.data ?? []) as { itinerary_id: string }[]).map((r) => r.itinerary_id))
  const orphans = itineraryIds.filter((id) => !keep.has(id))
  if (orphans.length === 0) return { itinerariesDeleted: 0 }

  const history = await service.from('price_checks').delete().in('itinerary_id', orphans)
  if (history.error) {
    return { itinerariesDeleted: 0, cleanupError: history.error.message }
  }
  const removed = await service.from('itineraries').delete().in('id', orphans)
  if (removed.error) {
    return { itinerariesDeleted: 0, cleanupError: removed.error.message }
  }
  return { itinerariesDeleted: orphans.length }
}
