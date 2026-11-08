import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import Content from '@/components/guide/admin/Content'
import { canGuide } from '@/lib/guide/core'
import '../sprievodca.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Obsah · Sprievodca' }
export default async function ContentPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canGuide(me)) redirect('/sprievodca')
  const [{ data: rules }, { data: tips }, { data: events }, { data: units }] = await Promise.all([s.from('guide_rules').select('*').order('sort'), s.from('guide_tips').select('*').order('city').order('sort'), s.from('guide_events').select('*').order('starts_at', { ascending: false }).limit(200), s.from('guide_units').select('city')])
  const cities = [...new Set((units || []).map((u) => String(u.city || '').split(/[\s-]/)[0]).filter(Boolean))].sort()
  return <Shell me={me} user={user} isAdmin={isAdmin} active="sprievodca" hideFooter><div className="sp"><div className="sp-head"><div><a href="/sprievodca" className="hint">← Jednotky</a><h1>Pravidlá, tipy a podujatia</h1><p className="hint">Spoločné pravidlá raz; výnimka sa nastaví pri byte. Tipy a podujatia podľa mesta; skončené podujatia sa skryjú samy.</p></div></div><Content rules={rules || []} tips={tips || []} events={events || []} cities={cities} /></div></Shell>
}
