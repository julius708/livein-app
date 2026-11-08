import { notFound } from 'next/navigation'
import { guideByCode } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
import GuideView from '@/components/guide/GuideView'
import '../guide.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sprievodca bytom · LIVE-IN', robots: { index: false, follow: false } }

/** Trvalý odkaz určuje byt. Vo verejnom HTML nie sú heslá, kódy ani údaje hostí; Wi-Fi sa vydáva až po overení (POST). */
export default async function GuidePage({ params }) {
  const { code } = await params
  if (!isCode(code)) notFound()
  const data = await guideByCode(code)
  if (!data) notFound()
  return <GuideView code={code} data={data} />
}
