import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getViewer } from '@/lib/auth'
import { ROLES, GROUPS, modulesFor } from '@/lib/modules'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import MyDay, { MyDaySkeleton } from '@/components/MyDay'
import HomeBody, { HomeBodySkeleton } from '@/components/HomeBody'
import HomeGroups from '@/components/HomeGroups'
import OfficeCountdown from '@/components/OfficeCountdown'
import { todayBA } from '@/lib/maintenance'
import { PLAN_KEY } from '@/lib/plan-2027'
import { moduleUrls } from '@/lib/home-data'
import './home.css'
import './plan/plan.css'

const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3FzChznIQ3gbpo8z6ko8CWTOlI0/'
const PHOTOS = ['86d44ae0-5ce9-4592-86c2-125434ad65f2', 'dd100b9a-0df9-40f1-96eb-26273edb8406', '6bfbc387-be9a-4408-9841-15efe37eaa51', '56dae00b-ff59-477e-bb7f-8f406fee3ad6']

export const dynamic = 'force-dynamic'

function greeting(d) {
  const h = d.getHours()
  if (h < 4) return 'Dobrý večer'
  if (h < 10) return 'Dobré ráno'
  if (h < 18) return 'Dobrý deň'
  return 'Dobrý večer'
}

export default async function Home({ searchParams }) {
  const sp = await searchParams
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />

  const today = todayBA()
  // na vykreslenie vrchu stránky stačí adresy modulov a či si už človek prečítal plán; zvyšok sa načíta popri tom (Suspense)
  const [urls, { data: planRead }] = await Promise.all([
    moduleUrls(s),
    s.from('plan_reads').select('user_email').eq('plan_key', PLAN_KEY).ilike('user_email', user.email).maybeSingle(),
  ])
  const first = (me.name || '').split(' ')[0] || 'tím'
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }))
  const dateLabel = now.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })
  const tiles = modulesFor(me.roles).map((m) => ({ ...m, url: m.href || urls[m.id] || null }))
  const ready = tiles.filter((t) => t.url)
  const soon = tiles.filter((t) => !t.url)
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="home">
     <div className="home">
      {sp && sp.heslo === 'ok' && <div className="msg ok" style={{ marginTop: 16 }}>Heslo je uložené. Odteraz sa prihlasuješ novým heslom.</div>}
      <section className="hero2 has-cd">
        <div className="slides" aria-hidden="true">
          {PHOTOS.map((id, i) => <img key={id} src={`${CDN}${id}.jpg`} alt="" loading={i === 0 ? 'eager' : 'lazy'} />)}
        </div>
        <div className="shade" aria-hidden="true" />
        <div className="dot" aria-hidden="true" />
        <div className="in">
          <div className="kick">{dateLabel}</div>
          <h1>{greeting(now)}, <em>{first}</em></h1>
          <p>Ďakujeme, že každý deň robíte LIVE-IN lepším. Hostia sa vracajú, lebo sa o nich staráte vy.</p>
          <div className="chips">
            {(me.roles || []).map((r) => <span className="chip" key={r}>{ROLES[r] || r}</span>)}
            {me.scope_city && <span className="chip o">📍 {me.scope_city}</span>}
          </div>
        </div>
        <OfficeCountdown />
      </section>

      <Suspense fallback={<MyDaySkeleton />}>
        <MyDay s={s} user={user} isAdmin={isAdmin} roles={me.roles || []} today={today} />
      </Suspense>

      {!planRead && (
        <section className="plan-cta" aria-label="Nový marketingový plán">
          <span className="ic" aria-hidden="true">🚀</span>
          <div><b>Nový marketingový plán 2027: Cesta k najväčším na Slovensku</b><p>Kam ideme, čo robíme ako prvé a podľa čoho poznáme, že vyhrávame. Prečítaj si ho a potvrď, že máš prečítané.</p></div>
          <a className="btn" href="/plan">Prečítať plán →</a>
        </section>
      )}
      {tiles.length > 0 && <HomeGroups groups={GROUPS.map((g) => ({ ...g, tiles: ready.filter((t) => t.group === g.id), soon: soon.filter((t) => t.group === g.id) }))} />}

      <Suspense fallback={<HomeBodySkeleton />}>
        <HomeBody s={s} user={user} isAdmin={isAdmin} today={today} dateLabel={dateLabel} urls={urls} />
      </Suspense>
     </div>
    </Shell>
  )
}
