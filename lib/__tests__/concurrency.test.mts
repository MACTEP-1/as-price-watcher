/**
 * Behaviour tests for mapWithConcurrency — run with:
 *   npx tsx lib/__tests__/concurrency.test.mts
 *
 * These exist because swapping the cron's sequential itinerary loop for a
 * concurrent one is exactly the kind of change that looks right and silently
 * reorders or swallows things. Each case below maps to a guarantee the cron
 * route depends on.
 */

import concurrencyModule from '../concurrency.ts'

// No "type": "module" in package.json, so tsx's loader hands back the named
// ESM exports wrapped in a CJS-interop default. Destructure from that.
const { mapWithConcurrency } = concurrencyModule as unknown as {
  mapWithConcurrency: typeof import('../concurrency.ts').mapWithConcurrency
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── 1. Order is input order, not completion order ────────────────────────
// The cron returns `results` as its response body; if these reordered, the
// rows would stop lining up with the itineraries they describe.
{
  console.log('\nordering')
  const items = [0, 1, 2, 3, 4, 5]
  // Deliberately invert: item 0 is slowest, item 5 is fastest.
  const out = await mapWithConcurrency(
    items,
    3,
    async (n) => {
      await sleep((6 - n) * 20)
      return `item-${n}`
    },
    () => 'error'
  )
  check(
    'results follow input order despite inverted completion order',
    JSON.stringify(out) === JSON.stringify(items.map((n) => `item-${n}`)),
    JSON.stringify(out)
  )
}

// ── 2. One rejection must not discard the whole batch ────────────────────
// A single broken itinerary must never wipe out the results of routes that
// checked and stored successfully.
{
  console.log('\nerror isolation')
  const out = await mapWithConcurrency(
    [1, 2, 3, 4],
    2,
    async (n) => {
      if (n === 2 || n === 3) throw new Error(`boom-${n}`)
      return `ok-${n}`
    },
    (err) => `handled:${(err as Error).message}`
  )
  check(
    'successful items survive alongside failures',
    JSON.stringify(out) ===
      JSON.stringify(['ok-1', 'handled:boom-2', 'handled:boom-3', 'ok-4']),
    JSON.stringify(out)
  )
}

// ── 3. Concurrency cap is actually enforced ──────────────────────────────
// Each itinerary fires a SerpApi search; unbounded parallelism would hammer
// a rate-limited free tier.
{
  console.log('\nconcurrency limit')
  let inFlight = 0
  let peak = 0
  await mapWithConcurrency(
    Array.from({ length: 20 }, (_, i) => i),
    4,
    async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await sleep(15)
      inFlight--
      return null
    },
    () => null
  )
  check('never exceeds the limit', peak <= 4, `peak was ${peak}`)
  check('actually uses the limit (not accidentally serial)', peak === 4, `peak was ${peak}`)
}

// ── 4. Cap is respected even when workers fail ───────────────────────────
// A throwing worker must release its slot, not leak it.
{
  console.log('\nconcurrency limit with failures')
  let inFlight = 0
  let peak = 0
  const out = await mapWithConcurrency(
    Array.from({ length: 12 }, (_, i) => i),
    3,
    async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await sleep(10)
      inFlight--
      if (n % 2 === 0) throw new Error('odd one out')
      return n
    },
    () => -1
  )
  check('limit still holds when workers throw', peak <= 3, `peak was ${peak}`)
  check('every slot is filled', out.length === 12, `got ${out.length}`)
  check(
    'failures land in the right slots',
    out.every((v, i) => (i % 2 === 0 ? v === -1 : v === i)),
    JSON.stringify(out)
  )
}

// ── 5. Degenerate inputs must not hang or throw ──────────────────────────
// A limit of 0 spawning zero runners would deadlock forever — inside a cron
// that means burning the whole 300s maxDuration for nothing.
{
  console.log('\nedge cases')
  const empty = await mapWithConcurrency([], 5, async () => 'x', () => 'e')
  check('empty input returns empty array', Array.isArray(empty) && empty.length === 0)

  const overLimit = await mapWithConcurrency([1, 2], 99, async (n) => n * 2, () => -1)
  check(
    'limit larger than input works',
    JSON.stringify(overLimit) === JSON.stringify([2, 4]),
    JSON.stringify(overLimit)
  )

  const zeroLimit = await Promise.race([
    mapWithConcurrency([1, 2, 3], 0, async (n) => n, () => -1),
    sleep(2000).then(() => 'TIMED_OUT' as const),
  ])
  check(
    'limit of 0 clamps to 1 instead of hanging',
    JSON.stringify(zeroLimit) === JSON.stringify([1, 2, 3]),
    String(zeroLimit)
  )
}

// ── 6. The actual point: concurrent is faster than sequential ────────────
{
  console.log('\nwall-clock')
  const started = Date.now()
  await mapWithConcurrency(
    Array.from({ length: 6 }, (_, i) => i),
    6,
    async () => {
      await sleep(100)
      return null
    },
    () => null
  )
  const elapsed = Date.now() - started
  check(
    'six 100ms tasks finish in roughly 100ms, not 600ms',
    elapsed < 300,
    `took ${elapsed}ms`
  )
}

console.log(
  failures === 0
    ? '\nAll checks passed.'
    : `\n${failures} check(s) FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
