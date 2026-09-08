/**
 * Bounded-concurrency map.
 *
 * Why this exists: the price-check cron used to walk its itineraries in a
 * sequential `for...of`, so total wall-clock was the SUM of every route's
 * upstream latency. cron-job.org enforces a hard 30s timeout (its maximum on
 * this account — it cannot be raised), so each added route pushed the run
 * closer to a guaranteed "Failed (timeout)". Two routes were already enough
 * to reach it on a slow morning.
 *
 * Running them concurrently makes wall-clock the SLOWEST route rather than
 * the sum. Unbounded `Promise.all` would do that too, but it also fires N
 * simultaneous SerpApi searches, and upstream rate limits are a real
 * constraint on a 250-searches/month free tier. So concurrency is capped.
 *
 * Guarantees, all covered by lib/__tests__/concurrency.test.mts:
 *   - Results come back in INPUT order, regardless of completion order.
 *   - A rejecting worker never rejects the whole batch; its slot gets the
 *     rejection reason passed through `onError` instead.
 *   - At most `limit` workers are in flight at any moment.
 */

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onError: (error: unknown, item: T, index: number) => R
): Promise<R[]> {
  // A limit below 1 would deadlock the queue — clamp rather than hang.
  const max = Math.max(1, Math.floor(limit))
  const results = new Array<R>(items.length)

  // Shared cursor: each worker claims the next index. This keeps exactly
  // `max` workers busy even when tasks finish at wildly different times,
  // which fixed-size chunking does not (a chunk waits for its slowest member
  // before the next chunk starts).
  let cursor = 0

  async function runner(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return

      const item = items[index]
      try {
        results[index] = await worker(item, index)
      } catch (error) {
        // Never let one bad item reject the batch — the caller decides what
        // a failed slot looks like.
        results[index] = onError(error, item, index)
      }
    }
  }

  const runners = Array.from({ length: Math.min(max, items.length) }, runner)
  await Promise.all(runners)

  return results
}
