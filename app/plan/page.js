import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import PlanPage from '@/components/PlanPage'
import { PLAN_KEY } from '@/lib/plan-2027'
import './plan.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Marketingový plán 2027' }

export default async function Plan() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const [{ data: reads }, { count }] = await Promise.all([
    s.from('plan_reads').select('user_email,user_name,read_at').eq('plan_key', PLAN_KEY).order('read_at'),
    isAdmin ? s.from('app_users').select('email', { count: 'exact', head: true }).eq('active', true) : Promise.resolve({ count: 0 }),
  ])
  const mine = (reads || []).find((r) => r.user_email.toLowerCase() === user.email.toLowerCase())
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="plan" hideFooter>
      <PlanPage read={!!mine} readers={isAdmin ? reads || [] : []} total={count || 0} isAdmin={isAdmin} first={(me.name || '').split(' ')[0]} />
    </Shell>
  )
}
