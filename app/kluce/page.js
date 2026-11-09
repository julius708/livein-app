import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import KeysBoard from '@/components/kluce/KeysBoard'
import { canKeys, overdue } from '@/lib/keys-core'
import { keysSettings, keysUnits, keysPersons, keysDays, ymdBa } from '@/lib/keys-server'
import './kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče', manifest: '/kluce.webmanifest', appleWebApp: { capable: true, title: 'Kľúče', statusBarStyle: 'black-translucent' } }

/**
 * Kľúče = kiosk: žiadna hlavička appky ani Guru, hore len malé logo (späť na domov), vľavo dlaždice kľúčov, vpravo úzka lišta.
 * Rovnaká obrazovka na iPade v miestnosti aj v prehliadači. Obnova každých 45 s, obrazovka nezhasína.
 */
export default async function KeysPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/kluce')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) return <main className="kl-kiosk"><header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Kľúče</span></header><section className="card"><h2>Kľúče sú pre prevádzku, upratovanie a zákaznícky servis</h2><p>Ak ich potrebuješ, napíš Júliusovi.</p></section></main>
  const [st, units, persons] = await Promise.all([keysSettings(s), keysUnits(s), keysPersons()])
  const today = ymdBa(0)
  const days = await keysDays(units, [today, ymdBa(1)])
  return (
    <main className="kl-kiosk">
      <header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Kľúče</span></header>
      <KeysBoard units={units} rows={st.rows} persons={persons} days={days} today={today} overdue={overdue(units, st.overdueHours)} overdueHours={st.overdueHours} kiosk isAdmin={isAdmin} />
    </main>
  )
}
