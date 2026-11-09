import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import KeysBoard from '@/components/kluce/KeysBoard'
import { canKeys, overdue } from '@/lib/keys-core'
import { keysSettings, keysUnits, keysPersons, keysDays, ymdBa } from '@/lib/keys-server'
import '../kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče', manifest: '/kluce.webmanifest', appleWebApp: { capable: true, title: 'Kľúče', statusBarStyle: 'black-translucent' } }

/** Kiosk na iPade v miestnosti s kľúčmi: bez hlavičky appky, veľké prvky, obnova každých 45 s, bez zhasínania. Zariadenie je prihlásené raz. */
export default async function KeysKioskPage() {
  const { s, user, me, blocked } = await getViewer()
  if (!user) redirect('/login?next=/kluce/kiosk')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) return <main className="kl-kiosk"><section className="card"><h2>Tento účet nemá prístup ku kľúčom.</h2></section></main>
  const [st, units, persons] = await Promise.all([keysSettings(s), keysUnits(s), keysPersons()])
  const today = ymdBa(0)
  const days = await keysDays(units, [today, ymdBa(1)])
  return (
    <main className="kl-kiosk">
      <header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Kľúče</span></header>
      <KeysBoard units={units} rows={st.rows} persons={persons} days={days} today={today} overdue={overdue(units, st.overdueHours)} overdueHours={st.overdueHours} kiosk />
    </main>
  )
}
