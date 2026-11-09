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
  if (!canKeys(me)) return <main className="kl-kiosk"><header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Kľúče</span><span className="kl-sp" /><a className="kl-gear" href="/kluce/sprava" aria-label="Nastavenia kľúčov" title="Nastavenia: pridať kľúč, pozícia, počet sád, vyradiť"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a></header><section className="card"><h2>Kľúče sú pre prevádzku, upratovanie a zákaznícky servis</h2><p>Ak ich potrebuješ, napíš Júliusovi.</p></section></main>
  const [st, units] = await Promise.all([keysSettings(s), keysUnits(s)])
  const persons = await keysPersons(st.persons)
  const today = ymdBa(0)
  const days = await keysDays(units, [today, ymdBa(1)])
  return (
    <main className="kl-kiosk">
      <header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">Kľúče</span><span className="kl-sp" /><a className="kl-gear" href="/kluce/sprava" aria-label="Nastavenia kľúčov" title="Nastavenia: pridať kľúč, pozícia, počet sád, vyradiť"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a></header>
      <KeysBoard units={units} rows={st.rows} persons={persons} days={days} today={today} overdue={overdue(units, st.overdueHours)} overdueHours={st.overdueHours} kiosk isAdmin={isAdmin} />
    </main>
  )
}
