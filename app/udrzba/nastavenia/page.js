import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UdrzbaNav from '@/components/udrzba/Nav'
import Settings from '@/components/udrzba/Settings'
import { canMaint } from '@/lib/maint'
import { maintFlats, maintSettings } from '@/lib/maint-data'
import '../udrzba.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nastavenia · Údržba' }
export default async function SettingsPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canMaint(me)) redirect('/udrzba')
  const [flats, { data: rows }, settings] = await Promise.all([maintFlats(s), s.from('maint_listing_settings').select('*').order('listing_id'), maintSettings(s)])
  return <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter><div className="ud"><UdrzbaNav active="settings" pilot={settings.pilot} /><Settings flats={flats} rows={rows || []} settings={settings} isAdmin={isAdmin} /></div></Shell>
}
