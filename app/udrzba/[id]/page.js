import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import CaseDetail from '@/components/udrzba/CaseDetail'
import { canMaint } from '@/lib/maint'
import { maintSettings } from '@/lib/maint-data'
import '../udrzba.css'

export const dynamic = 'force-dynamic'
export async function generateMetadata() { return { title: 'Prípad · Údržba' } }

export default async function CasePage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canMaint(me)) redirect('/udrzba')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [{ data: c }, { data: quotes }, { data: requests }, { data: approvals }, { data: orders }, { data: calls }, { data: work }, { data: events }, { data: vendors }, settings] = await Promise.all([
    s.from('maint_cases').select('*, incident:maint_incidents(title)').eq('id', id).maybeSingle(),
    s.from('maint_quotes').select('*, vendor:maint_vendors(name)').eq('case_id', id).order('created_at', { ascending: false }),
    s.from('maint_requests').select('id,vendor_id,status,channel,is_backup,expires_at,sent_at,answered_at, vendor:maint_vendors(name)').eq('case_id', id).order('created_at'),
    s.from('maint_approvals').select('id,quote_id,quote_version,quote_total,recipient_email,status,sent_at,delivered_at,decided_at,decision_note,reminder_count,created_at').eq('case_id', id).order('created_at', { ascending: false }),
    s.from('maint_orders').select('*').eq('case_id', id).neq('status', 'cancelled').limit(1),
    s.from('maint_calls').select('id,provider,status,attempts,result,scheduled_at,started_at,ended_at').eq('case_id', id).order('created_at', { ascending: false }),
    s.from('maint_work_log').select('*').eq('case_id', id).order('created_at'),
    s.from('maint_events').select('id,type,payload,actor,created_at').eq('case_id', id).order('id', { ascending: false }).limit(200),
    s.from('maint_vendors').select('id,name,professions,locality,callout_fee,is_primary,backup_of,email,active').eq('active', true).order('name'),
    maintSettings(s),
  ])
  if (!c) notFound()
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter>
      <CaseDetail c={c} quotes={quotes || []} requests={requests || []} approvals={approvals || []} order={orders && orders[0]} calls={calls || []} work={work || []} events={events || []} vendors={vendors || []} settings={settings} me={{ email: user.email.toLowerCase(), isAdmin }} />
    </Shell>
  )
}
