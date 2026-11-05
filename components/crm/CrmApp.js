'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/browser'
import { STAGES, OPEN_STAGES, SOURCES, CITY_GROUPS, countdown, stageOf } from '@/lib/crm'
import { Ring, Pill, ContactButtons, StageBar, stateOf, SCRIPT, fmtDT, fmtD, firstName } from './ui'
import { setStage, logContact, createManualLead, setKind } from '@/app/crm/actions'
import CrmNotifier from './CrmNotifier'

const VIEWS = [['one', 'Jeden naraz', '📱'], ['queue', 'Fronta', '⏱️'], ['board', 'Tabuľa', '🗂️'], ['contacts', 'Kontakty', '👥'], ['overview', 'Prehľad', '📊']]
const H = 3600e3
const byUrgency = (now) => (a, b) => {
  const da = a.due_at ? Date.parse(a.due_at) - now : Infinity, db = b.due_at ? Date.parse(b.due_at) - now : Infinity
  if (da !== db) return da - db
  return Date.parse(b.received_at) - Date.parse(a.received_at)
}

export default function CrmApp({ initialLeads, me, people, notifications, pushPublicKey }) {
  const sp = useSearchParams(), router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [view, setViewState] = useState(sp.get('v') || '')
  const [now, setNow] = useState(() => Date.now())
  const [q, setQ] = useState('')
  const [city, setCity] = useState('all')
  const [source, setSource] = useState('all')
  const [mine, setMine] = useState(false)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, start] = useTransition()
  const liveRef = useRef(null)

  // predvolený pohľad: telefón → Jeden naraz, admin → Tabuľa, inak Fronta
  useEffect(() => { if (!view) setViewState(window.matchMedia('(max-width: 760px)').matches ? 'one' : me.isAdmin ? 'board' : 'queue') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const setView = (v) => { setViewState(v); const u = new URL(window.location.href); u.searchParams.set('v', v); window.history.replaceState(null, '', u); window.scrollTo({ top: 0 }) }
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
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
  const open = useMemo(() => leads.filter((l) => l.kind === 'lead' && OPEN_STAGES.includes(l.stage) && matches(l)).sort(byUrgency(now)), [leads, now, q, city, source, mine]) // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => open.filter((l) => l.stage === 'new' && l.due_at), [open])
  const overdue = useMemo(() => fresh.filter((l) => Date.parse(l.due_at) < now), [fresh, now])
  const soon = useMemo(() => fresh.filter((l) => { const d = Date.parse(l.due_at) - now; return d >= 0 && d < 2 * H }), [fresh, now])

  const patch = (id, p) => setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const doStage = (id, stage, opts) => start(async () => {
    setMsg('')
    const before = leads.find((l) => l.id === id)
    patch(id, { stage, kind: stage === 'client' ? 'client' : 'lead', first_contact_at: before && before.stage === 'new' && stage !== 'new' && !before.first_contact_at ? new Date().toISOString() : before && before.first_contact_at, lost_reason: opts && opts.lost_reason })
    const r = await setStage(id, stage, opts || {})
    if (!r.ok) { setMsg(r.error); if (before) patch(id, before) }
  })
  const doLog = (id, type) => { logContact(id, type).catch(() => {}) }
  const label = (l) => firstName(l.assigned_to, people)

  return (
    <div className="crm">
      <section className="li-page-intro crm-intro">
        <div>
          <span className="li-eyebrow">CRM · leady a kontakty</span>
          <h1>{overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'lead čaká' : overdue.length < 5 ? 'leady čakajú' : 'leadov čaká'} po lehote.` : fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'nový lead' : fresh.length < 5 ? 'nové leady' : 'nových leadov'} na zavolanie.` : 'Všetky leady sú vybavené.'}</h1>
          <p>Na každý dopyt odpovedáme do jedného pracovného dňa. Zavolaj, zmeň štádium jedným klikom a appka to zapíše do HubSpotu aj Asany.</p>
        </div>
        <div className="crm-intro-side">
          <CrmNotifier me={me} initial={notifications} pushPublicKey={pushPublicKey} />
          <button type="button" className="btn o" onClick={() => setAdding(true)}>+ Pridať lead</button>
        </div>
      </section>

      {overdue.length > 0 && view !== 'contacts' && view !== 'overview' && <div className="crm-banner" role="alert">POZOR: {overdue.length} {overdue.length === 1 ? 'lead' : overdue.length < 5 ? 'leady' : 'leadov'} po lehote. Kontaktuj hneď.</div>}

      <nav className="crm-tabs" aria-label="Pohľady">{VIEWS.map(([id, l, ic]) => <button key={id} type="button" className={view === id ? 'on' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><span aria-hidden="true">{ic}</span>{l}{id === 'queue' && fresh.length ? <b>{fresh.length}</b> : null}</button>)}</nav>

      {view !== 'one' && view !== 'overview' && (
        <div className="crm-filters">
          <input type="search" placeholder="Hľadať meno, mesto, telefón…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={city} onChange={(e) => setCity(e.target.value)}><option value="all">Všetky mestá</option>{CITY_GROUPS.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={source} onChange={(e) => setSource(e.target.value)}><option value="all">Všetky zdroje</option>{SOURCES.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="crm-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> len moje</label>
        </div>
      )}
      {msg && <p className="msg err">{msg}</p>}

      {view === 'one' && <OneAtATime leads={fresh.length ? fresh : open} now={now} onStage={doStage} onLog={doLog} people={people} busy={busy} />}
      {view === 'queue' && <Queue leads={open} now={now} onStage={doStage} onLog={doLog} people={people} />}
      {view === 'board' && <Board leads={leads.filter((l) => matches(l) && l.kind !== 'not_lead')} now={now} onStage={doStage} people={people} />}
      {view === 'contacts' && <Contacts leads={leads.filter(matches)} people={people} isAdmin={me.isAdmin} onKind={(id, k) => start(async () => { patch(id, { kind: k }); const r = await setKind(id, k); if (!r.ok) setMsg(r.error) })} />}
      {view === 'overview' && <Overview leads={leads} now={now} people={people} />}

      {adding && <AddLead people={people} me={me} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); router.push(`/crm/lead/${id}`) }} />}
    </div>
  )
}

function LeadRow({ l, now, onStage, onLog, people }) {
  const st = stateOf(l, now)
  return (
    <article className={'crm-row ' + st}>
      <Ring lead={l} now={now} />
      <div className="crm-row-main">
        <div className="crm-row-head"><Link href={`/crm/lead/${l.id}`} className="crm-name">{l.name}</Link><Pill lead={l} />{l.priority === 'low' && <span className="crm-low">nižšia priorita</span>}</div>
        <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || 'bez mesta'} · {l.source || 'zdroj neznámy'} · prijatý {fmtDT(l.received_at)} · {firstName(l.assigned_to, people) || 'nepriradený'}</div>
        <StageBar lead={l} onStage={(s, o) => onStage(l.id, s, o)} compact />
      </div>
      <ContactButtons lead={l} onLog={(t) => onLog(l.id, t)} />
    </article>
  )
}
function Queue({ leads, now, onStage, onLog, people }) {
  if (!leads.length) return <section className="card crm-empty"><h2>Fronta je prázdna</h2><p>Žiadny otvorený lead nezodpovedá filtru. Nové leady sa tu objavia samy.</p></section>
  return <div className="crm-queue">{leads.map((l) => <LeadRow key={l.id} l={l} now={now} onStage={onStage} onLog={onLog} people={people} />)}</div>
}
function OneAtATime({ leads, now, onStage, onLog, people, busy }) {
  const l = leads[0]
  if (!l) return <section className="card crm-empty crm-phone"><h2>Všetko vybavené 🎉</h2><p>Žiadny nový lead nečaká. Nový sa ukáže hneď, ako príde.</p></section>
  const c = countdown(l.due_at, now), over = c.state === 'over', st = stateOf(l, now)
  return (
    <section className={'card crm-phone ' + st}>
      <div className="crm-phone-top"><span className={'crm-pill s-wait ' + st}>Čaká {leads.length} {leads.length === 1 ? 'lead' : leads.length < 5 ? 'leady' : 'leadov'}</span><Link href={`/crm/lead/${l.id}`} className="eko-link">Detail ↗</Link></div>
      <div className={'crm-timer ' + st} suppressHydrationWarning>{l.due_at ? c.label : '—'}</div>
      <div className="crm-timer-sub">{l.due_at ? (over ? 'po lehote' : 'do konca lehoty') : 'bez lehoty (starší lead)'}</div>
      <h2>{l.name}</h2>
      <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || 'bez mesta'} · {l.source || 'zdroj neznámy'} · {fmtDT(l.received_at)}</div>
      {l.notes && <p className="crm-note">{l.notes}</p>}
      <ContactButtons lead={l} onLog={(t) => onLog(l.id, t)} big />
      <div className="crm-script"><b>Čo povedať:</b> {SCRIPT}</div>
      <div className="crm-two">
        <button type="button" className="btn" disabled={busy} onClick={() => onStage(l.id, 'contacted', { connected: true, note: 'Zavolané' })}>Zavolané → ďalší</button>
        <button type="button" className="btn line" disabled={busy} onClick={() => { onLog(l.id, 'sms'); onStage(l.id, 'contacted', { connected: false, note: 'Nedvíha, poslaná SMS' }) }}>Nedvíha → SMS</button>
      </div>
      <details className="crm-more"><summary>Iné štádium alebo stratený</summary><StageBar lead={l} onStage={(s, o) => onStage(l.id, s, o)} /></details>
    </section>
  )
}
function Board({ leads, now, onStage, people }) {
  const [drag, setDrag] = useState(null)
  const cols = STAGES.map((s) => ({ s, items: leads.filter((l) => l.stage === s.id).sort(byUrgency(now)) }))
  return (
    <div className="crm-board">
      {cols.map(({ s, items }) => (
        <div key={s.id} className={'crm-col s-' + s.id} onDragOver={(e) => { if (s.id !== 'lost') e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (drag && s.id !== 'lost') { onStage(drag, s.id); setDrag(null) } }}>
          <h4>{s.short}<span>{items.length}</span></h4>
          {items.slice(0, 60).map((l) => { const st = stateOf(l, now); return (
            <div key={l.id} className={'crm-kcard ' + st} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}>
              <Link href={`/crm/lead/${l.id}`}><b>{l.name}</b></Link>
              <div className="crm-meta">{l.city_group !== 'Iné' ? l.city_group : l.city || '—'} · {firstName(l.assigned_to, people)}</div>
              {l.stage === 'new' && l.due_at && <div className={'crm-kt ' + st}>{countdown(l.due_at, now).label}</div>}
              {s.id !== 'client' && s.id !== 'lost' && <button type="button" className="crm-next" onClick={() => onStage(l.id, STAGES[STAGES.findIndex((x) => x.id === s.id) + 1].id)}>Ďalej →</button>}
            </div>
          ) })}
          {items.length > 60 && <p className="eko-fine">+ {items.length - 60} ďalších (použi filtre)</p>}
          {s.id === 'lost' && <p className="eko-fine">Stratený sa nastavuje na karte leadu (povinný dôvod).</p>}
        </div>
      ))}
    </div>
  )
}
function Contacts({ leads, people, isAdmin, onKind }) {
  const [tab, setTab] = useState('clients')
  const list = leads.filter((l) => (tab === 'clients' ? l.kind === 'client' : tab === 'leads' ? l.kind === 'lead' : l.kind === 'not_lead')).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const counts = { clients: leads.filter((l) => l.kind === 'client').length, leads: leads.filter((l) => l.kind === 'lead').length, not: leads.filter((l) => l.kind === 'not_lead').length }
  return (
    <section className="card crm-contacts">
      <div className="crm-seg" role="tablist"><button type="button" className={tab === 'clients' ? 'on' : ''} onClick={() => setTab('clients')}>Klienti <b>{counts.clients}</b></button><button type="button" className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leady <b>{counts.leads}</b></button>{isAdmin && <button type="button" className={tab === 'not' ? 'on' : ''} onClick={() => setTab('not')}>Nie leady <b>{counts.not}</b></button>}</div>
      <div className="eko-table"><table><thead><tr><th>Meno</th><th>Mesto</th><th>Telefón</th><th>E-mail</th><th>Štádium</th><th>Komu</th><th>Od</th>{isAdmin && <th></th>}</tr></thead><tbody>
        {list.slice(0, 400).map((l) => <tr key={l.id}><td><Link href={`/crm/lead/${l.id}`} className="crm-name">{l.name}</Link>{l.property_address && <small className="muted"> · {l.property_address}</small>}</td><td>{l.city_group !== 'Iné' ? l.city_group : l.city || '—'}</td><td>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '—'}</td><td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : '—'}{l.email_optout && <small className="crm-low"> · odhlásený</small>}</td><td><Pill lead={l} /></td><td>{firstName(l.assigned_to, people)}</td><td>{fmtD(l.received_at)}</td>{isAdmin && <td>{l.kind === 'not_lead' ? <button type="button" className="eko-link" onClick={() => onKind(l.id, 'lead')}>je lead</button> : l.kind === 'lead' ? <button type="button" className="eko-link" onClick={() => onKind(l.id, 'not_lead')}>nie lead</button> : null}</td>}</tr>)}
      </tbody></table>{list.length > 400 && <p className="eko-fine">Zobrazených prvých 400, spresni hľadanie.</p>}{!list.length && <p className="eko-empty">Nič tu nie je.</p>}</div>
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
  const bySource = {}
  for (const l of L) { const k = l.source || 'Iné / neznáme'; bySource[k] = bySource[k] || { n: 0, client: 0, lost: 0 }; bySource[k].n++; if (l.kind === 'client' || l.stage === 'client') bySource[k].client++; if (l.stage === 'lost') bySource[k].lost++ }
  const byPerson = {}
  for (const l of L.filter((x) => OPEN_STAGES.includes(x.stage) && x.kind === 'lead')) { const k = firstName(l.assigned_to, people) || '—'; byPerson[k] = (byPerson[k] || 0) + 1 }
  return (
    <div className="crm-overview">
      <section className="eko-kpis four">
        <div className="metric eko-metric primary"><small>Po lehote</small><strong>{over.length}</strong><p>nových leadov s prekročenou lehotou</p></div>
        <div className="metric eko-metric"><small>Čas do prvého kontaktu</small><strong>{avgH == null ? '—' : avgH < 48 ? Math.round(avgH) + ' h' : Math.round(avgH / 24) + ' dní'}</strong><p>priemer z {contacted.length} leadov (cieľ do 24 h)</p></div>
        <div className="metric eko-metric"><small>Nové za 7 dní</small><strong>{recent.length}</strong><p>{recent.filter((l) => l.first_contact_at).length} už kontaktovaných</p></div>
        <div className="metric eko-metric"><small>Otvorené leady</small><strong>{L.filter((l) => l.kind === 'lead' && OPEN_STAGES.includes(l.stage)).length}</strong><p>{Object.entries(byPerson).map(([k, v]) => `${k} ${v}`).join(' · ')}</p></div>
      </section>
      <div className="eko-two">
        <section className="card"><h2>Konverzia podľa zdroja</h2><div className="eko-table"><table><thead><tr><th>Zdroj</th><th>Leadov</th><th>Klientov</th><th>Stratených</th><th>Konverzia</th></tr></thead><tbody>{Object.entries(bySource).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.n}</td><td>{v.client}</td><td>{v.lost}</td><td>{v.n ? Math.round((v.client / v.n) * 100) + ' %' : '—'}</td></tr>)}</tbody></table></div><p className="eko-fine">Zdroj starých kontaktov z HubSpotu nepoznáme (Iné / neznáme). Nové leady zo Zapieru majú zdroj správne.</p></section>
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
