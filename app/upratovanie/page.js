import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { clContext, managerData } from '@/lib/cl-server'
import { todayBa, isYmd } from '@/lib/cl-core'
import PlanTab from '@/components/upratovanie/PlanTab'
import TeamTab from '@/components/upratovanie/TeamTab'
import ReviewTab from '@/components/upratovanie/ReviewTab'
import PayTab from '@/components/upratovanie/PayTab'
import FlatsTab from '@/components/upratovanie/FlatsTab'
import SettingsTab from '@/components/upratovanie/SettingsTab'
import Board from '@/components/upratovanie/Board'
import './upratovanie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Upratovanie' }

const TABS = [['plan', 'Plán'], ['team', 'Tím'], ['review', 'Kontrola'], ['board', 'Nástenka'], ['flats', 'Byty'], ['pay', 'Náklady'], ['settings', 'Nastavenia']]

export default async function UpratovaniePage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { user, me, isAdmin, blocked, s } = await getViewer()
  if (!user) redirect('/login?next=/upratovanie')
  if (blocked) return <NoAccess email={user.email} />
  const v = { user, me, isAdmin, s }
  const c = await clContext(v)
  if (!c.isManager && c.isCleaner) redirect('/uprat')
  if (!c.isManager) {
    return (
      <Shell me={me} user={user} isAdmin={isAdmin} active="upratovanie" hideFooter>
        <section className="card"><h2>Upratovanie je pre manažérku upratovania</h2><p>Ak ho potrebuješ, napíš Júliusovi. Ak si upratovačka, požiadaj o prístup cez prihlášku alebo manažérku.</p></section>
      </Shell>
    )
  }
  const today = todayBa()
  const date = isYmd(sp.d) ? sp.d : today
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : 'plan'
  const data = await managerData(s, { date, today })
  const demo = !!data.demo
  const Body = { plan: PlanTab, team: TeamTab, review: ReviewTab, pay: PayTab, flats: FlatsTab, settings: SettingsTab }[tab]
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="upratovanie" hideFooter>
      <div className="up">
        <header className="up-head">
          <div><h1>Upratovanie</h1><p>Plán, tím a kontrola upratovania. Byty a hostia sa preberajú z Práčovne.</p></div>
          <a className="btn o" href="/uprat">Pohľad upratovačky</a>
        </header>
        {demo && <p className="up-banner" role="status">Ukážkový režim: databáza upratovania ešte nie je spustená, vidíš vymyslené údaje a zmeny sa neukladajú.</p>}
        {data.errors && data.errors.length > 0 && <p className="up-msg err" role="alert">Niektoré údaje sa nepodarilo načítať: {data.errors[0]}</p>}
        <nav className="up-tabs" aria-label="Sekcie upratovania">
          {TABS.map(([k, l]) => <a key={k} href={`?tab=${k}${sp.d ? '&d=' + sp.d : ''}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{l}{k === 'team' && data.applications.length ? <i>{data.applications.length}</i> : null}</a>)}
        </nav>
        {tab === 'board' ? <Board posts={data.posts} isManager demo={demo} /> : <Body data={data} today={today} date={date} demo={demo} />}
      </div>
    </Shell>
  )
}
