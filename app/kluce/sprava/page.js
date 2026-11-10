import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import KeysClock from '@/components/kluce/Clock'
import KeysAdmin from '@/components/kluce/Admin'
import { canKeys } from '@/lib/keys-core'
import { keysSettings, keysUnits } from '@/lib/keys-server'
import '../kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče · nastavenia' }

/** Nastavenia kľúčov (ozubené koliesko z kiosku): pridať kľúč, pozícia, počet sád, poznámka, vyradiť; admin navyše lišty a nápravu stavu. */
export default async function KeysAdminPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/kluce/sprava')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) redirect('/kluce')
  const [st, units] = await Promise.all([keysSettings(s), keysUnits(s)])
  return (
    <main className="kl-kiosk">
      <header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Nastavenia kľúčov</span><KeysClock /><span className="kl-sp" /><nav className="kl-tabs" aria-label="Kľúče"><a href="/kluce" className="">Kľúče</a><a href="/kluce/sprava" className="on">Nastavenia</a><a href="/kluce/historia" className="">História</a></nav></header>
      <KeysAdmin units={units} rows={st.rows} overdueHours={st.overdueHours} persons={st.persons} isAdmin={isAdmin} />
    </main>
  )
}
