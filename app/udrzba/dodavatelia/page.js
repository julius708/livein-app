import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UdrzbaNav from '@/components/udrzba/Nav'
import Vendors from '@/components/udrzba/Vendors'
import { canMaint } from '@/lib/maint'
import { maintSettings } from '@/lib/maint-data'
import '../udrzba.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dodávatelia · Údržba' }
export default async function VendorsPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canMaint(me)) redirect('/udrzba')
  const [{ data: vendors }, settings] = await Promise.all([s.from('maint_vendors').select('*').order('name'), maintSettings(s)])
  return <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter><div className="ud"><UdrzbaNav active="vendors" pilot={settings.pilot} /><Vendors vendors={vendors || []} /></div></Shell>
}
