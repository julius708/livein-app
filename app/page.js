import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { ROLES, modulesFor } from '@/lib/modules'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import CountUp from '@/components/CountUp'
import PinnedNoteForm from '@/components/PinnedNoteForm'
import FactTicker from '@/components/FactTicker'
import TodayBoard from '@/components/TodayBoard'
import MaintenanceBoard from '@/components/MaintenanceBoard'
import NotesBoard from '@/components/NotesBoard'
import Tile from '@/components/Tile'
import Fold from '@/components/Fold'
import { buildMaintenance, todayBA } from '@/lib/maintenance'
import { asanaConfigured, fetchOpenDamageTasks } from '@/lib/asana'
import './home.css'

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
  const since = new Date(Date.parse(today) - 45 * 864e5).toISOString().slice(0, 10)
  const [{ data: cfg }, { data: ov }, { data: hf }, { data: hd }, { data: hw }, { data: noteRows }] = await Promise.all([
    s.from('config').select('value').eq('key', 'module_urls').maybeSingle(),
    s.rpc('today_overview'),
    s.rpc('home_facts'),
    s.rpc('home_dashboard'),
    s.rpc('home_work'),
    // nástenka: oznamy za posledných 45 dní (aj na zajtra), najnovšie hore
    s.from('board_notes').select('id,text,author_name,date,created_at').is('removed_at', null).gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
  ])
  const notes = noteRows || []
  // Údržba: opravy z Asany (Damages Reporting) + ručné opravy + okná, kedy je byt voľný na opravu
  let mnt = { issues: [], flats: [] }
  try {
    const [{ data: md }, { data: iss }, tasks] = await Promise.all([
      s.rpc('maintenance_data'),
      s.from('maintenance_issues').select('id,listing_id,listing_name,text,priority,created_at,created_by_name').eq('status', 'open').order('created_at', { ascending: false }).limit(200),
      fetchOpenDamageTasks(),
    ])
    if (md) mnt = buildMaintenance({ listings: md.listings, reservations: md.reservations, issues: iss || [], tasks: tasks || [], today: md.today || todayBA() })
  } catch {}
  const urls = (cfg && cfg.value) || {}
  const first = (me.name || '').split(' ')[0] || 'tím'
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }))
  const dateLabel = now.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })
  const facts = (hf && hf.facts) || {}
  const note = hf && hf.note && hf.note.text ? hf.note.text : ''
  const manualGuests = Number(facts.guests_total) || 0
  const guestsTotal = manualGuests || (hf ? Number(hf.guests_logged) || 0 : 0)
  const guestsPlus = manualGuests ? '+' : ''
  const guestsLabel = manualGuests ? 'hostí sme doteraz ubytovali' : 'hostí evidovaných v systéme od augusta 2026'
  const startApts = Number(facts.start_apartments || facts.apartments_start) || 0
  const goal = Number(facts.goal) || 0
  const growth = startApts && hf ? Math.round(((hf.listings - startApts) / startApts) * 100) : 0
  const pct = goal && hf ? Math.max(3, Math.min(100, Math.round((hf.listings / goal) * 100))) : 0
  const sk = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c)
  const tick = []
  if (hd) {
    if (hd.month_nights) tick.push({ icon: '🌙', text: `Tento mesiac sme zatiaľ obsadili ${Number(hd.month_nights).toLocaleString('sk-SK')} nocí.` })
    if (hd.avg_stay) tick.push({ icon: '⏱️', text: `Priemerný pobyt hosťa trvá ${String(hd.avg_stay).replace('.', ',')} nocí.` })
    if (hd.longest_now > 30) tick.push({ icon: '🏆', text: `Najdlhší práve prebiehajúci pobyt má ${hd.longest_now} nocí.` })
    const top = (hd.cities || [])[0]
    if (top) tick.push({ icon: '📍', text: `${top.city} je dnes plná: ${top.guests} hostí v ${top.staying} rezerváciách.` })
    if (hd.booking_pct && hd.airbnb_pct) tick.push({ icon: '🔗', text: `Z rezervácií idú ${hd.booking_pct} % cez Booking a ${hd.airbnb_pct} % cez Airbnb.` })
    const peak = (hd.week || []).reduce((m, x) => (x.arr > (m ? m.arr : -1) ? x : m), null)
    if (peak && peak.arr > 0) tick.push({ icon: '🔥', text: `Najrušnejší deň týždňa: ${new Date(peak.day).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' })} s ${peak.arr} príchodmi.` })
  }
  if (hf && startApts && growth > 0) tick.push({ icon: '🌱', text: `Od začiatku roka sme vyrástli o ${growth} % (z ${startApts} na ${hf.listings} nehnuteľností).` })
  if (goal) tick.push({ icon: '🎯', text: `Náš cieľ: ${goal}+ nehnuteľností${facts.goal_year ? ` do roku ${facts.goal_year}` : ''}.` })
  tick.push({ icon: '💚', text: 'Win-win: majitelia majú pokoj, hostia krásny pobyt, my prácu, ktorá nás baví.' })
  const pracUrl = urls.pracovna || null
  const wk = (hd && hd.week) || []
  const wmax = Math.max(1, ...wk.map((x) => Math.max(x.arr, x.dep)))
  const tiles = modulesFor(me.roles).map((m) => ({ ...m, url: m.href || urls[m.id] || null }))
  const ready = tiles.filter((t) => t.url)
  const soon = tiles.filter((t) => !t.url)

  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="home">
     <div className="home">
      {sp && sp.heslo === 'ok' && <div className="msg ok" style={{ marginTop: 16 }}>Heslo je uložené. Odteraz sa prihlasuješ novým heslom.</div>}
      <section className="hero2">
        <div className="slides" aria-hidden="true">
          {PHOTOS.map((id, i) => <img key={id} src={`${CDN}${id}.jpg`} alt="" loading={i === 0 ? 'eager' : 'lazy'} />)}
        </div>
        <div className="shade" aria-hidden="true" />
        <div className="dot" aria-hidden="true" />
        <div className="in">
          <div className="kick">{dateLabel}</div>
          <h1>{greeting(now)}, {first}</h1>
          <p>Ďakujeme, že každý deň robíte LIVE-IN lepším. Hostia sa vracajú, lebo sa o nich staráte vy.</p>
          <div className="chips">
            {(me.roles || []).map((r) => <span className="chip" key={r}>{ROLES[r] || r}</span>)}
            {me.scope_city && <span className="chip o">📍 {me.scope_city}</span>}
          </div>
        </div>
      </section>

      {(note || isAdmin) && (
        <section className={note ? 'pin' : undefined} style={note ? undefined : { marginTop: 12 }}>
          {note && (
            <>
              <div className="pi" aria-hidden="true">📌</div>
              <div style={{ flex: 1 }}>
                <b>Dôležitý odkaz pre tím</b>
                <p>{note}</p>
                {hf.note.at && <small>{new Date(hf.note.at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' })}</small>}
                {isAdmin && <PinnedNoteForm current={note} />}
              </div>
            </>
          )}
          {!note && isAdmin && <PinnedNoteForm current="" />}
        </section>
      )}

      {hf && (
        <section className="brief" aria-label="Dnešný briefing">
          <div className="bt"><h2>Dnešný briefing</h2><span>{dateLabel}</span></div>
          <div className="bgrid">
            <div className="bc">
              <h3>🛬 Rezervácie</h3>
              <div className="bn">
                <div className="hot"><b>{hf.arrivals}</b><span>príchody dnes</span></div>
                <div><b>{hf.departures}</b><span>odchody dnes</span></div>
                <div><b>{hf.guests_in_house}</b><span>hostí v apartmánoch ({hf.staying} rez.)</span></div>
                <div><b>{hf.tomorrow_arrivals}</b><span>príchody zajtra</span></div>
              </div>
              {hd && <p className="bf">Obsadenosť dnes <b>{hd.occupancy ?? 0} %</b> z {hf.listings} nehnuteľností{hw && hw.early_today > 0 ? <> · <b>{hw.early_today}</b> skorých príchodov</> : null}</p>}
            </div>
            {hw && (
              <div className="bc">
                <h3>🧼 Práčovňa</h3>
                <div className="bn">
                  <div className="hot"><b>{hw.today_todo}</b><span>tašiek treba dnes zabaliť</span></div>
                  <div><b>{hw.today_packed}</b><span>už zabalených</span></div>
                  <div><b>{hw.today_same_day}</b><span>s príchodom v ten istý deň</span></div>
                  <div><b>{hw.tomorrow_total}</b><span>tašiek zajtra</span></div>
                </div>
                {pracUrl && <a className="bl" href={pracUrl}>Otvoriť Práčovňu →</a>}
              </div>
            )}
          </div>
          <NotesBoard notes={notes} today={today} />
        </section>
      )}

      {hd && (
        <Fold id="dash" title="Rezervácie a portfólio" hint={`${hd.arrivals_list?.length || 0} príchodov · ${hd.departures_list?.length || 0} odchodov`}>
        <div className="dash">
          <TodayBoard arrivals={hd.arrivals_list || []} departures={hd.departures_list || []} />
          <section className="card pf" aria-label="Portfólio">
            <h2>Čo sa deje v portfóliu</h2>
            <div className="kpis">
              <div><b>{hd.occupancy ?? 0} %</b><span>obsadenosť dnes</span></div>
              <div><b>{hd.next7_arrivals}</b><span>príchodov za 7 dní</span></div>
              <div><b>{String(hd.avg_stay ?? '').replace('.', ',')}</b><span>priemerný pobyt (noci)</span></div>
            </div>
            <h3 className="mh">Príchody a odchody, 7 dní</h3>
            <div className="wk">
              {wk.map((x) => (
                <div className="wd" key={x.day}>
                  <div className="bars"><i className="a" style={{ height: `${Math.max(4, (x.arr / wmax) * 100)}%` }} title={`${x.arr} príchodov`} /><i className="d" style={{ height: `${Math.max(4, (x.dep / wmax) * 100)}%` }} title={`${x.dep} odchodov`} /></div>
                  <small>{new Date(x.day).toLocaleDateString('sk-SK', { weekday: 'short', timeZone: 'UTC' })}</small>
                  <em>{x.arr}/{x.dep}</em>
                </div>
              ))}
            </div>
            <div className="lg"><span><i className="a" /> príchody</span><span><i className="d" /> odchody</span></div>
            <h3 className="mh">Hostia dnes podľa miest</h3>
            <ul className="cl">
              {(hd.cities || []).map((c) => (
                <li key={c.city}><span>{c.city}</span><b>{c.guests} hostí</b><small>{c.staying} rezervácií</small></li>
              ))}
            </ul>
          </section>
        </div>
        </Fold>
      )}
      {mnt.flats.length > 0 && <Fold id="mnt" title="Údržba" hint={`${mnt.issues.length} ${mnt.issues.length === 1 ? 'otvorená oprava' : mnt.issues.length < 5 ? 'otvorené opravy' : 'otvorených opráv'}`}><MaintenanceBoard issues={mnt.issues} flats={mnt.flats} asana={asanaConfigured()} /></Fold>}
      {ov && ov.city && (
        <div className="hint" style={{ marginTop: 8 }}>Tvoje mesto ({ov.city}): {ov.arrivals} príchodov, {ov.departures} odchodov, {ov.staying} ubytovaných.</div>
      )}

      <FactTicker facts={tick} label="Vedeli ste?" />

      {hf && (
        <Fold id="nums" title="LIVE-IN v číslach" hint={`${hf.listings} nehnuteľností`}>
        <section className="nums" aria-label="LIVE-IN v číslach">
          <h2>LIVE-IN v číslach</h2>
          <p className="sub2">Toto všetko sme postavili spolu.</p>
          <div className="ngrid">
            <div><div className="big"><CountUp value={guestsTotal} suffix={guestsPlus} /></div><div className="lab">{guestsLabel}</div></div>
            <div><div className="big o"><CountUp value={hf.listings} /></div><div className="lab">nehnuteľností dnes</div></div>
            {startApts ? <div><div className="big"><CountUp value={startApts} /></div><div className="lab">nehnuteľností {facts.start_label || 'na začiatku'}</div></div> : null}
            {goal ? <div><div className="big"><CountUp value={goal} suffix="+" /></div><div className="lab">náš cieľ{facts.goal_year ? ` do roku ${facts.goal_year}` : ''}</div></div> : null}
          </div>
          {goal ? (
            <div className="goal">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${pct}%` }} /></div>
              <div className="cap"><span>{growth ? `+${growth} % oproti ${facts.start_label || 'začiatku'}` : 'Rastieme'}</span><span>{hf.listings} / {goal}</span></div>
            </div>
          ) : null}
          <p className="winwin">Robíme <b>win-win</b>: majitelia majú o nehnuteľnosť postarané, hostia krásny pobyt a my prácu, ktorá nás baví. 💚</p>
        </section>
        </Fold>
      )}

      <div className="tools">
      {ready.length > 0 && (
        <>
          <div className="sec"><h2>Tvoje nástroje</h2><span>{ready.length}</span></div>
          <div className="tiles">
            {ready.map((m) => <Tile key={m.id} href={m.url} icon={m.icon} title={m.title} desc={m.desc} />)}
          </div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <div className="sec"><h2>Pripravujeme</h2><span>{soon.length}</span></div>
          <div className="tiles">
            {soon.map((m) => (
              <div className="tile soon" key={m.id}>
                <div className="ic" aria-hidden="true">{m.icon}</div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
                <div className="st">Pripravuje sa</div>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
     </div>
    </Shell>
  )
}
