'use client'
// Ústredňa – obrazovka v schválenom dizajne (handoff livein-headquarters-2026-11-12-v1). Rozloženie a triedy zodpovedajú návrhu;
// obsah je z registra práce. Oblasti bez živého zdroja zostávajú v navigácii s pravdivým stavom, bez ukážkových čísel.
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import Logo from './Logo'
import { AREAS, SOURCE_STATUS, OP_LABEL, statusOf, ago } from '@/lib/hq-labels'
import { assignTaskAction, verifyResultAction } from '@/app/ustredna/actions'

const OP_OF = { prepared: 'assign', accepted: 'accept', working: 'step', blocked: 'block', result_ready: 'result', verified: 'verify', applied: 'apply' }
const UPDATE_ICON = { blocked: 'alert', result_ready: 'file', verified: 'check', applied: 'check', prepared: 'plus', accepted: 'hand', working: 'right' }
const REF_LABEL = { slack: 'Slack', asana: 'Asana', github: 'GitHub', hubspot: 'HubSpot', calendar: 'Kalendár', mail: 'E-mail', file: 'Súbor', other: 'Odkaz' }
const fmt = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '' }

function Badge({ tone = '', children }) { return <span className={'li-state ' + tone}>{children}</span> }
function Panel({ title, link, onLink, children }) {
  return <section className="li-glass"><div className="li-panel-head"><h2>{title}</h2>{link && <button className="li-button ghost" onClick={onLink}>{link} <Icon name="upright" size={14} /></button>}</div>{children}</section>
}

export default function HqApp({ data, canWrite = false, readOnlyNote = '' }) {
  const router = useRouter()
  const [page, setPage] = useState('overview')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState(null)   // { kind: 'task', id } | { kind: 'assign', to } | { kind: 'voice' } | { kind: 'actor', id }
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [form, setForm] = useState({ summary: '', nextAction: '', assigneeId: '', key: '' })   // stav formulárov drží rodič, aby ich prekreslenie nevymazalo
  const [note, setNote] = useState('')
  const { tasks, names, now } = data
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.taskId, t])), [tasks])
  const attention = data.attention.map((id) => byId[id]).filter(Boolean)
  const name = (id) => names[id] || String(id || '').replace(/^(person|agent|integration):/, '')
  const area = AREAS.find((a) => a.id === page) || AREAS[0]
  const liveSources = data.sources.filter((s) => s.status === 'live').length
  const nav = (p) => { setPage(p); setFilter('all'); setQuery(''); setDetail(null); setError('') }
  const open = (d) => {
    if (d.kind === 'assign') setForm({ summary: '', nextAction: '', assigneeId: d.to || (data.assignable[0] || {}).id || '', key: 'ui-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) })
    if (d.kind === 'task') setNote('')
    setDetail(d); setError('')
  }
  const today = new Date(now).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bratislava' })
  const firstName = data.me ? String(data.me.name).split(/[\s@]/)[0] : ''

  const act = (fn, done) => start(async () => {
    setError('')
    const r = await fn()
    if (!r || !r.ok) { setError((r && r.error) || 'Nepodarilo sa. Skús znova.'); return }
    setToast(done); if (r.taskId) setDetail({ kind: 'task', id: r.taskId }); router.refresh()
  })

  const taskRow = (t) => (
    <button key={t.taskId} className="li-priority" onClick={() => open({ kind: 'task', id: t.taskId })}>
      <span className={'li-avatar ' + (['blocked', 'result_ready', 'prepared'].includes(t.status) ? 'orange' : '')}><Icon name={UPDATE_ICON[t.status] || 'dot'} /></span>
      <div><Badge tone={statusOf(t.status).tone}>{statusOf(t.status).label}</Badge><h3>{t.title}</h3><p>Zodpovedá {name(t.assigneeId)} · posledná zmena {ago(t.lastAt, now)} ({name(t.lastActorId)}) · ďalší krok: {t.nextAction}</p></div>
      <Icon name="chevron" size={14} />
    </button>
  )
  const actorRow = (a) => (
    <button key={a.id} className="li-row" onClick={() => open(a.current ? { kind: 'task', id: a.current.taskId } : { kind: 'actor', id: a.id })}>
      <span className="li-avatar">{a.initials}</span>
      <span className="li-body"><strong>{a.name} <span className="li-mini">· {a.runtime || 'Tím'}</span></strong><small>{a.current ? a.current.title : 'Bez úlohy v registri'}</small></span>
      <span className={'li-dot ' + a.tone} aria-label={a.state} title={a.state}></span>
    </button>
  )
  const emptyRegister = <p className="li-empty">V registri zatiaľ nie je žiadna úloha.{canWrite ? ' Zadaj prvú tlačidlom „Zadať úlohu“.' : ''}</p>

  function Overview() {
    return (<>
      <section className="li-hero">
        <div>
          <p className="li-eyebrow">TVOJ DEŇ V SKRATKE</p>
          <h2>Firma má smer.<br />Ty máš prehľad.</h2>
          <p>{!data.ready ? 'Register práce ešte nie je v databáze založený.' : attention.length ? `${attention.length} ${attention.length === 1 ? 'vec čaká' : attention.length < 5 ? 'veci čakajú' : 'vecí čaká'} na tvoju pozornosť.` : tasks.length ? 'Nič nečaká na tvoje rozhodnutie.' : 'Register práce je pripravený a zatiaľ prázdny.'}</p>
          <button className="li-button" onClick={() => nav('attention')}><Icon name="list" size={14} />Prejsť priority <Icon name="right" size={14} /></button>
        </div>
        <div className="li-mic-card">
          <button className="li-mic" onClick={() => open({ kind: 'voice' })} aria-label="Hlasové zadávanie: stav pripojenia"><Icon name="mic" size={23} /></button>
          <div><strong>Čo chceš dnes vyriešiť?</strong><small>Hlasové zadávanie zatiaľ nie je pripojené.</small><small>Úlohu zadáš tlačidlom „Zadať úlohu“.</small></div>
        </div>
      </section>
      <section className="li-metrics" aria-label="Prehľad dňa">
        <button className="li-glass li-metric" onClick={() => nav('attention')}><span className="li-label"><Icon name="dot" size={12} />Moja pozornosť</span><div className="li-number">{attention.length}</div><small>Blokovania, kontroly, neprevzaté</small></button>
        <button className="li-glass li-metric" onClick={() => nav('agents')}><span className="li-label"><Icon name="users" size={12} />Rozpracované úlohy</span><div className="li-number">{data.openCount || 0}</div><small>Ľudia a AI · z registra práce</small></button>
        <button className="li-glass li-metric" onClick={() => nav('visits')}><span className="li-label"><Icon name="calendar" size={12} />Dnešný kalendár</span><div className="li-number">–</div><small>Kalendár nie je pripojený</small></button>
        <button className="li-glass li-metric" onClick={() => nav('connections')}><span className="li-label"><Icon name="unplug" size={12} />Zdroje naživo</span><div className="li-number">{liveSources}<span className="li-mini"> / {data.sources.length}</span></div><small>Ostatné čakajú na pripojenie</small></button>
      </section>
      <div className="li-columns">
        <div className="li-stack">
          <Panel title="Potrebuje tvoju pozornosť" link="Všetky" onLink={() => nav('attention')}>{attention.length ? attention.slice(0, 3).map(taskRow) : <p className="li-empty">{tasks.length ? 'Žiadne blokovanie ani výsledok na kontrolu.' : 'V registri zatiaľ nie je žiadna úloha.'}</p>}</Panel>
          <Panel title="Kto na čom pracuje" link="Celý tím" onLink={() => nav('agents')}>{data.board.length ? data.board.slice(0, 4).map(actorRow) : <p className="li-empty">Zatiaľ žiadni vykonávatelia.</p>}</Panel>
          <Panel title="Spoločné aktualizácie" link="Detail" onLink={() => nav('agents')}>
            {data.updates.length ? data.updates.slice(0, 5).map((u) => (
              <div key={u.eventId} className="li-update"><Icon name={UPDATE_ICON[u.status] || 'dot'} size={14} /><div><p><strong>{name(u.actorId)}</strong> · {OP_LABEL[OP_OF[u.status]]}: {u.summary}</p><small>{ago(u.at, now)} · <button className="li-button ghost" style={{ minHeight: 0, padding: 0, fontSize: 9 }} onClick={() => open({ kind: 'task', id: u.taskId })}>{u.title}</button></small></div></div>
            )) : <p className="li-empty">Žiadne udalosti.</p>}
          </Panel>
        </div>
        <div className="li-stack">
          <Panel title="Dnes v kalendári" link="Obhliadky" onLink={() => nav('visits')}><p className="li-empty">Kalendár tímu zatiaľ nie je pripojený, preto tu nie sú termíny.</p></Panel>
          <Panel title="Marketing v pohybe" link="Marketing" onLink={() => nav('marketing')}><p className="li-empty">Marketingové účty zatiaľ nie sú pripojené, preto tu nie sú čísla.</p></Panel>
          <Panel title="Odkiaľ údaje prichádzajú" link="Prepojenia" onLink={() => nav('connections')}>
            {data.sources.filter((s) => s.status !== 'off').slice(0, 5).map((s) => <div key={s.key} className="li-connection"><div>{s.name}<small>{s.lastOkAt ? 'Posledný úspech ' + ago(s.lastOkAt, now) : s.note || s.scope}</small></div><Badge tone={SOURCE_STATUS[s.status].tone}>{SOURCE_STATUS[s.status].label}</Badge></div>)}
            {!data.sources.some((s) => s.status !== 'off') && <p className="li-empty">Žiadny zdroj zatiaľ neposlal údaje.</p>}
          </Panel>
        </div>
      </div>
    </>)
  }

  function Agents() {
    const list = data.board.filter((a) => filter === 'all' || a.runtime === filter || (filter === 'blocked' && (a.blocked || a.waiting)))
    return (<>
      <div className="li-flex li-between" style={{ marginBottom: 16 }}>
        <div className="li-tabs" style={{ margin: 0 }} aria-label="Filter tímu">{[['all', 'Celý tím'], ['GPT', 'GPT'], ['Claude', 'Claude'], ['Človek', 'Ľudia'], ['blocked', 'Čakajú na vstup']].map(([v, l]) => <button key={v} className={filter === v ? 'active' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}</div>
        {canWrite && <button className="li-button primary" onClick={() => open({ kind: 'assign' })}><Icon name="plus" size={14} />Zadať úlohu</button>}
      </div>
      <div className="li-agents-grid">
        {list.map((a) => (
          <button key={a.id} className="li-glass li-agent" onClick={() => open(a.current ? { kind: 'task', id: a.current.taskId } : { kind: 'actor', id: a.id })}>
            <div className="li-flex li-between"><div className="li-flex"><span className={'li-avatar ' + (a.tone === 'orange' || a.tone === 'red' ? 'orange' : '')}>{a.initials}</span><div><h3>{a.name}</h3><span className="li-mini">{a.role}</span></div></div><Badge tone="gray">{a.runtime || 'Tím'}</Badge></div>
            <Badge tone={a.tone}>{a.state}</Badge>
            <h3>{a.current ? a.current.title : 'Bez úlohy v registri'}</h3>
            <p>{a.current ? 'Ďalší krok: ' + a.current.nextAction : 'Stav sa odvodzuje len z udalostí, ktoré vykonávateľ sám ohlásil.'}</p>
            <div className="li-agent-foot"><span>{a.lastAt ? 'Posledný signál ' + ago(a.lastAt, now) : 'Zatiaľ žiadny signál'}</span><span>{a.open ? `Otvorené: ${a.open}` : 'Otvoriť detail'} ↗</span></div>
          </button>
        ))}
      </div>
      {!list.length && <p className="li-empty">V tomto filtri nikto nie je.</p>}
      <div style={{ marginTop: 15 }}><Panel title="Všetky úlohy v registri">{tasks.length ? tasks.map(taskRow) : emptyRegister}</Panel></div>
      <p className="li-sub" style={{ marginTop: 12 }}>Stav „Pracuje“ znamená, že vykonávateľ ohlásil krok za posledných 6 hodín. Register nevie, či jeho runtime práve beží.</p>
    </>)
  }

  function Connections() {
    return (
      <Panel title="Pokrytie informácií">
        <p className="li-sub" style={{ marginBottom: 14 }}>„Naživo“ je len zdroj, z ktorého ústredňa naozaj prijala údaje. Existencia konektora alebo účtu sama osebe nestačí.</p>
        {data.sources.map((s) => (
          <div key={s.key} className="li-connection">
            <div>{s.name}<small>{s.scope}</small>
              <small>{s.account ? 'Účet: ' + s.account + ' · ' : ''}{s.lastOkAt ? 'Posledný úspech: ' + fmt(s.lastOkAt) : 'Zatiaľ bez úspešného prenosu'}{s.coveredFrom ? ` · Pokryté obdobie: ${fmt(s.coveredFrom)} – ${fmt(s.coveredTo || s.lastOkAt)}` : ''}</small>
              {s.lastError && <small className="li-error">Posledná chyba ({fmt(s.lastErrorAt)}): {s.lastError}</small>}
              {s.note && <small>{s.note}</small>}
            </div>
            <Badge tone={SOURCE_STATUS[s.status].tone}>{SOURCE_STATUS[s.status].label}</Badge>
          </div>
        ))}
        {data.quarantine > 0 && <p className="li-sub" style={{ marginTop: 12 }}>Odmietnuté alebo oneskorené udalosti v karanténe: {data.quarantine}. Neovplyvnili stav úloh.</p>}
      </Panel>
    )
  }

  function Pending() {
    const src = data.sources.filter((s) => (area.sources || []).includes(s.key))
    return (<>
      <Panel title="Táto oblasť zatiaľ nie je pripojená">
        <p className="li-sub" style={{ marginBottom: 14 }}>Oblasť zostáva v ústredni, ale nezobrazuje žiadne čísla ani prípady, kým jej zdroje neposielajú overené údaje.</p>
        {src.map((s) => <div key={s.key} className="li-connection"><div>{s.name}<small>{s.note || s.scope}</small></div><Badge tone={SOURCE_STATUS[s.status].tone}>{SOURCE_STATUS[s.status].label}</Badge></div>)}
      </Panel>
      {area.links && <div style={{ marginTop: 15 }}><Panel title="Dnes to nájdeš v appke">{area.links.map(([label, href]) => <a key={href} className="li-row" href={href}><span className="li-avatar"><Icon name="upright" /></span><span className="li-body"><strong>{label}</strong><small>Existujúci modul LIVE-IN appky</small></span><Icon name="chevron" size={14} /></a>)}</Panel></div>}
    </>)
  }

  function Search() {
    const q = query.toLocaleLowerCase('sk')
    const hit = tasks.filter((t) => JSON.stringify([t.title, t.summary, t.nextAction, t.taskId, t.caseId, name(t.assigneeId)]).toLocaleLowerCase('sk').includes(q))
    const who = data.board.filter((a) => (a.name + ' ' + a.role).toLocaleLowerCase('sk').includes(q))
    return (<>
      <p className="li-sub" style={{ marginBottom: 15 }}>Výsledky pre „{query}“ · {hit.length + who.length} položiek · hľadá sa v registri práce</p>
      {who.length > 0 && <Panel title="Ľudia a agenti">{who.map(actorRow)}</Panel>}
      {hit.length > 0 && <div style={{ marginTop: 15 }}><Panel title="Úlohy">{hit.map(taskRow)}</Panel></div>}
      {!hit.length && !who.length && <p className="li-empty">Nič sme nenašli.</p>}
    </>)
  }

  function TaskDetail({ t }) {
    const st = statusOf(t.status)
    const canVerify = canWrite && t.status === 'result_ready' && t.result && data.me && t.result.actorId !== data.me.id
    return (<>
      <Badge tone={st.tone}>{st.label}</Badge>
      <h2>{t.title}</h2>
      <p>{t.summary}</p>
      <dl>
        <dt>Zodpovedá</dt><dd>{name(t.assigneeId)}</dd>
        <dt>Zadal</dt><dd>{name(t.assignedBy)} · {fmt(t.createdAt)}</dd>
        <dt>Posledná zmena</dt><dd>{name(t.lastActorId)} · {ago(t.lastAt, now)}</dd>
        <dt>Ďalší krok</dt><dd>{t.nextAction}</dd>
        <dt>Prípad</dt><dd><code>{t.caseId}</code></dd>
        <dt>Úloha</dt><dd><code>{t.taskId}</code></dd>
      </dl>
      {t.refs.length > 0 && <><h3>Pôvodné odkazy</h3>{t.refs.map((r) => <p key={r.kind + r.id}>{REF_LABEL[r.kind] || r.kind}: {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.id}</a> : <code>{r.id}</code>}</p>)}</>}
      {t.result && <><h3>Výsledok {t.verified ? '(verzia overená)' : '(čaká na nezávislú kontrolu)'}</h3>{t.result.evidence.map((e) => <p key={e.digest + e.uri}>Verzia {e.version}: {/^https:/.test(e.uri) ? <a href={e.uri} target="_blank" rel="noreferrer">{e.uri}</a> : <code>{e.uri}</code>}<br /><code>sha256 {e.digest}</code></p>)}</>}
      {t.verified && !t.applied && <p className="li-detail-note">Overenie verzie nie je zapracovanie. Zapracovanie potvrdí až cieľová služba.</p>}
      <h3>Priebeh</h3>
      <div className="li-timeline">{t.history.map((e) => <div key={e.eventId} className={statusOf(e.status).tone}><p><strong>{OP_LABEL[OP_OF[e.status]]}</strong> · {name(e.actorId)}</p><small>{fmt(e.receivedAt || e.occurredAt)} · {e.summary}</small></div>)}</div>
      {canVerify && (<>
        <h3>Kontrola tejto verzie</h3>
        <textarea aria-label="Poznámka ku kontrole" placeholder="Čo si skontroloval (nepovinné)" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
        <div className="li-detail-footer"><button className="li-button primary" disabled={busy} onClick={() => act(() => verifyResultAction(t.taskId, { checkedEventId: t.result.eventId, checkedDigests: t.result.evidence.map((e) => e.digest), note }), 'Verzia výsledku je overená.')}>{busy ? 'Zapisujem…' : 'Overiť zobrazenú verziu'}</button></div>
        <p className="li-detail-note">Potvrdzuješ presne verziu a odtlačky zobrazené vyššie, pod svojím prihlásením.</p>
      </>)}
      {t.status === 'result_ready' && !canVerify && canWrite && <p className="li-detail-note">Vlastný výsledok nemôže overiť jeho autor.</p>}
    </>)
  }

  function AssignForm() {
    const f = form
    const set = (k) => (e) => setForm({ ...f, [k]: e.target.value })
    return (<>
      <Badge tone="orange">Nová úloha</Badge>
      <h2>Ďalší krok má vlastníka.</h2>
      <label className="li-mini" htmlFor="hq-task">Zadanie</label>
      <textarea id="hq-task" value={f.summary} onChange={set('summary')} placeholder="Čo má byť výsledkom" />
      <label className="li-mini" htmlFor="hq-owner">Zodpovedá</label>
      <select id="hq-owner" className="li-filter" value={f.assigneeId} onChange={set('assigneeId')}>{data.assignable.map((a) => <option key={a.id} value={a.id}>{a.name}{a.runtime ? ' · ' + a.runtime : ''}</option>)}</select>
      <label className="li-mini" htmlFor="hq-next">Prvý krok (nepovinné)</label>
      <input id="hq-next" className="li-filter" value={f.nextAction} onChange={set('nextAction')} placeholder="Prevziať úlohu a potvrdiť prvý krok." />
      <div className="li-detail-footer"><button className="li-button primary" disabled={busy || !f.summary.trim() || !f.assigneeId} onClick={() => act(() => assignTaskAction(f), 'Úloha je zadaná a čaká na prevzatie.')}>{busy ? 'Zapisujem…' : 'Zadať úlohu'}</button></div>
      <p className="li-detail-note">Úloha sa zapíše do registra pod tvojím menom. Príjemca ju musí sám prevziať; zadanie nie je potvrdenie prevzatia.</p>
    </>)
  }

  const renders = { overview: Overview, agents: Agents, connections: Connections, attention: () => <Panel title="Rozhodnutia a otvorené kroky">{attention.length ? attention.map(taskRow) : <p className="li-empty">{tasks.length ? 'Nič nečaká na tvoje rozhodnutie.' : 'V registri zatiaľ nie je žiadna úloha.'}</p>}</Panel> }
  const Content = query.trim() ? Search : (renders[page] || Pending)
  const dTask = detail && detail.kind === 'task' ? byId[detail.id] : null
  const dActor = detail && detail.kind === 'actor' ? data.board.find((a) => a.id === detail.id) : null

  return (
    <div id="livein-hq" aria-label="LIVE-IN firemná ústredňa">
      <div className="li-shell">
        <aside className="li-side">
          <div className="li-brand"><Logo /><small>FIREMNÁ ÚSTREDŇA</small><a className="li-home" href="/">← Späť do appky</a></div>
          <nav className="li-nav" aria-label="Hlavná navigácia ústredne">
            {AREAS.filter((a) => !a.extra).map((a) => <button key={a.id} className={page === a.id && !query.trim() ? 'active' : ''} aria-current={page === a.id ? 'page' : undefined} onClick={() => nav(a.id)}><Icon name={a.icon} />{a.nav}{a.id === 'attention' && <span className="li-count">{attention.length}</span>}</button>)}
            <div className="li-side-label">ĎALŠIE OBLASTI</div>
            {AREAS.filter((a) => a.extra).map((a) => <button key={a.id} className={'extra' + (page === a.id && !query.trim() ? ' active' : '')} aria-current={page === a.id ? 'page' : undefined} onClick={() => nav(a.id)}><Icon name={a.icon} />{a.nav}</button>)}
          </nav>
          <div className="li-side-bottom"><p>Jeden tím.<br />Spoločný obraz firmy.</p>{data.me && <div className="li-person"><span className="li-avatar orange">{data.me.initials}</span><div><strong>{data.me.name}</strong><small>LIVE-IN</small></div></div>}</div>
        </aside>
        <main className="li-main">
          <header className="li-top">
            <label className="li-search"><Icon name="search" size={14} /><input aria-label="Hľadať v registri práce" placeholder="Nájdi úlohu, človeka, agenta…" value={query} onChange={(e) => { setQuery(e.target.value); setDetail(null) }} /></label>
            <span className="li-demo">{!data.ready ? 'REGISTER NIE JE ZALOŽENÝ' : data.local ? 'LOKÁLNY REGISTER · SKÚŠOBNÁ PREVÁDZKA' : 'ŽIVÝ REGISTER PRÁCE'}</span>
          </header>
          <div className="li-page-head">
            <div><p className="li-eyebrow">LIVE-IN / {(query.trim() ? 'Vyhľadávanie' : area.nav).toLocaleUpperCase('sk')}</p><h1>{query.trim() ? 'Nájdi súvislosti naprieč firmou.' : page === 'overview' && firstName ? `Dobrý deň, ${firstName}.` : area.title}</h1><p className="li-sub">{query.trim() ? 'Ľudia, agenti a rozpracované úlohy.' : area.sub}</p></div>
            {canWrite ? <button className="li-button" onClick={() => open({ kind: 'assign' })}><Icon name="plus" size={14} />Zadať úlohu</button> : null}
          </div>
          {readOnlyNote && <div className="li-toast" role="status"><span>{readOnlyNote}</span></div>}
          {!data.ready && <div className="li-toast" role="status"><span>Register práce ešte nie je v databáze (migrácia 20261114_ustredna čaká na aplikovanie). Obrazovka preto neukazuje žiadne úlohy.</span></div>}
          {toast && <div className="li-toast" role="status"><span>{toast}</span><button onClick={() => setToast('')}>Zavrieť</button></div>}
          {detail && (
            <section className="li-detail" role="dialog" aria-modal="false" aria-label="Detail položky">
              <div className="li-flex li-between"><span className="li-eyebrow">LIVE-IN · DETAIL</span><button className="li-close" aria-label="Zavrieť detail" onClick={() => setDetail(null)}><Icon name="x" size={15} /></button></div>
              {dTask && TaskDetail({ t: dTask })}
              {detail.kind === 'task' && !dTask && <p style={{ marginTop: 14 }}>Úloha sa načítava…</p>}
              {detail.kind === 'assign' && AssignForm()}
              {dActor && <><Badge tone={dActor.tone}>{dActor.state}</Badge><h2>{dActor.name}</h2><p>{dActor.role}</p><dl><dt>Pracuje cez</dt><dd>{dActor.runtime || 'Tím'}</dd><dt>Posledný signál</dt><dd>{dActor.lastAt ? ago(dActor.lastAt, now) : 'zatiaľ žiadny'}</dd><dt>Otvorené úlohy</dt><dd>{dActor.open}</dd></dl>{canWrite && dActor.kind !== 'integration' && <div className="li-detail-footer"><button className="li-button primary" onClick={() => open({ kind: 'assign', to: dActor.id })}>Zadať úlohu</button></div>}</>}
              {detail.kind === 'voice' && <><Badge tone="gray">Nepripojené</Badge><h2>Hlasové zadávanie</h2><p>Hlas zatiaľ nie je pripojený a mikrofón sa nezapína. Po pripojení bude vyvolávať rovnaké overiteľné akcie ako tlačidlá: zadať úlohu, otvoriť prípad, overiť výsledok.</p><div className="li-detail-footer">{canWrite && <button className="li-button primary" onClick={() => open({ kind: 'assign' })}>Zadať úlohu ručne</button>}</div></>}
              {error && <p className="li-detail-note li-error" role="alert">{error}</p>}
            </section>
          )}
          <div id="li-content">{Content()}</div>
          <footer className="li-footer"><span>{today} · {data.local ? 'lokálny register na tomto počítači' : 'register práce'}</span><button className="li-button ghost" onClick={() => nav('connections')}><Icon name="info" size={14} />{liveSources ? `Naživo: ${liveSources} z ${data.sources.length} zdrojov` : 'Žiadny zdroj zatiaľ nie je naživo'}</button></footer>
        </main>
      </div>
    </div>
  )
}
