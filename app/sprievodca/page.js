import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UnitsList from '@/components/guide/admin/UnitsList'
import { canGuide } from '@/lib/guide/core'
import { settings, baseUrl } from '@/lib/guide/server'
import './sprievodca.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sprievodca bytom' }

export default async function GuideAdminPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canGuide(me)) return <Shell me={me} user={user} isAdmin={isAdmin} active="sprievodca" hideFooter><section className="card"><h2>Sprievodca bytom je pre prevádzku a zákaznícky servis</h2></section></Shell>
  const [{ data: units }, { data: listings }, { data: issues }, st, base] = await Promise.all([
    s.from('guide_units').select('listing_id,public_code,name,address,city,status,review_reason').order('name'),
    s.from('listings').select('guesty_id,name,title,city').eq('active', true).order('name').limit(2000),
    s.from('guide_label_issues').select('id,listing_id,template_version,issued_at').order('issued_at', { ascending: false }),
    settings(s), baseUrl(s),
  ])
  const byL = {}; for (const i of issues || []) if (!byL[i.listing_id]) byL[i.listing_id] = i
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="sprievodca" hideFooter>
      <div className="sp">
        <div className="sp-head"><div><h1>📱 Sprievodca bytom a QR nálepky</h1><p className="hint">Trvalý kód bytu → sprievodca (Wi-Fi po overení, adresa, pravidlá, tipy) a spätná väzba. Štítok 150 × 105 mm sa vydáva automaticky, keď sú všetky podmienky splnené.</p></div><nav className="row"><a className="btn line" href="/sprievodca/obsah">Pravidlá, tipy, podujatia</a><a className="btn line" href="/sprievodca/dotaznik">Dotazník hostí</a></nav></div>
        <UnitsList units={(units || []).map((u) => ({ ...u, issue: byL[u.listing_id] || null }))} listings={listings || []} settings={st} isAdmin={isAdmin} baseUrl={base} />
      </div>
    </Shell>
  )
}
