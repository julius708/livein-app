import { notFound } from 'next/navigation'
import { cache } from 'react'
import { guideByCode } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
import ReviewView from '@/components/guide/ReviewView'
import '../../guide.css'
export const dynamic = 'force-dynamic'
const load = cache(async (code) => (isCode(code) ? guideByCode(code) : null))
export async function generateMetadata({ params }) { const { code } = await params; const d = await load(code); if (!d) notFound(); return { title: 'Hodnotenie · LIVE-IN', robots: { index: false, follow: false } } }

export default async function ReviewPage({ params }) {
  const { code } = await params
  const data = await load(code)
  if (!data) notFound()
  return <ReviewView code={code} name={data.unit.name} address={data.card.address || data.unit.address} gbpUrl={/^https:\/\//.test(data.unit.gbp_url || '') ? data.unit.gbp_url : ''} />
}
