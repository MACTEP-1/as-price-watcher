/**
 * Quantifies the open question in status-and-next-steps.md: "is MIN_CHECKS
 * of 5 enough headroom?" — run with:
 *   npx tsx lib/__tests__/alerts-noise.test.mts
 *
 * This does NOT hit production data. The device bridge to pull real
 * price_checks rows for SEA→YYZ / SEA→FCO was down when this was written
 * (see status doc), so instead of guessing at real volatility this sweeps a
 * RANGE of plausible daily cash-price noise levels (2%–12% per-check swing,
 * no underlying trend) and measures how often evaluateAlerts() — the real
 * function, not a reimplementation — fires anyway, purely from noise, under
 * the current guards (MIN_CHECKS=5, NEW_LOW_MARGIN=2%, MIN_WINDOW=3) versus
 * two candidate tightenings. It also checks a genuine decline still gets
 * caught in reasonable time.
 *
 * Read the false-positive-rate table as "if real fares jitter about this
 * much day to day, here's how often you'd get a noise alert" — a bound on
 * the problem, not a measurement of it. Replace with real reconstructed
 * history the next time the device bridge is up.
 *
 * Each settings profile runs in its own subprocess (_alerts-noise-worker.ts)
 * with real env-var isolation — see that file's header for why an in-process
 * "reload the module with different env" approach was tried first and
 * silently gave wrong (identical-across-profiles) results twice over.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { ProfileResult } from './_alerts-noise-lib.mts'

const here = path.dirname(fileURLToPath(import.meta.url))
const workerPath = path.join(here, '_alerts-noise-worker.mts')

const CURRENT = {} // no overrides — real defaults: 5 / 2% / 3
const CANDIDATE_A = {
  ALERT_MIN_CHECKS: '5',
  ALERT_NEW_LOW_MARGIN: '0.02',
  ALERT_MIN_WINDOW: '5',
}
const CANDIDATE_B = {
  ALERT_MIN_CHECKS: '7',
  ALERT_NEW_LOW_MARGIN: '0.03',
  ALERT_MIN_WINDOW: '5',
}

const SETTINGS: Array<[string, Record<string, string>]> = [
  ['current  (5 / 2% / 3)', CURRENT],
  ['cand. A  (5 / 2% / 5)', CANDIDATE_A],
  ['cand. B  (7 / 3% / 5)', CANDIDATE_B],
]

function runProfile(env: Record<string, string>): ProfileResult {
  const proc = spawnSync('npx', ['tsx', workerPath], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (proc.status !== 0) {
    throw new Error(
      `worker failed (exit ${proc.status}): ${proc.stderr || proc.stdout}`
    )
  }
  return JSON.parse(proc.stdout) as ProfileResult
}

console.log('\nRunning three settings profiles as separate subprocesses...')
const results = SETTINGS.map(([name, env]) => {
  process.stderr.write(`  ${name}...\n`)
  return runProfile(env)
})

// Sanity check the isolation actually worked this time: candidate B requires
// 7 checks before anything can fire, so it must never fire in the 5-check
// "close call" series below. If this ever prints FAIL, don't trust anything
// else this script printed — go back to treating profiles as unverified.
const bIndex = SETTINGS.findIndex(([n]) => n.startsWith('cand. B'))
const sanityOk = results[bIndex].closeCallFired === null
console.log(
  `Isolation sanity check (cand. B must not fire on a 5-check series): ${
    sanityOk ? 'PASS' : 'FAIL — results below are not trustworthy'
  }`
)

console.log(
  `\nFalse-positive rate: fraction of 3000 flat-trend (no real drop) 21-day ` +
    `series that fire at least one alert anyway.\n`
)
console.log(
  `${'noise σ/day'.padEnd(14)}${SETTINGS.map(([n]) => n.padEnd(24)).join('')}`
)
const noiseLevels = Object.keys(results[0].falsePositive)
for (const sigma of noiseLevels) {
  const row = results
    .map((r) => {
      const fp = r.falsePositive[sigma]
      const rate = (fp.rate * 100).toFixed(1) + '%'
      const avgDay = fp.avgDay !== null ? fp.avgDay.toFixed(1) : '—'
      return `${rate} (avg day ${avgDay})`.padEnd(24)
    })
    .join('')
  console.log(`${(Number(sigma) * 100).toFixed(0) + '%'}`.padEnd(14) + row)
}

console.log(`\nDetection delay against a genuine 20% decline over 14 days:\n`)
SETTINGS.forEach(([name], i) => {
  const r = results[i]
  console.log(
    `  ${name.padEnd(24)} ${
      r.declineNeverFires
        ? 'never fired'
        : `fired on day ${r.declineFiredAt!.index} (${r.declineFiredAt!.type})`
    }`
  )
})

console.log(`\nWorked case — check #5, a 6% dip after four flat-ish days:\n`)
SETTINGS.forEach(([name], i) => {
  const r = results[i]
  console.log(
    `  ${name.padEnd(24)} ${
      r.closeCallFired ? `FIRED (${r.closeCallFired.type})` : 'no alert'
    }`
  )
})

console.log(
  `\nSlow, genuine ~1.5%/day decline (19% over 14 days) — fires under current settings?\n`
)
{
  const r = results[0]
  if (r.slowDeclineFires.length === 0) {
    console.log('  never fired across all 14 checks')
  } else {
    for (const f of r.slowDeclineFires) {
      console.log(`  check ${f.check}  $${f.price}  FIRED (${f.type})`)
    }
  }
}

console.log(
  `\nSteady 14-day linear decline, swept by total drop — does it EVER fire, ` +
    `and at what total-drop threshold does "never" flip to "yes"?\n`
)
console.log(
  `${'total drop'.padEnd(14)}${SETTINGS.map(([n]) => n.padEnd(24)).join('')}`
)
results[0].declineSweep.forEach((_, di) => {
  const pct = results[0].declineSweep[di].totalDropPct
  const row = results
    .map((r) => {
      const f = r.declineSweep[di].fired
      return (f ? `fires check ${f.index}` : 'NEVER').padEnd(24)
    })
    .join('')
  console.log(`${(pct * 100).toFixed(0) + '%'}`.padEnd(14) + row)
})
console.log(
  `\n  Reading this: a smooth decline needs roughly its NEW_LOW_MARGIN per ` +
    `day just to keep tripping the new_low check (the check only ever ` +
    `compares against the immediately preceding, already-lower price) — so ` +
    `candidate B's tighter 3% margin, aimed at cutting noise false-positives, ` +
    `makes this blind spot WORSE, not better. A slow bleed under that daily ` +
    `rate is invisible at any cumulative size under every profile tested here.`
)

console.log(
  `\nRatchet check (current settings) — a ~1.35%/day, 40-day compounding ` +
    `decline, evaluated as a stateful cron would (lastReported only updates ` +
    `when an alert actually fires):\n`
)
{
  const rt = results[0].ratchetTest
  if (rt.fires.length === 0) {
    console.log('  FAIL — never fired at all (unexpected)')
  } else {
    for (const f of rt.fires) {
      console.log(
        `  day ${String(f.day).padStart(2)}  $${f.price}  ${f.type}  (anchor was $${f.anchor})`
      )
    }
  }
  console.log(
    `\n  Only cumulative_drop ever fired (new_low/drop_10pct correctly silent ` +
      `throughout): ${rt.onlyCumulativeDropFired ? 'PASS' : 'FAIL'}`
  )
  console.log(
    `  Each later fire is a fresh ~10% drop from the PREVIOUS alert, not from ` +
      `watch-start every time (proves the anchor actually moves): ${
        rt.eachFireIsAFreshDropFromThePreviousAlert ? 'PASS' : 'FAIL'
      }`
  )
}

console.log('')
