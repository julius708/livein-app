import { notFound } from 'next/navigation'
import { guideByCode } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
import ReviewView from '@/components/guide/ReviewView'
import '../../guide.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Hodnotenie · LIVE-IN', robots: { index: false, follow: false } }

export default async function ReviewPage({ params }) {
  const { code } = await params
  if (!isCode(code)) notFound()
  const data = await guideByCode(code)
  if (!data) notFound()
  return <ReviewView code={code} name={data.unit.name} address={data.card.address || data.unit.address} gbpUrl={/^https:\/\//.test(data.unit.gbp_url || '') ? data.unit.gbp_url : ''} />
}
