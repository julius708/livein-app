import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import AgentAdmin from '@/components/investicie/AgentAdmin'
import { canInv } from '@/lib/inv-core'
import { loadSettings } from '@/lib/inv-store'
import { agentStatus } from '@/lib/inv-agent'
import '../investicie.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 120   // „Spustiť teraz“ beží v tejto požiadavke
export const metadata = { title: 'Agent · Investície' }

export default async function AgentPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/investicie/agent')
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  if (!isAdmin) return <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" hideFooter><div className="iv"><IvNav active="nehnutelnosti" /><section className="card"><h2>Agent a nastavenia spravuje admin</h2></section></div></Shell>
  const [rr, sr, settings] = [await s.from('inv_runs').select('id,mode,trigger,status,attempt,started_at,finished_at,heartbeat_at,stats,error').order('started_at', { ascending: false }).limit(20), await s.from('inv_sources').select('*').order('created_at'), await loadSettings(s)]
  const runs = (rr && !rr.error && rr.data) || [], sources = (sr && !sr.error && sr.data) || []
  const status = agentStatus({ settings, runs, sources, now: Date.now() })
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv"><div className="iv-head"><div><h1>Agent a nastavenia</h1><p className="iv-sub">Vyhľadávanie a aktualizácia ponúk na pozadí, zdroje, kritériá výhodnosti.</p></div></div><IvNav active="agent" isAdmin={isAdmin} /><AgentAdmin status={JSON.parse(JSON.stringify(status))} runs={runs} sources={sources} settings={settings} /></div>
    </Shell>
  )
}
