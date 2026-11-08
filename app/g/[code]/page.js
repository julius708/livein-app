import { notFound } from 'next/navigation'
import { cache } from 'react'
import { guideByCode } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
import GuideView from '@/components/guide/GuideView'
import '../guide.css'
export const dynamic = 'force-dynamic'
const load = cache(async (code) => (isCode(code) ? guideByCode(code) : null))
/** Metadáta sa riešia pred streamovaním: neznámy kód dá skutočný stav 404. */
export async function generateMetadata({ params }) { const { code } = await params; const d = await load(code); if (!d) notFound(); return { title: `${d.unit.name || 'Sprievodca bytom'} · LIVE-IN`, robots: { index: false, follow: false } } }

/** Trvalý odkaz určuje byt. Vo verejnom HTML nie sú heslá, kódy ani údaje hostí; Wi-Fi sa vydáva až po overení (POST). */
export default async function GuidePage({ params }) {
  const { code } = await params
  const data = await load(code)
  if (!data) notFound()
  return <GuideView code={code} data={data} />
}
