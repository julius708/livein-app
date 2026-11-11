import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import PropertyList from '@/components/investicie/PropertyList'
import AddProperty from '@/components/investicie/AddProperty'
import DemoPanel from '@/components/investicie/DemoPanel'
import { canInv } from '@/lib/inv-core'
import { propertyList } from '@/lib/inv-data'
import './investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Investičné nehnuteľnosti' }

export default async function InvestPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/investicie')
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) return <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" hideFooter><section className="card"><h2>Investície sú pre obchodný tím</h2><p>Ak ich potrebuješ, napíš Júliusovi.</p></section></Shell>
  const d = await propertyList(s)
  const hasDemo = d.props.some((p) => p.created_by === 'demo')
  const ws = d.ready ? ((await s.from('inv_sources').select('enabled').eq('key', 'web-search').maybeSingle()).data || null) : null
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv">
        <div className="iv-head"><div><h1>Investičné nehnuteľnosti</h1><p className="iv-sub">Naša databáza ponúk: agent ich hľadá a aktualizuje, kalkulačka LIVE-IN ich vyhodnotí a systém ich páruje s dopytmi klientov.</p></div>{d.ready && <AddProperty />}</div>
        <IvNav active="nehnutelnosti" isAdmin={isAdmin} />
        {d.ready && (isAdmin || !d.props.length) && <DemoPanel isAdmin={isAdmin} hasDemo={hasDemo} webSearch={!!(ws && ws.enabled)} />}
        <PropertyList props={d.props} calcs={d.calcs} counts={d.counts} serverNow={Date.now()} ready={d.ready} />
      </div>
    </Shell>
  )
}
