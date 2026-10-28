/**
 * Account deletion (lib/account.ts) and the sign-in helpers in
 * lib/format.ts. Run with:
 *   npx tsx lib/__tests__/account.test.mts
 *
 * The deletion runs against a fake service client that models the real
 * PRODUCTION foreign keys (read from pg_constraint 2026-10-28): watches and
 * alerts CASCADE from the auth user; watches → itineraries and
 * price_checks → itineraries are NO ACTION, so deleting a trip that still
 * has a watch or any price history fails.
 * What must hold: everything personal goes, nobody else's data does, and a
 * failure to delete the user removes nothing.
 */

import accountModule from '../account.ts'
import formatModule from '../format.ts'

const { deleteAccount } = accountModule as unknown as {
  deleteAccount: typeof import('../account.ts').deleteAccount
}
const { normaliseSignInCode, safeNextPath } = formatModule as unknown as {
  normaliseSignInCode: typeof import('../format.ts').normaliseSignInCode
  safeNextPath: typeof import('../format.ts').safeNextPath
}

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

type Row = Record<string, string>
interface Db {
  users: string[]
  watches: Row[]
  alerts: Row[]
  itineraries: Row[]
  price_checks: Row[]
}

function seed(): Db {
  return {
    users: ['me', 'other'],
    itineraries: [{ id: 'mine-only' }, { id: 'shared' }, { id: 'mine-removed' }, { id: 'others' }],
    watches: [
      { id: 'w1', user_id: 'me', itinerary_id: 'mine-only' },
      { id: 'w2', user_id: 'me', itinerary_id: 'shared' },
      { id: 'w3', user_id: 'me', itinerary_id: 'mine-removed' }, // status 'removed' — still mine
      { id: 'w4', user_id: 'me', itinerary_id: 'mine-only' }, // duplicate trip id
      { id: 'w5', user_id: 'other', itinerary_id: 'shared' },
      { id: 'w6', user_id: 'other', itinerary_id: 'others' },
    ],
    alerts: [
      { id: 'a1', user_id: 'me', watch_id: 'w1' },
      { id: 'a2', user_id: 'other', watch_id: 'w5' },
    ],
    price_checks: [
      { id: 'p1', itinerary_id: 'mine-only' },
      { id: 'p2', itinerary_id: 'shared' },
      { id: 'p3', itinerary_id: 'mine-removed' },
      { id: 'p4', itinerary_id: 'others' },
    ],
  }
}

function fakeClient(db: Db, opts: { failDeleteUser?: boolean; failCleanup?: boolean } = {}) {
  const calls: string[] = []
  function from(table: keyof Db) {
    let filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'delete' = 'select'
    const run = () => {
      const rows = (db[table] as Row[]).filter((r) => filters.every((f) => f(r)))
      if (mode === 'select') return { data: rows, error: null }
      if (opts.failCleanup && table === 'itineraries') return { data: null, error: { message: 'boom' } }
      // NO ACTION keys: refuse to orphan a watch or a price check.
      if (table === 'itineraries' && rows.some((r) =>
        db.watches.some((w) => w.itinerary_id === r.id) || db.price_checks.some((p) => p.itinerary_id === r.id))) {
        return { data: null, error: { message: 'violates foreign key constraint' } }
      }
      const ids = new Set(rows.map((r) => r.id))
      ;(db[table] as Row[]) = (db[table] as Row[]).filter((r) => !ids.has(r.id))
      return { data: null, error: null }
    }
    const b = {
      select() { mode = 'select'; return b },
      delete() { mode = 'delete'; calls.push(`delete ${table}`); return b },
      eq(col: string, v: string) { filters.push((r) => r[col] === v); return b },
      in(col: string, vs: string[]) { filters.push((r) => vs.includes(r[col])); return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(res, rej)
      },
    }
    return b
  }
  return {
    calls,
    from,
    auth: {
      admin: {
        async deleteUser(id: string) {
          calls.push(`deleteUser ${id}`)
          if (opts.failDeleteUser) return { error: { message: 'auth down' } }
          db.users = db.users.filter((u) => u !== id)
          db.watches = db.watches.filter((w) => w.user_id !== id) // CASCADE
          db.alerts = db.alerts.filter((a) => a.user_id !== id) // CASCADE
          return { error: null }
        },
      },
    },
  }
}

const ids = (rows: Row[]) => rows.map((r) => r.id).sort()

// 1. The normal case.
{
  const db = seed()
  const result = await deleteAccount(fakeClient(db), 'me')
  check('user gone, other user kept', db.users, ['other'])
  check('all my watches gone (incl. removed), others kept', ids(db.watches), ['w5', 'w6'])
  check('my alerts gone, others kept', ids(db.alerts), ['a2'])
  check('trips only I watched deleted; shared + others kept', ids(db.itineraries), ['others', 'shared'])
  check('their price history went with them; shared history kept', ids(db.price_checks), ['p2', 'p4'])
  check('result counts the two orphaned trips', result, { itinerariesDeleted: 2 })
}

// 2. deleteUser fails → nothing at all removed, and it throws.
{
  const db = seed()
  const before = JSON.stringify(db)
  const client = fakeClient(db, { failDeleteUser: true })
  let threw = ''
  try { await deleteAccount(client, 'me') } catch (e) { threw = (e as Error).message }
  check('auth failure throws', threw, 'auth down')
  check('auth failure removes nothing', JSON.stringify(db) === before, true)
  check('auth failure never reaches itinerary cleanup', client.calls.includes('delete itineraries'), false)
}

// 3. Cleanup fails after the user is deleted → reported, not thrown.
{
  const db = seed()
  const result = await deleteAccount(fakeClient(db, { failCleanup: true }), 'me')
  check('cleanup failure: account still deleted', db.users, ['other'])
  check('cleanup failure: personal rows still gone', ids(db.watches), ['w5', 'w6'])
  check('cleanup failure reported', result, { itinerariesDeleted: 0, cleanupError: 'boom' })
}

// 4. A user with no watches.
{
  const db = seed()
  db.users.push('fresh')
  const client = fakeClient(db)
  const result = await deleteAccount(client, 'fresh')
  check('no watches: user deleted', db.users.includes('fresh'), false)
  check('no watches: nothing else touched', [ids(db.watches).length, ids(db.itineraries).length], [6, 4])
  check('no watches: no itinerary delete issued', client.calls, ['deleteUser fresh'])
  check('no watches: result', result, { itinerariesDeleted: 0 })
}

// 5. Every trip is still watched by someone else → no delete issued.
{
  const db = seed()
  db.watches = db.watches.filter((w) => w.user_id !== 'me')
  db.watches.push({ id: 'w7', user_id: 'me', itinerary_id: 'shared' })
  const client = fakeClient(db)
  const result = await deleteAccount(client, 'me')
  check('only shared trips: none deleted', [ids(db.itineraries), result], [['mine-only', 'mine-removed', 'others', 'shared'], { itinerariesDeleted: 0 }])
  check('only shared trips: no itinerary delete issued', client.calls.includes('delete itineraries'), false)
}

// 6. Refuses an empty id rather than deleting "everyone where user_id = ''".
{
  let threw = false
  try { await deleteAccount(fakeClient(seed()), '') } catch { threw = true }
  check('empty user id throws', threw, true)
}

// Sign-in code.
check('code: plain 6 digits', normaliseSignInCode('123456'), '123456')
check('code: spaces and dashes from a paste', normaliseSignInCode(' 123 456 '), '123456')
check('code: 123-456', normaliseSignInCode('123-456'), '123456')
check('code: 8 digits (configurable length)', normaliseSignInCode('12345678'), '12345678')
check('code: too short', normaliseSignInCode('12345'), null)
check('code: too long', normaliseSignInCode('12345678901'), null)
check('code: letters', normaliseSignInCode('12a456'), null)
check('code: empty', normaliseSignInCode(''), null)

// Post-login redirect.
check('next: a path', safeNextPath('/account'), '/account')
check('next: path with query', safeNextPath('/watches/new?origin=SEA'), '/watches/new?origin=SEA')
check('next: missing → dashboard', safeNextPath(null), '/dashboard')
check('next: full URL refused', safeNextPath('https://evil.example/'), '/dashboard')
check('next: protocol-relative refused', safeNextPath('//evil.example/'), '/dashboard')
check('next: backslash trick refused', safeNextPath('/\\evil.example'), '/dashboard')
check('next: relative without slash refused', safeNextPath('dashboard'), '/dashboard')

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
