import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UnitEdit from '@/components/guide/admin/UnitEdit'
import { canGuide } from '@/lib/guide/core'
import { completeness } from '@/lib/guide/content'
import { settings, baseUrl } from '@/lib/guide/server'
import '../sprievodca.css'
export const dynamic = 'force-dynamic'
export async function generateMetadata() { return { title: 'Jednotka · Sprievodca' } }

export default async function UnitPage({ params }) {
  const { id } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canGuide(me)) redirect('/sprievodca')
  if (!/^[0-9a-f]{24}$/i.test(id)) notFound()
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const [{ data: unit }, { data: card }, { data: wifi }, { data: issues }, { data: feedback }, st, base] = await Promise.all([
    s.from('guide_units').select('*').eq('listing_id', id).maybeSingle(),
    s.from('guide_cards').select('*').eq('listing_id', id).maybeSingle(),
    s.from('guide_wifi').select('ssid,updated_at').eq('listing_id', id).maybeSingle(),
    s.from('guide_label_issues').select('id,template_version,variant,issued_at,issued_by,notified_at').eq('listing_id', id).order('issued_at', { ascending: false }),
    s.from('guide_feedback').select('id,rating,text,contact,created_at').eq('listing_id', id).order('created_at', { ascending: false }).limit(50),
    settings(s), baseUrl(s),
  ])
  if (!unit) notFound()
  const { data: log } = await s.from('guide_wifi_log').select('outcome').eq('public_code', unit.public_code).gte('at', since)
  // ďalší byt na doplnenie (podľa názvu), aby tím prechádzal zoznam bez vracania sa
  const { data: others } = await s.from('guide_cards').select('listing_id,completeness,approved').lt('completeness', 100).neq('listing_id', id).order('listing_id').limit(400)
  const { data: names } = await s.from('guide_units').select('listing_id,name').order('name')
  const incompl = new Set((others || []).filter((c) => !c.approved).map((c) => c.listing_id))
  const sorted = (names || []).filter((n) => incompl.has(n.listing_id)); const idx = sorted.findIndex((n) => n.name > (unit.name || '')); const next = sorted[idx >= 0 ? idx : 0] || null
  const cp = completeness({ unit, card: card || {}, wifi: !!wifi })
  const stats = {}; for (const l of log || []) stats[l.outcome] = (stats[l.outcome] || 0) + 1
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="sprievodca" hideFooter>
      <UnitEdit unit={unit} card={card || {}} wifi={wifi} issues={issues || []} feedback={feedback || []} stats={stats} baseUrl={base} settings={st} score={cp.score} missing={cp.missing} next={next} />
    </Shell>
  )
}
