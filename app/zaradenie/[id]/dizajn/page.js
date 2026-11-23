import Link from 'next/link'
import { notFound } from 'next/navigation'
import OnbShell from '@/components/onb/OnbShell'
import DesignBoard from '@/components/onb/DesignBoard'
import { requireOnboarding, TYPES } from '@/lib/onb-viewer'
import { hfConfigured } from '@/lib/onb-higgsfield'
import { CREDITS_PER_IMAGE } from '@/lib/onb-design'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const BUCKET = 'onboarding'

export default async function DesignPage({ params }) {
  const { id } = await params
  const { s, me, can } = await requireOnboarding()
  if (!can) return <OnbShell me={me}><p className="msg err" style={{ marginTop: 20 }}>Zaradenie bytov je pre roly admin, operations a onboarding.</p></OnbShell>
  const [{ data: u }, { data: rooms, error }, { data: items }] = await Promise.all([s.rpc('onb_unit_get', { p_id: id }), s.rpc('onb_rooms', { p_unit_id: id }), s.rpc('onb_items', { p_unit_id: id })])
  if (!u || !u.id) notFound()
  // podpísané odkazy na fotky a návrhy (súkromné úložisko)
  const paths = []
  for (const r of rooms || []) { paths.push(r.photo_path); for (const d of r.designs) if (d.image_path) paths.push(d.image_path) }
  const urls = {}
  if (paths.length) { const { data } = await s.storage.from(BUCKET).createSignedUrls(paths, 1800); for (const x of data || []) if (x.signedUrl && x.path) urls[x.path] = x.signedUrl }
  const list = (rooms || []).map((r) => ({ ...r, photo_url: urls[r.photo_path] || null, designs: r.designs.map((d) => ({ ...d, url: d.image_path ? urls[d.image_path] || d.result_url : d.result_url })) }))
  const chosen = list.filter((r) => r.designs.some((d) => d.chosen)).length
  const pct = list.length ? Math.round((chosen / list.length) * 100) : 0
  const pending = list.some((r) => r.designs.some((d) => d.status === 'queued' || d.status === 'in_progress' || (d.status === 'done' && !d.image_path && d.result_url)))
  const isAdmin = (me.roles || []).includes('admin')
  return (
    <OnbShell me={me} active="home" intro={{ eyebrow: `${u.city || ''} · ${TYPES[u.unit_type]}`, title: `Dizajn: ${u.address}`, text: `Nafoť miestnosti, vyber štýl, appka pripraví dva návrhy. Vybrané: ${chosen}/${list.length} miestností (${pct} %).`, aside: <Link className="li-shortcut" href={`/zaradenie/${u.id}`}>← Checklist bytu</Link> }}>
      {error && <p className="msg err">{error.message}</p>}
      {!hfConfigured() && <p className="msg err">Higgsfield nie je pripojený.</p>}
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <DesignBoard unit={u} rooms={list} pending={pending} isAdmin={isAdmin} creditsPerImage={CREDITS_PER_IMAGE} items={items || []} />
    </OnbShell>
  )
}
