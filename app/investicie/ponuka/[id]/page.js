import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import OfferView from '@/components/investicie/OfferView'
import { canInv } from '@/lib/inv-core'
import { offerNotices } from '@/lib/inv-offer'
import '../../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Návrh ponuky · Investície' }

export default async function OfferPage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect(`/login?next=/investicie/ponuka/${id}`)
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const offer = (await s.from('inv_offers').select('*').eq('id', id).maybeSingle()).data
  if (!offer) notFound()
  const inquiry = (await s.from('inv_inquiries').select('id,label,lead_id').eq('id', offer.inquiry_id).maybeSingle()).data
  const lead = inquiry ? (await s.from('leads').select('id,name').eq('id', inquiry.lead_id).maybeSingle()).data : null
  const pids = Object.keys(offer.calc_snapshot || {})
  const props = pids.length ? ((await s.from('inv_properties').select('id,price,status,calc_id').in('id', pids)).data || []) : []
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv"><IvNav active="dopyty" isAdmin={isAdmin} /><OfferView offer={offer} notices={offerNotices(offer, Object.fromEntries(props.map((p) => [p.id, p])))} inquiry={inquiry || { id: offer.inquiry_id }} lead={lead} /></div>
    </Shell>
  )
}
