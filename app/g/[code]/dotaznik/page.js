import { notFound } from 'next/navigation'
import { cache } from 'react'
import { guideByCode, surveySettings } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
import SurveyView from '@/components/guide/SurveyView'
import '../../guide.css'
export const dynamic = 'force-dynamic'
const load = cache(async (code) => (isCode(code) ? guideByCode(code) : null))
export async function generateMetadata({ params }) { const { code } = await params; const d = await load(code); if (!d) notFound(); return { title: 'LIVE-IN', robots: { index: false, follow: false } } }

/** Nepovinný dotazník hosťa. Do klienta ide len verejná časť nastavenia darčeka (kód sa zobrazí až po odoslaní). */
export default async function SurveyPage({ params }) {
  const { code } = await params
  const data = await load(code)
  if (!data) notFound()
  const sv = await surveySettings()
  if (sv.enabled === false) notFound()
  return <SurveyView code={code} name={data.unit.name} gift={{ enabled: !!(sv.gift && sv.gift.enabled) }} />
}
