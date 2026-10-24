import { sb } from '@/lib/supabase'
import LoginForm from '@/components/LoginForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prihlásenie' }

export default async function Login({ searchParams }) {
  const sp = await searchParams
  const s = await sb()
  const { data: opts } = await s.rpc('login_options')
  const google = !!(opts && opts.google)
  return <LoginForm google={google} err={sp && sp.err ? String(sp.err) : ''} />
}
