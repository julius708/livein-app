import { Suspense } from 'react'
import PinnedNoteForm from '@/components/PinnedNoteForm'
import FactTicker from '@/components/FactTicker'
import CountUp from '@/components/CountUp'
import TodayBoard from '@/components/TodayBoard'
import NotesBoard from '@/components/NotesBoard'
import Fold from '@/components/Fold'
import { PLAN_FACTS } from '@/lib/plan-2027'
import { homeFacts, homeWork, homeDash, homeNums, todayOverview, boardNotes, myMentions, teamRows } from '@/lib/home-data'

/** Spodná časť domova (briefing, nástenka, portfólio, čísla). Načítava sa samostatne, aby sa vrch stránky ukázal hneď. */
export function HomeBodySkeleton() {
  return <div aria-busy="true" aria-label="Načítavam prehľad"><div className="skel" style={{ height: 220, marginTop: 18, borderRadius: 24 }} /><div className="skel" style={{ height: 160, marginTop: 14, borderRadius: 24 }} /></div>
}

export default async function HomeBody({ s, user, isAdmin, today, dateLabel, urls }) {
  const since = new Date(Date.parse(today) - 45 * 864e5).toISOString().slice(0, 10)
  const [ov, hf, hd, hw, notes, nums, myMent, team0] = await Promise.all([
    todayOverview(s), homeFacts(s), homeDash(s), homeWork(s), boardNotes(s, since), homeNums(s), myMentions(s, user.email), teamRows(s),
  ])
  const mentionIds = (myMent || []).map((m) => m.note_id)
  const unseen = (myMent || []).filter((m) => !m.seen_at).map((m) => m.note_id)
  const team = (team0 || []).filter((t) => t.email && t.email.toLowerCase() !== user.email.toLowerCase())
  const facts = (hf && hf.facts) || {}
  const note = hf && hf.note && hf.note.text ? hf.note.text : ''
  // živé čísla z rezervácií Guesty (obnova každú hodinu); ručné číslo v nastaveniach má prednosť
  const manualGuests = Number(facts.guests_total) || 0
  const live = nums && typeof nums === 'object' ? nums : null
  const guestsTotal = manualGuests || (live ? Number(live.guests_since_2025) || 0 : (hf ? Number(hf.guests_logged) || 0 : 0))
  const guestsPlus = manualGuests ? '+' : ''
  const guestsLabel = manualGuests ? 'hostí sme doteraz ubytovali' : live ? 'hostí sme ubytovali od 1. 1. 2025' : 'hostí evidovaných v systéme od augusta 2026'
  const pctChange = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
  const staysGrowth = live ? pctChange(Number(live.stays_ytd), Number(live.stays_ytd_prev)) : null
  const nightsGrowth = live ? pctChange(Number(live.nights_ytd), Number(live.nights_ytd_prev)) : null
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
  if (facts.goal_2027) tick.push({ icon: '🚀', text: `Marketingový plán 2027: zo 137 bytov na ${facts.end_2026 || '160 až 170'} do konca roka 2026 a na ~${facts.goal_2027} na konci roka 2027, ${facts.pace_month || 15} nových mesačne.` })
  if (goal) tick.push({ icon: '🎯', text: `Náš cieľ: ${goal}+ nehnuteľností${facts.goal_year ? ` do roku ${facts.goal_year}` : ''}.` })
  tick.push(...PLAN_FACTS.slice(1))
  tick.push({ icon: '💚', text: 'Win-win: majitelia majú pokoj, hostia krásny pobyt, my prácu, ktorá nás baví.' })
  const wk = (hd && hd.week) || []
  const wmax = Math.max(1, ...wk.map((x) => Math.max(x.arr, x.dep)))
  const pracUrl = urls.pracovna || null
  return (
    <>
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
          <NotesBoard notes={notes} today={today} mentionIds={mentionIds} unseen={unseen} team={team} />
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
            {live && Number(live.stays_ytd) > 0 ? <div><div className="big"><CountUp value={Number(live.stays_ytd)} /></div><div className="lab">pobytov tento rok{staysGrowth != null ? ` · ${staysGrowth >= 0 ? '+' : ''}${staysGrowth} % oproti vlaňajšku` : ''}</div></div> : null}
            {live && Number(live.nights_ytd) > 0 ? <div><div className="big"><CountUp value={Number(live.nights_ytd)} /></div><div className="lab">obsadených nocí tento rok{nightsGrowth != null ? ` · ${nightsGrowth >= 0 ? '+' : ''}${nightsGrowth} %` : ''}</div></div> : null}
            {live && Number(live.guests_in_house) > 0 ? <div><div className="big o"><CountUp value={Number(live.guests_in_house)} /></div><div className="lab">hostí je práve u nás</div></div> : null}
            {startApts ? <div><div className="big"><CountUp value={startApts} /></div><div className="lab">nehnuteľností {facts.start_label || 'na začiatku'}</div></div> : null}
            {goal ? <div><div className="big"><CountUp value={goal} suffix="+" /></div><div className="lab">náš cieľ{facts.goal_year ? ` do roku ${facts.goal_year}` : ''}</div></div> : null}
          </div>
          {goal ? (
            <div className="goal">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${pct}%` }} /></div>
              <div className="cap"><span>{growth ? `+${growth} % oproti ${facts.start_label || 'začiatku'}` : 'Rastieme'}</span><span>{facts.goal_2027 ? `míľnik 2027: ${facts.goal_2027} · ` : ''}{hf.listings} / {goal}</span></div>
            </div>
          ) : null}
          <p className="winwin">Robíme <b>win-win</b>: majitelia majú o nehnuteľnosť postarané, hostia krásny pobyt a my prácu, ktorá nás baví. 💚</p>
        </section>
        </Fold>
      )}

    </>
  )
}
