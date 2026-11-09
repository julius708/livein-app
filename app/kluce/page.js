import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import KeysNav from '@/components/kluce/Nav'
import KeysBoard from '@/components/kluce/KeysBoard'
import { canKeys, overdue } from '@/lib/keys-core'
import { keysSettings, keysUnits, keysPersons, keysDays, ymdBa } from '@/lib/keys-server'
import './kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče' }

export default async function KeysPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) return <Shell me={me} user={user} isAdmin={isAdmin} active="kluce" hideFooter><section className="card"><h2>Kľúče sú pre prevádzku, upratovanie a zákaznícky servis</h2><p>Ak ich potrebuješ, napíš Júliusovi.</p></section></Shell>
  const [st, units, persons] = await Promise.all([keysSettings(s), keysUnits(s), keysPersons()])
  const today = ymdBa(0)
  const days = await keysDays(units, [today, ymdBa(1)])
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="kluce" hideFooter>
      <div className="kl-page">
        <section className="li-page-intro kl-intro"><div><span className="li-eyebrow">Prevádzka</span><h1>Kľúče</h1><p>Stena s kľúčmi v appke: číslo pozície zľava doprava po lištách. Zelená je na háčiku, červená vonku. Zoznam podľa tašiek berie z Práčovne.</p></div><KeysNav active="board" isAdmin={isAdmin} /></section>
        <KeysBoard units={units} rows={st.rows} persons={persons} days={days} today={today} overdue={overdue(units, st.overdueHours)} overdueHours={st.overdueHours} />
      </div>
    </Shell>
  )
}
