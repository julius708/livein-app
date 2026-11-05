import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import CrmApp from '@/components/crm/CrmApp'
import './crm.css'
import '../ekonomika/ekonomika.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM' }

export default async function CrmPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const can = (me.roles || []).includes('crm')
  if (!can) return <Shell me={me} user={user} isAdmin={isAdmin} active="crm" hideFooter><section className="card eko-locked"><h2>CRM je pre obchodný tím</h2><p>Leady a kontakty spravujú Zuzana, Patrik a Július. Ak ich potrebuješ, napíš Júliusovi.</p></section></Shell>
  const [{ data: leads }, { data: notifs }, { data: people }] = await Promise.all([
    s.from('leads').select('id,name,phone,email,city,city_group,source,kind,stage,priority,received_at,due_at,alarm_hours,assigned_to,first_contact_at,contacted_by,lost_reason,notes,property_address,hubspot_contact_id,asana_task_gid,email_optout,updated_at').order('received_at', { ascending: false }).limit(4000),
    s.from('notifications').select('id,lead_id,kind,title,body,url,created_at,read_at').ilike('user_email', user.email).order('created_at', { ascending: false }).limit(30),
    s.from('app_users').select('email,name').eq('active', true).contains('roles', ['crm']).order('name'),
  ])
  const team = (people || []).filter((p) => !p.email.startsWith('crm-bot'))
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="crm" guruApp="crm" hideFooter>
      <Suspense fallback={null}><CrmApp initialLeads={leads || []} me={{ email: user.email.toLowerCase(), name: me.name || '', isAdmin }} people={team} notifications={notifs || []} pushPublicKey={process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || ''} serverNow={Date.now()} /></Suspense>
    </Shell>
  )
}
