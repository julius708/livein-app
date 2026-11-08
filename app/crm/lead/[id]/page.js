import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import LeadDetail from '@/components/crm/LeadDetail'
import '../../crm.css'
import '../../../ekonomika/ekonomika.css'

export const dynamic = 'force-dynamic'
export async function generateMetadata() { return { title: 'Lead · CRM' } }

export default async function LeadPage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!(me.roles || []).includes('crm')) redirect('/crm')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [{ data: lead }, { data: events }, { data: people }, { data: tasks }] = await Promise.all([
    s.from('leads').select('*').eq('id', id).maybeSingle(),
    s.from('lead_events').select('id,at,type,payload,user_name').eq('lead_id', id).order('at', { ascending: false }).limit(200),
    s.from('app_users').select('email,name').eq('active', true).contains('roles', ['crm']).order('name'),
    s.from('lead_tasks').select('id,kind,title,due_at,status,asana_gid,payload,done_at').eq('lead_id', id).order('status').order('due_at', { ascending: true, nullsFirst: false }).order('created_at'),
  ])
  if (!lead) notFound()
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="crm" guruApp="crm" hideFooter>
      <LeadDetail lead={lead} events={events || []} tasks={tasks || []} people={(people || []).filter((p) => !p.email.startsWith('crm-bot'))} me={{ email: user.email.toLowerCase(), name: me.name || '' }} serverNow={Date.now()} />
    </Shell>
  )
}
