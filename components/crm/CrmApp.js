'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/browser'
import { STAGES, OPEN_STAGES, SOURCES, CITY_GROUPS, CORE_CITIES, WEEKS, countdown, stageOf, weekBucket, weekRange, isCoreCity, originLabel, isFreshOrigin } from '@/lib/crm'
import { fmtDay } from '@/lib/fmt'
import { Ring, Pill, ContactButtons, StageBar, stateOf, SCRIPT, fmtDT, fmtD, firstName } from './ui'
import { setStage, logContact, createManualLead, setKind } from '@/app/crm/actions'
import CrmNotifier from './CrmNotifier'

const VIEWS = [['one', 'Jeden naraz', '📱'], ['queue', 'Fronta', '⏱️'], ['board', 'Tabuľa', '🗂️'], ['clients', 'Klienti', '🏠'], ['contacts', 'Kontakty', '👥'], ['overview', 'Prehľad', '📊']]
const WEEK_VIEWS = ['one', 'queue', 'board']
const H = 3600e3
const byUrgency = (now) => (a, b) => {
  const da = a.due_at ? Date.parse(a.due_at) - now : Infinity, db = b.due_at ? Date.parse(b.due_at) - now : Infinity
  if (da !== db) return da - db
  return Date.parse(b.received_at) - Date.parse(a.received_at)
}

export default function CrmApp({ initialLeads, me, people, notifications, pushPublicKey, serverNow }) {
  const sp = useSearchParams(), router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [view, setViewState] = useState(sp.get('v') || '')
  const [now, setNow] = useState(() => serverNow || Date.now())
  const [q, setQ] = useState('')
  const [city, setCity] = useState('all')
  const [source, setSource] = useState('all')
  const [mine, setMine] = useState(false)
  const [week, setWeek] = useState('w0')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, start] = useTransition()
  const liveRef = useRef(null)

  // predvolený pohľad: telefón → Jeden naraz, admin → Tabuľa, inak Fronta
  useEffect(() => { if (!view) setViewState(window.matchMedia('(max-width: 760px)').matches ? 'one' : me.isAdmin ? 'board' : 'queue') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const setView = (v) => { setViewState(v); const u = new URL(window.location.href); u.searchParams.set('v', v); window.history.replaceState(null, '', u); window.scrollTo({ top: 0 }) }
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  // živé zmeny leadov (nový lead zo Zapieru, zmena kolegu)
  useEffect(() => {
    const c = browserClient()
    const ch = c.channel('crm-leads').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p) => {
      const row = p.new && p.new.id ? p.new : null
      if (!row) return
      setLeads((cur) => { const i = cur.findIndex((l) => l.id === row.id); if (i < 0) return [row, ...cur]; const next = cur.slice(); next[i] = { ...next[i], ...row }; return next })
    }).subscribe()
    liveRef.current = ch
    return () => { c.removeChannel(ch) }
  }, [])

  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const matches = (l) => (city === 'all' || l.city_group === city) && (source === 'all' || l.source === source) && (!mine || (l.assigned_to || '').toLowerCase() === me.email) && (!q || fold(l.name + ' ' + l.city + ' ' + l.email + ' ' + l.phone).includes(fold(q)))
  const bucketOf = (l) => weekBucket(l.received_at, now, l.origin)
  // otvorené leady za posledné 4 týždne (bez starých): z nich sa počítajú lehoty a alarmy
  const openAll = useMemo(() => leads.filter((l) => l.kind === 'lead' && OPEN_STAGES.includes(l.stage) && matches(l)).sort(byUrgency(now)), [leads, now, q, city, source, mine]) // eslint-disable-line react-hooks/exhaustive-deps
  const recentOpen = useMemo(() => openAll.filter((l) => bucketOf(l) !== 'old'), [openAll, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => openAll.filter((l) => bucketOf(l) === week), [openAll, week, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const freshAll = useMemo(() => recentOpen.filter((l) => l.stage === 'new' && l.due_at), [recentOpen])
  const fresh = useMemo(() => open.filter((l) => l.stage === 'new' && l.due_at), [open])
  const overdue = useMemo(() => freshAll.filter((l) => Date.parse(l.due_at) < now), [freshAll, now])
  const overdueHere = useMemo(() => overdue.filter((l) => bucketOf(l) === week), [overdue, week, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekCounts = useMemo(() => { const c = {}; for (const w of WEEKS) c[w.id] = 0; for (const l of openAll) c[bucketOf(l)]++; return c }, [openAll, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const clients = useMemo(() => leads.filter((l) => l.kind === 'client' && matches(l)).sort((a, b) => a.name.localeCompare(b.name, 'sk')), [leads, q, city, source, mine]) // eslint-disable-line react-hooks/exhaustive-deps
  const overdueWeek = overdue.length && !overdueHere.length ? bucketOf(overdue[0]) : null

  const patch = (id, p) => setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const doStage = (id, stage, opts) => start(async () => {
    setMsg('')
    const before = leads.find((l) => l.id === id)
    patch(id, { stage, kind: stage === 'client' ? 'client' : 'lead', first_contact_at: before && before.stage === 'new' && stage !== 'new' && !before.first_contact_at ? new Date().toISOString() : before && before.first_contact_at, lost_reason: opts && opts.lost_reason })
    const r = await setStage(id, stage, opts || {})
    if (!r.ok) { setMsg(r.error); if (before) patch(id, before) }
  })
  const doLog = (id, type) => { logContact(id, type).catch(() => {}) }
  const doNotLead = (id) => {
    const l = leads.find((x) => x.id === id)
    const reason = window.prompt(`„${l ? l.name : 'Lead'}“ nie je lead. Prečo? (napr. spam, mimo našich miest, nemá byt, duplicita)`, 'Nerelevantný dopyt')
    if (reason === null) return
    start(async () => { setMsg(''); patch(id, { kind: 'not_lead', lost_reason: reason || 'Nie je lead' }); const r = await setKind(id, 'not_lead', reason); if (!r.ok) { setMsg(r.error); if (l) patch(id, l) } })
  }
  const [showAll, setShowAll] = useState({})
  const more = (key, n) => ({ cap: showAll[key] ? Infinity : n, onMore: () => setShowAll((s) => ({ ...s, [key]: true })) })
  const label = (l) => firstName(l.assigned_to, people)

  return (
    <div className="crm">
      <section className="li-page-intro crm-intro">
        <div>
          <span className="li-eyebrow">CRM · leady a kontakty</span>
          <h1>{overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'lead čaká' : overdue.length < 5 ? 'leady čakajú' : 'leadov čaká'} po lehote.` : freshAll.length ? `${freshAll.length} ${freshAll.length === 1 ? 'nový lead' : freshAll.length < 5 ? 'nové leady' : 'nových leadov'} na zavolanie.` : 'Všetky nové leady sú vybavené.'}</h1>
          <p>Nové leady sú rozdelené po týždňoch. Pracuj na tomto týždni, na každý dopyt odpovedáme do jedného pracovného dňa. Staršie ako mesiac sú v priečinku Staré a nie sú tvoja úloha.</p>
        </div>
        <div className="crm-intro-side">
          <CrmNotifier me={me} initial={notifications} pushPublicKey={pushPublicKey} />
          <button type="button" className="btn o" onClick={() => setAdding(true)}>+ Pridať lead</button>
        </div>
      </section>

      {overdue.length > 0 && WEEK_VIEWS.includes(view) && <div className="crm-banner" role="alert">POZOR: {overdue.length} {overdue.length === 1 ? 'lead' : overdue.length < 5 ? 'leady' : 'leadov'} po lehote. Kontaktuj hneď.{overdueWeek && <button type="button" className="crm-banner-btn" onClick={() => setWeek(overdueWeek)}>Zobraziť ({WEEKS.find((w) => w.id === overdueWeek)?.label.toLowerCase()})</button>}</div>}

      <nav className="crm-tabs" aria-label="Pohľady">{VIEWS.map(([id, l, ic]) => <button key={id} type="button" className={view === id ? 'on' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><span aria-hidden="true">{ic}</span>{l}{id === 'queue' && freshAll.length ? <b>{freshAll.length}</b> : null}{id === 'clients' && clients.length ? <small>{clients.length}</small> : null}</button>)}</nav>

      {WEEK_VIEWS.includes(view) && (
        <div className="crm-weeks" role="tablist" aria-label="Týždeň">
          {WEEKS.map((w) => { const r = weekRange(w.id, now); return <button key={w.id} type="button" role="tab" aria-selected={week === w.id} className={'crm-week' + (week === w.id ? ' on' : '') + (w.id === 'old' ? ' old' : '')} onClick={() => setWeek(w.id)} title={w.id === 'old' ? `prijaté pred ${fmtDay(r.to)}` : `${fmtDay(r.from)} – ${fmtDay(r.to - 1)}`}><span>{w.label}</span><b className={weekCounts[w.id] ? '' : 'zero'}>{weekCounts[w.id]}</b></button> })}
        </div>
      )}
      {WEEK_VIEWS.includes(view) && week === 'old' && <p className="crm-weeknote">Staré leady: prijaté pred viac ako 4 týždňami ({fmtDay(weekRange('old', now).to)} a skôr). Nie sú v aktívnej fronte ani v alarmoch, štatistika ich počíta. Keď niekoho z nich kontaktuješ, zmeň mu štádium ako pri každom inom leade.</p>}

      {view !== 'one' && view !== 'overview' && (
        <div className="crm-filters">
          <input type="search" placeholder="Hľadať meno, mesto, telefón…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={city} onChange={(e) => setCity(e.target.value)}><option value="all">Všetky mestá</option>{CITY_GROUPS.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={source} onChange={(e) => setSource(e.target.value)}><option value="all">Všetky zdroje</option>{SOURCES.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="crm-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> len moje</label>
        </div>
      )}
      {msg && <p className="msg err">{msg}</p>}

      {view === 'one' && <OneAtATime leads={fresh.length ? fresh : open} now={now} onStage={doStage} onLog={doLog} onNotLead={doNotLead} people={people} busy={busy} week={WEEKS.find((w) => w.id === week)} />}
      {view === 'queue' && <Queue leads={open} now={now} onStage={doStage} onLog={doLog} onNotLead={doNotLead} people={people} week={WEEKS.find((w) => w.id === week)} {...more('queue', 12)} />}
      {view === 'board' && <Board leads={leads.filter((l) => matches(l) && l.kind !== 'not_lead' && (l.kind === 'client' ? week === 'w0' && Date.parse(l.updated_at || l.received_at) >= weekRange('w0', now).from : bucketOf(l) === week))} now={now} onStage={doStage} people={people} {...more('board', 10)} />}
      {view === 'clients' && <Clients leads={clients} people={people} onLog={doLog} {...more('clients', 12)} />}
      {view === 'contacts' && <Contacts leads={leads.filter(matches)} people={people} isAdmin={me.isAdmin} {...more('contacts', 15)} onKind={(id, k) => start(async () => { patch(id, { kind: k }); const r = await setKind(id, k); if (!r.ok) setMsg(r.error) })} />}
      {view === 'overview' && <Overview leads={leads} now={now} people={people} />}

      {adding && <AddLead people={people} me={me} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); router.push(`/crm/lead/${id}`) }} />}
    </div>
  )
}

function Origin({ l }) {
  if (!l.origin) return null
  return <span className={'crm-origin' + (isFreshOrigin(l.origin) ? '' : ' bulk')} title={l.origin_detail || ''}>{originLabel(l.origin)}</span>
}
function LeadRow({ l, now, onStage, onLog, onNotLead, people }) {
  const st = stateOf(l, now)
  return (
    <article className={'crm-row ' + st}>
      <Ring lead={l} now={now} />
      <div className="crm-row-main">
        <div className="crm-row-head"><Link href={`/crm/lead/${l.id}`} className="crm-name">{l.name}</Link><Pill lead={l} /><Origin l={l} />{l.priority === 'low' && <span className="crm-low">nižšia priorita</span>}</div>
        <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || 'bez mesta'} · {l.source || 'zdroj neznámy'} · prijatý {fmtDT(l.received_at)} · {firstName(l.assigned_to, people) || 'nepriradený'}{l.notes ? <> · <i>{String(l.notes).slice(0, 90)}{l.notes.length > 90 ? '…' : ''}</i></> : null}</div>
        <div className="crm-row-actions"><StageBar lead={l} onStage={(s, o) => onStage(l.id, s, o)} compact />{onNotLead && l.kind === 'lead' && <button type="button" className="crm-notlead" onClick={() => onNotLead(l.id)} title="Spam, nerelevantný dopyt, duplicita…">✕ Nie je lead</button>}</div>
      </div>
      <ContactButtons lead={l} onLog={(t) => onLog(l.id, t)} />
    </article>
  )
}
function More({ shown, total, onMore, what = 'záznamov' }) {
  if (shown >= total) return null
  return <button type="button" className="crm-more-btn" onClick={onMore}>Zobraziť ďalších {total - shown} {what} ↓</button>
}
function Queue({ leads, now, onStage, onLog, onNotLead, people, week, cap = Infinity, onMore }) {
  if (!leads.length) return <section className="card crm-empty"><h2>{week && week.id === 'old' ? 'V starých nie je nič otvorené' : `${week ? week.label : 'Tento týždeň'}: fronta je prázdna`}</h2><p>Žiadny otvorený lead z tohto obdobia. Nové leady sa tu objavia samy, staršie nájdeš prepnutím týždňa.</p></section>
  const shown = leads.slice(0, cap)
  return <div className="crm-queue">{shown.map((l) => <LeadRow key={l.id} l={l} now={now} onStage={onStage} onLog={onLog} onNotLead={onNotLead} people={people} />)}<More shown={shown.length} total={leads.length} onMore={onMore} what="leadov" /></div>
}
function OneAtATime({ leads, now, onStage, onLog, onNotLead, people, busy, week }) {
  const l = leads[0]
  if (!l) return <section className="card crm-empty crm-phone"><h2>{week && week.id !== 'w0' ? `${week.label}: nič nečaká` : 'Všetko vybavené 🎉'}</h2><p>Žiadny nový lead z tohto obdobia nečaká. Nový sa ukáže hneď, ako príde.</p></section>
  const c = countdown(l.due_at, now), over = c.state === 'over', st = stateOf(l, now)
  return (
    <section className={'card crm-phone ' + st}>
      <div className="crm-phone-top"><span className={'crm-pill s-wait ' + st}>Čaká {leads.length} {leads.length === 1 ? 'lead' : leads.length < 5 ? 'leady' : 'leadov'}</span><Link href={`/crm/lead/${l.id}`} className="eko-link">Detail ↗</Link></div>
      <div className={'crm-timer ' + st} suppressHydrationWarning>{l.due_at ? c.label : '—'}</div>
      <div className="crm-timer-sub">{l.due_at ? (over ? 'po lehote' : 'do konca lehoty') : 'bez lehoty (starší lead)'}</div>
      <h2>{l.name}</h2>
      <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || 'bez mesta'} · {l.source || 'zdroj neznámy'} · {fmtDT(l.received_at)}{l.origin ? <> · <Origin l={l} /></> : null}</div>
      {l.notes && <p className="crm-note">{l.notes}</p>}
      <ContactButtons lead={l} onLog={(t) => onLog(l.id, t)} big />
      <div className="crm-script"><b>Čo povedať:</b> {SCRIPT}</div>
      <div className="crm-two">
        <button type="button" className="btn" disabled={busy} onClick={() => onStage(l.id, 'contacted', { connected: true, note: 'Zavolané' })}>Zavolané → ďalší</button>
        <button type="button" className="btn line" disabled={busy} onClick={() => { onLog(l.id, 'sms'); onStage(l.id, 'contacted', { connected: false, note: 'Nedvíha, poslaná SMS' }) }}>Nedvíha → SMS</button>
      </div>
      <details className="crm-more"><summary>Iné štádium alebo stratený</summary><StageBar lead={l} onStage={(s, o) => onStage(l.id, s, o)} />{onNotLead && <button type="button" className="crm-notlead" style={{ marginTop: 8 }} onClick={() => onNotLead(l.id)}>✕ Nie je lead (spam, nerelevantný)</button>}</details>
    </section>
  )
}
function Board({ leads, now, onStage, people, cap = Infinity, onMore }) {
  const [drag, setDrag] = useState(null)
  const cols = STAGES.map((s) => ({ s, items: leads.filter((l) => l.stage === s.id).sort(byUrgency(now)) }))
  return (
    <div className="crm-board">
      {cols.map(({ s, items }) => (
        <div key={s.id} className={'crm-col s-' + s.id} onDragOver={(e) => { if (s.id !== 'lost') e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (drag && s.id !== 'lost') { onStage(drag, s.id); setDrag(null) } }}>
          <h4>{s.short}<span>{items.length}</span></h4>
          {items.slice(0, cap).map((l) => { const st = stateOf(l, now); return (
            <div key={l.id} className={'crm-kcard ' + st} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}>
              <Link href={`/crm/lead/${l.id}`}><b>{l.name}</b></Link>
              <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || '—'} · {firstName(l.assigned_to, people)}</div>
              {l.stage === 'new' && l.due_at && <div className={'crm-kt ' + st}>{countdown(l.due_at, now).label}</div>}
              {s.id !== 'client' && s.id !== 'lost' && <button type="button" className="crm-next" onClick={() => onStage(l.id, STAGES[STAGES.findIndex((x) => x.id === s.id) + 1].id)}>Ďalej →</button>}
            </div>
          ) })}
          {items.length > 60 && <p className="eko-fine">+ {items.length - 60} ďalších (použi filtre)</p>}
          {s.id === 'lost' && <p className="eko-fine">Stratený sa nastavuje na karte leadu (povinný dôvod).</p>}
                  <More shown={Math.min(items.length, cap)} total={items.length} onMore={onMore} what="kariet" />
        </div>
      ))}
    </div>
  )
}
function Clients({ leads, people, onLog, cap = Infinity, onMore }) {
  if (!leads.length) return <section className="card crm-empty"><h2>Žiadny klient nezodpovedá filtru</h2><p>Klient je kontakt, ktorému už spravujeme byt. Lead sa stane klientom zmenou štádia na „Klient“.</p></section>
  return (
    <div className="crm-queue crm-clients">
      <p className="crm-weeknote">Existujúci klienti ({leads.length}): majitelia, ktorým už spravujeme byt. Nie sú to leady, lehoty sa na nich nevzťahujú.</p>
      {leads.slice(0, cap).map((l) => (
        <article key={l.id} className="crm-row client">
          <div className="crm-avatar" aria-hidden="true">{String(l.name || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</div>
          <div className="crm-row-main">
            <div className="crm-row-head"><Link href={`/crm/lead/${l.id}`} className="crm-name">{l.name}</Link><span className="crm-pill s-client">Klient</span>{l.email_optout && <span className="crm-low">odhlásený z newslettera</span>}</div>
            <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || 'bez mesta'}{l.property_address ? ` · ${l.property_address}` : ''} · klient od {fmtD(l.first_contact_at || l.received_at)}{l.assigned_to ? ` · ${firstName(l.assigned_to, people)}` : ''}</div>
          </div>
          <ContactButtons lead={l} onLog={(t) => onLog(l.id, t)} />
        </article>
      ))}
      <More shown={Math.min(leads.length, cap)} total={leads.length} onMore={onMore} what="klientov" />
    </div>
  )
}
function Contacts({ leads, people, isAdmin, onKind, cap = Infinity, onMore }) {
  const [tab, setTab] = useState('leads')
  const list = leads.filter((l) => (tab === 'clients' ? l.kind === 'client' : tab === 'leads' ? l.kind === 'lead' : l.kind === 'not_lead')).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const counts = { clients: leads.filter((l) => l.kind === 'client').length, leads: leads.filter((l) => l.kind === 'lead').length, not: leads.filter((l) => l.kind === 'not_lead').length }
  return (
    <section className="card crm-contacts">
      <div className="crm-seg" role="tablist"><button type="button" className={tab === 'clients' ? 'on' : ''} onClick={() => setTab('clients')}>Klienti <b>{counts.clients}</b></button><button type="button" className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leady <b>{counts.leads}</b></button>{isAdmin && <button type="button" className={tab === 'not' ? 'on' : ''} onClick={() => setTab('not')}>Nie leady <b>{counts.not}</b></button>}</div>
      <div className="eko-table"><table><thead><tr><th>Meno</th><th>Mesto</th><th>Telefón</th><th>E-mail</th><th>Štádium</th><th>Pôvod</th><th>Komu</th><th>Od</th>{isAdmin && <th></th>}</tr></thead><tbody>
        {list.slice(0, cap).map((l) => <tr key={l.id}><td><Link href={`/crm/lead/${l.id}`} className="crm-name">{l.name}</Link>{l.property_address && <small className="muted"> · {l.property_address}</small>}</td><td>{l.city_group !== 'Iné' ? l.city_group : l.city || '—'}</td><td>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '—'}</td><td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : '—'}{l.email_optout && <small className="crm-low"> · odhlásený</small>}</td><td><Pill lead={l} /></td><td><Origin l={l} /></td><td>{firstName(l.assigned_to, people)}</td><td>{fmtD(l.received_at)}</td>{isAdmin && <td>{l.kind === 'not_lead' ? <button type="button" className="eko-link" onClick={() => onKind(l.id, 'lead')}>je lead</button> : l.kind === 'lead' ? <button type="button" className="eko-link" onClick={() => onKind(l.id, 'not_lead')}>nie lead</button> : null}</td>}</tr>)}
      </tbody></table><More shown={Math.min(list.length, cap)} total={list.length} onMore={onMore} what="kontaktov" />{!list.length && <p className="eko-empty">Nič tu nie je.</p>}</div>
    </section>
  )
}
function Overview({ leads, now, people }) {
  const week = now - 7 * 864e5
  const L = leads.filter((l) => l.kind !== 'not_lead')
  const fresh = L.filter((l) => l.stage === 'new' && l.due_at), over = fresh.filter((l) => Date.parse(l.due_at) < now)
  const contacted = L.filter((l) => l.first_contact_at && l.received_at)
  const avgH = contacted.length ? contacted.reduce((s, l) => s + (Date.parse(l.first_contact_at) - Date.parse(l.received_at)) / H, 0) / contacted.length : null
  const recent = L.filter((l) => Date.parse(l.received_at) >= week)
  // Úspešnosť počítame len z miest, v ktorých operujeme (Bratislava, Košice). Leady z iných miest často ani nekontaktujeme.
  const isClient = (l) => l.kind === 'client' || l.stage === 'client'
  const core = L.filter(isCoreCity)
  const coreClients = core.filter(isClient).length
  const successPct = core.length ? Math.round((coreClients / core.length) * 100) : null
  const byCity = CITY_GROUPS.map((c) => { const g = L.filter((l) => (l.city_group || 'Iné') === c); return { c, n: g.length, client: g.filter(isClient).length, lost: g.filter((l) => l.stage === 'lost').length, contacted: g.filter((l) => l.first_contact_at || isClient(l)).length, core: CORE_CITIES.includes(c) } })
  const bySource = {}
  for (const l of core) { const k = l.source || 'Iné / neznáme'; bySource[k] = bySource[k] || { n: 0, client: 0, lost: 0 }; bySource[k].n++; if (isClient(l)) bySource[k].client++; if (l.stage === 'lost') bySource[k].lost++ }
  const byPerson = {}
  for (const l of L.filter((x) => OPEN_STAGES.includes(x.stage) && x.kind === 'lead')) { const k = firstName(l.assigned_to, people) || '—'; byPerson[k] = (byPerson[k] || 0) + 1 }
  return (
    <div className="crm-overview">
      <section className="eko-kpis four">
        <div className="metric eko-metric primary"><small>Po lehote</small><strong>{over.length}</strong><p>nových leadov s prekročenou lehotou</p></div>
        <div className="metric eko-metric"><small>Čas do prvého kontaktu</small><strong>{avgH == null ? '—' : avgH < 48 ? Math.round(avgH) + ' h' : Math.round(avgH / 24) + ' dní'}</strong><p>priemer z {contacted.length} leadov (cieľ do 24 h)</p></div>
        <div className="metric eko-metric"><small>Nové za 7 dní</small><strong>{recent.length}</strong><p>{recent.filter((l) => l.first_contact_at).length} už kontaktovaných · {L.filter((l) => l.kind === 'client').length} klientov spolu</p></div>
        <div className="metric eko-metric"><small>Úspešnosť v BA a KE</small><strong>{successPct == null ? '—' : successPct + ' %'}</strong><p>{coreClients} {coreClients === 1 ? 'klient' : coreClients < 5 ? 'klienti' : 'klientov'} z {core.length} leadov v Bratislave a Košiciach. Iné mestá sa nepočítajú.</p></div>
      </section>
      <section className="card"><h2>Podľa mesta</h2><div className="eko-table"><table><thead><tr><th>Mesto</th><th>Leadov</th><th>Kontaktovaných</th><th>Klientov</th><th>Stratených</th><th>Úspešnosť</th><th></th></tr></thead><tbody>{byCity.map((r) => <tr key={r.c} className={r.core ? '' : 'crm-dim'}><td><b>{r.c}</b></td><td>{r.n}</td><td>{r.contacted}</td><td>{r.client}</td><td>{r.lost}</td><td>{r.n ? Math.round((r.client / r.n) * 100) + ' %' : '—'}</td><td>{r.core ? <span className="crm-pill s-client">počíta sa</span> : <span className="crm-low">mimo našich miest</span>}</td></tr>)}</tbody></table></div><p className="eko-fine">Do úspešnosti rátame len Bratislavu a Košice, kde naozaj operujeme. Leady z iných miest (Trnava, Levoča…) evidujeme, ale nekazia štatistiku. Keď začneme v ďalšom meste, pridáme ho. Otvorené leady: {Object.entries(byPerson).map(([k, v]) => `${k} ${v}`).join(' · ') || '0'}.</p></section>
      <div className="eko-two">
        <section className="card"><h2>Konverzia podľa zdroja (BA a KE)</h2><div className="eko-table"><table><thead><tr><th>Zdroj</th><th>Leadov</th><th>Klientov</th><th>Stratených</th><th>Konverzia</th></tr></thead><tbody>{Object.entries(bySource).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.n}</td><td>{v.client}</td><td>{v.lost}</td><td>{v.n ? Math.round((v.client / v.n) * 100) + ' %' : '—'}</td></tr>)}</tbody></table></div><p className="eko-fine">Len leady z Bratislavy a Košíc. Zdroj starých kontaktov z HubSpotu nepoznáme (Iné / neznáme), nové leady zo Zapieru majú zdroj správne.</p></section>
        <section className="card"><h2>Týždenný súhrn</h2><ul className="crm-sum"><li><b>{recent.length}</b> nových leadov za 7 dní</li><li><b>{L.filter((l) => l.first_contact_at && Date.parse(l.first_contact_at) >= week).length}</b> prvých kontaktov</li><li><b>{L.filter((l) => l.stage === 'client' && Date.parse(l.updated_at) >= week).length}</b> nových klientov</li><li><b>{L.filter((l) => l.stage === 'lost' && Date.parse(l.updated_at) >= week).length}</b> stratených</li><li><b>{over.length}</b> po lehote práve teraz</li></ul></section>
      </div>
    </div>
  )
}
function AddLead({ people, me, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', city: '', source: 'Telefón / WhatsApp', note: '', assigned_to: '' })
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="crm-modal" role="dialog" aria-label="Nový lead" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="card crm-form" onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(''); const r = await createManualLead(f); if (r.ok) onCreated(r.id); else setErr(r.error) }) }}>
        <h2>Nový lead</h2>
        <label>Meno<input value={f.name} onChange={set('name')} required /></label>
        <label>Telefón<input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+421 …" /></label>
        <label>E-mail<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Mesto / lokalita<input value={f.city} onChange={set('city')} placeholder="Bratislava, Košice, Trnava…" /></label>
        <label>Zdroj<select value={f.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Komu<select value={f.assigned_to} onChange={set('assigned_to')}><option value="">automaticky podľa mesta</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select></label>
        <label>Poznámka<textarea value={f.note} onChange={set('note')} rows={2} /></label>
        {err && <p className="msg err">{err}</p>}
        <div className="crm-row"><button type="submit" className="btn o" disabled={busy}>{busy ? 'Ukladám…' : 'Uložiť lead'}</button><button type="button" className="btn line" onClick={onClose}>Zrušiť</button></div>
      </form>
    </div>
  )
}
