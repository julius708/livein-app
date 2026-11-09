import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import KeysNav from '@/components/kluce/Nav'
import KeysAdmin from '@/components/kluce/Admin'
import { canKeys } from '@/lib/keys-core'
import { keysSettings, keysUnits } from '@/lib/keys-server'
import '../kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče · správa' }

export default async function KeysAdminPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) redirect('/kluce')
  const [st, units] = await Promise.all([keysSettings(s), keysUnits(s)])
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="kluce" hideFooter>
      <div className="kl-page">
        <div className="kl-head"><div><h1>🗝️ Kľúče · správa</h1><p className="hint">Pozície na stene, počet sád na byt, lišty a náprava stavu. Zmeny sa prejavia hneď na tabuli aj v kiosku.</p></div><KeysNav active="admin" isAdmin={isAdmin} /></div>
        <KeysAdmin units={units} rows={st.rows} overdueHours={st.overdueHours} isAdmin={isAdmin} />
      </div>
    </Shell>
  )
}
