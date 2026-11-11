import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import InquiryDetail from '@/components/investicie/InquiryDetail'
import { canInv } from '@/lib/inv-core'
import { inquiryDetail } from '@/lib/inv-data'
import '../../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dopyt · Investície' }

export default async function InquiryPage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect(`/login?next=/investicie/dopyt/${id}`)
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const d = await inquiryDetail(s, id)
  if (!d) notFound()
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv"><IvNav active="dopyty" isAdmin={isAdmin} /><InquiryDetail d={d} serverNow={Date.now()} /></div>
    </Shell>
  )
}
