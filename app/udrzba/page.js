import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UdrzbaNav from '@/components/udrzba/Nav'
import CaseList from '@/components/udrzba/CaseList'
import NewCaseForm from '@/components/udrzba/NewCaseForm'
import { canMaint } from '@/lib/maint'
import { maintFlats, maintSettings } from '@/lib/maint-data'
import './udrzba.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Údržba' }


export default async function UdrzbaPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canMaint(me)) return <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter><section className="card"><h2>Údržba je pre prevádzku a zákaznícky servis</h2><p>Ak ju potrebuješ, napíš Júliusovi.</p></section></Shell>
  const [{ data: cases }, flats, settings] = await Promise.all([
    s.from('maint_cases').select('id,ref,listing_id,listing_name,category,symptoms,severity,status,due_at,created_at,created_by_name').order('created_at', { ascending: false }).limit(500),
    maintFlats(s), maintSettings(s),
  ])
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter>
      <div className="ud">
        <UdrzbaNav active="cases" pilot={settings.pilot} />
        <div className="ud-grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)' }}>
          <CaseList cases={cases || []} now={Date.now()} />
          <NewCaseForm flats={flats} />
        </div>
      </div>
    </Shell>
  )
}
