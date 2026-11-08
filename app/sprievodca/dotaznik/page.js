import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import Survey from '@/components/guide/admin/Survey'
import { canGuide } from '@/lib/guide/core'
import { surveySettings } from '@/lib/guide/server'
import '../sprievodca.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dotazník hostí · Sprievodca' }
export default async function SurveyAdminPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canGuide(me)) redirect('/sprievodca')
  const [{ data: rows }, settings] = await Promise.all([s.from('guide_surveys').select('id,listing_id,city,lang,answers,created_at').order('created_at', { ascending: false }).limit(5000), surveySettings(s)])
  return <Shell me={me} user={user} isAdmin={isAdmin} active="sprievodca" hideFooter><div className="sp"><div className="sp-head"><div><a href="/sprievodca" className="hint">← Jednotky</a><h1>Dotazník hostí: profil zákazníkov</h1><p className="hint">Odkiaľ, s kým, prečo, na ako dlho, ako nás našli, či sa vrátia, čo je dôležité, vek, odporúčanie. Nepovinné, v 11 jazykoch, s darčekom po vyplnení.</p></div></div><Survey rows={rows || []} settings={settings} isAdmin={isAdmin} /></div></Shell>
}
