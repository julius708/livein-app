import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import PropertyDetail from '@/components/investicie/PropertyDetail'
import CalcView from '@/components/investicie/CalcView'
import { canInv } from '@/lib/inv-core'
import { propertyDetail } from '@/lib/inv-data'
import '../../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nehnuteľnosť · Investície' }

export default async function PropertyPage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect(`/login?next=/investicie/n/${id}`)
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const d = await propertyDetail(s, id)
  if (!d) notFound()
  if (d.p.merged_into) redirect(`/investicie/n/${d.p.merged_into}`)
  const calcNode = <CalcView calc={d.calc && d.calc.result} thresholds={(d.settings.calc || {}).thresholds} version={d.calc && d.calc.version} created={d.calc && d.calc.created_at} />
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv"><IvNav active="nehnutelnosti" isAdmin={isAdmin} /><PropertyDetail d={d} calcNode={calcNode} isAdmin={isAdmin} /></div>
    </Shell>
  )
}
