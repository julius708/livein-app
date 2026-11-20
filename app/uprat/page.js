import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { clContext, cleanerData } from '@/lib/cl-server'
import { todayBa } from '@/lib/cl-core'
import { demoData } from '@/lib/cl-demo'
import Cleaner from '@/components/upratovanie/Cleaner'
import '../upratovanie/upratovanie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Moje upratovanie', manifest: '/uprat.webmanifest', appleWebApp: { capable: true, title: 'Upratovanie', statusBarStyle: 'black-translucent' } }

export default async function UpratPage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { user, me, isAdmin, blocked, s } = await getViewer()
  if (!user) redirect('/login?next=/uprat')
  if (blocked) return <NoAccess email={user.email} />
  const c = await clContext({ user, me, isAdmin, s })
  const today = todayBa()
  if (c.demo) {
    // ukážka pre admina, kým databáza nie je pripravená: pohľad prvej ukážkovej upratovačky
    if (!isAdmin) return <Shell me={me} user={user} isAdmin={isAdmin} active="uprat" hideFooter><section className="card"><h2>Upratovanie sa čoskoro spustí</h2><p>Keď bude pripravené, uvidíš tu svoj plán.</p></section></Shell>
    const d = demoData(today)
    const email = 'ukazka-b@ukazka.invalid'
    const tasks = d.tasks.filter((t) => t.cleaner_email === email)
    return (
      <Shell me={me} user={user} isAdmin={isAdmin} active="uprat" hideFooter>
        <div className="up"><p className="up-banner" role="status">Ukážkový režim: vidíš vymyslené údaje, zmeny sa neukladajú.</p>
          <Cleaner demo today={today} open={sp.u || null} me={d.staff[2]} tasks={tasks} flats={d.flats} entry={d.entry} items={[]} photos={[]} posts={d.posts} settings={d.settings} /></div>
      </Shell>
    )
  }
  if (!c.isCleaner) {
    if (c.isManager) redirect('/upratovanie')
    return (
      <Shell me={me} user={user} isAdmin={isAdmin} active="uprat" hideFooter>
        <section className="card"><h2>Nie si v tíme upratovania</h2><p>Ak chceš upratovať pre LIVE-IN, vyplň <a href="/uprat/prihlaska">prihlášku</a>. Ak už máš schválenú prihlášku a prístup nefunguje, napíš manažérke upratovania.</p></section>
      </Shell>
    )
  }
  const d = await cleanerData(s, c.staff.email, { today })
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="uprat" hideFooter>
      <div className="up">
        <Cleaner today={today} open={sp.u || null} me={d.me || c.staff} tasks={d.tasks} flats={d.flats} entry={d.entry} contacts={d.contacts} pushKey={process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || ''} items={d.items} photos={d.photos} posts={d.posts} settings={d.settings} />
      </div>
    </Shell>
  )
}
