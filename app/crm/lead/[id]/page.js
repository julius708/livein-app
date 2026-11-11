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
  // Investičné dopyty pri kontakte; pred nasadením migrácie (chýbajúca tabuľka) sa sekcia jednoducho nezobrazí
  const ir = await s.from('inv_inquiries').select('id,label,status,cities,budget_total,budget_kind,equity,loan_planned,price_cap,last_confirmed_at').eq('lead_id', id).order('created_at', { ascending: false })
  let invest = null
  if (ir && !ir.error) {
    const ids = (ir.data || []).map((q) => q.id)
    const mr = ids.length ? ((await s.from('inv_matches').select('inquiry_id').in('inquiry_id', ids).eq('category', 'match').neq('decision', 'rejected')).data || []) : []
    const matchCounts = {}
    for (const m of mr) matchCounts[m.inquiry_id] = (matchCounts[m.inquiry_id] || 0) + 1
    invest = { inquiries: ir.data || [], matchCounts }
  }
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="crm" guruApp="crm" hideFooter>
      <LeadDetail lead={lead} events={events || []} tasks={tasks || []} people={(people || []).filter((p) => !p.email.startsWith('crm-bot'))} me={{ email: user.email.toLowerCase(), name: me.name || '' }} serverNow={Date.now()} invest={invest} />
    </Shell>
  )
}
