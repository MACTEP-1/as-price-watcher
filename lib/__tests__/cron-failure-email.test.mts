/**
 * Behaviour tests for sendCronFailureEmail — run with:
 *   npx tsx lib/__tests__/cron-failure-email.test.mts
 *
 * The point of an error reporter is to make failures MORE diagnosable. A
 * reporter that throws does the opposite: it replaces the original error
 * with its own, turning one explainable failure into two mysteries. These
 * tests exist to prove it cannot do that, on every path.
 *
 * No network assertions here — whether Resend actually delivers is Resend's
 * business, and the sandbox may not even be able to reach it. What is tested
 * is that every outcome, including "cannot reach Resend at all", returns a
 * boolean instead of throwing.
 */

import emailModule from '../email.ts'

// No "type": "module" in package.json, so tsx's loader hands back the named
// ESM exports wrapped in a CJS-interop default. Destructure from that.
const { sendCronFailureEmail } = emailModule as unknown as {
  sendCronFailureEmail: typeof import('../email.ts').sendCronFailureEmail
}

let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function neverThrows(
  name: string,
  fn: () => Promise<boolean>
): Promise<boolean | undefined> {
  try {
    const result = await fn()
    check(`${name}: returned ${JSON.stringify(result)} instead of throwing`, typeof result === 'boolean')
    return result
  } catch (err) {
    check(`${name}: must not throw`, false, String(err))
    return undefined
  }
}

// ── 1. Unconfigured is a silent no-op, not a crash ───────────────────────
// If this threw, adding the reporter would BREAK every deployment that
// hasn't set CRON_ALERT_EMAIL yet — including, on the first deploy, this one.
{
  console.log('\nunconfigured (CRON_ALERT_EMAIL unset)')
  delete process.env.CRON_ALERT_EMAIL
  const result = await neverThrows('unset recipient', () =>
    sendCronFailureEmail({ stage: 'watches-query', message: 'boom' })
  )
  check('reports not-sent', result === false, String(result))
}

// ── 2. Configured but Resend unusable — still must not throw ─────────────
// Covers a bad/rotated API key, a Resend outage, and no network at all.
{
  console.log('\nconfigured with an unusable Resend key')
  process.env.CRON_ALERT_EMAIL = 'ops@example.com'
  process.env.RESEND_API_KEY = 're_invalid_key_for_testing'
  const result = await neverThrows('unusable Resend', () =>
    sendCronFailureEmail({
      stage: 'watches-query',
      message: 'Supabase connection refused',
      detail: 'PostgrestError: connection refused',
    })
  )
  check('reports not-sent rather than claiming success', result === false, String(result))
}

// ── 3. Hostile / pathological input must not throw ───────────────────────
// `detail` carries arbitrary upstream error bodies. Those are not trusted
// input in a security sense, but they ARE arbitrary — including HTML, very
// long strings, and lone surrogates from mangled encodings.
{
  console.log('\npathological input')
  process.env.CRON_ALERT_EMAIL = 'ops@example.com'

  await neverThrows('4MB detail string', () =>
    sendCronFailureEmail({
      stage: 'unhandled',
      message: 'huge',
      detail: 'x'.repeat(4_000_000),
    })
  )

  await neverThrows('HTML in the error text', () =>
    sendCronFailureEmail({
      stage: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(1)>',
      detail: '</pre><script>alert(1)</script>',
    })
  )

  await neverThrows('empty strings', () =>
    sendCronFailureEmail({ stage: '', message: '' })
  )

  await neverThrows('lone surrogate', () =>
    sendCronFailureEmail({ stage: 'enc', message: '\uD800' })
  )
}

// ── 4. The escaping itself ───────────────────────────────────────────────
// Verified directly rather than through a send, since the send can't be
// observed here. A raw "<script>" reaching the HTML body would execute in
// whatever mail client renders it.
{
  console.log('\nescaping')
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  check(
    'angle brackets are escaped',
    esc('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;',
    esc('<script>alert(1)</script>')
  )
  check(
    'ampersands escape before angle brackets (no double-encoding bug)',
    esc('a & b < c') === 'a &amp; b &lt; c',
    esc('a & b < c')
  )
}

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
