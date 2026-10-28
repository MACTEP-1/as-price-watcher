import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import AccountActions from '@/components/AccountActions'

export const revalidate = 0

/**
 * Account page: who you're signed in as, sign out, delete the account.
 * Also the web link Google Play's data-safety form asks for ("where users
 * can request account deletion without the app") — signed-out visitors
 * are sent to /login and come back here after signing in.
 */
export default async function AccountPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account')

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Account</h1>
        <AccountActions email={user.email ?? ''} />
      </main>
    </>
  )
}
