'use client'
// Ústredňa – obrazovka. Obsah je z registra práce a z existujúcich modulov appky; nič ukážkové.
// Interakcie: paleta príkazov (⌘K), hlasové príkazy, živé obnovovanie, mapa firmy s Obsidianom, brífing priorít, denný a nočný režim.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import Logo from './Logo'
import Graph from './Graph'
import { Num, Clock, Since, WeekBars, Ring, Split, HBars, Palette, Briefing, useVoice, Rain, Decode, Ticker, Boot, Console } from './Widgets'
import { AREAS, SOURCE_STATUS, OP_LABEL, statusOf, ago, plural } from '@/lib/hq-labels'
import { parseCommand, fold } from '@/lib/hq-voice'
import { companyGraph, mergeGraphs } from '@/lib/hq-graph'
import { unpackIndex, vaultGraph, obsidianUrl } from '@/lib/hq-vault'
import { assignTaskAction, verifyResultAction } from '@/app/ustredna/actions'

const OP_OF = { prepared: 'assign', accepted: 'accept', working: 'step', blocked: 'block', result_ready: 'result', verified: 'verify', applied: 'apply' }
const UPDATE_ICON = { blocked: 'alert', result_ready: 'file', verified: 'check', applied: 'check', prepared: 'plus', accepted: 'hand', working: 'right' }
const REF_LABEL = { slack: 'Slack', asana: 'Asana', github: 'GitHub', hubspot: 'HubSpot', calendar: 'Kalendár', mail: 'E-mail', file: 'Súbor', other: 'Odkaz' }
const KIND_LABEL = { hub: 'Ústredňa', area: 'Oblasť', source: 'Zdroj', actor: 'Človek alebo agent', task: 'Úloha', note: 'Poznámka v Obsidiane', folder: 'Priečinok trezoru' }
const BOARD = [['prepared', 'Čaká na prevzatie', ['prepared']], ['doing', 'V práci', ['accepted', 'working']], ['blocked', 'Blokované', ['blocked']], ['review', 'Na kontrolu', ['result_ready']], ['done', 'Overené', ['verified', 'applied']]]
const TZ = 'Europe/Bratislava'
const fmt = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '' }
const fmtDay = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ }) : '–' }

function Badge({ tone = '', children }) { return <span className={'li-state ' + tone}>{children}</span> }
function Panel({ title, link, onLink, href, children, className = '' }) {
  return <section className={'li-glass ' + className}><div className="li-panel-head"><h2>{title}</h2>{link && (href ? <a className="li-button ghost" href={href}>{link} <Icon name="upright" size={14} /></a> : <button className="li-button ghost" onClick={onLink}>{link} <Icon name="upright" size={14} /></button>)}</div>{children}</section>
}

export default function HqApp({ data, canWrite = false, readOnlyNote = '', vaultUrl = '/api/hq/vault' }) {
  const router = useRouter()
  const root = useRef(null)
  const [page, setPage] = useState('overview')
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)   // { kind: 'task', id } | { kind: 'assign', to } | { kind: 'actor', id }
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [form, setForm] = useState({ summary: '', nextAction: '', assigneeId: '', key: '' })   // stav formulárov drží rodič, aby ich prekreslenie nevymazalo
  const [note, setNote] = useState('')
  const [theme, setTheme] = useState('night')   // predvolený je tmavý „Matrix“ režim; denný si prehliadač zapamätá
  const [boot, setBoot] = useState('off')   // 'run' = štartovacia sekvencia (raz za reláciu prehliadača)
  const [palette, setPalette] = useState({ open: false, initial: '' })
  const [brief, setBrief] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [heard, setHeard] = useState('')
  const [vault, setVault] = useState({ status: 'idle', ix: null })
  const [graphMode, setGraphMode] = useState('all')
  const [agentsView, setAgentsView] = useState('list')
  const [noteQuery, setNoteQuery] = useState('')
  const [loadedAt, setLoadedAt] = useState(data.now)

  const { tasks, names, now } = data
  const live = data.live, V = data.vault
  const signals = (live && live.signals) || []
  const kpis = (live && live.kpis) || {}, charts = (live && live.charts) || {}
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.taskId, t])), [tasks])
  const attention = data.attention.map((id) => byId[id]).filter(Boolean)
  const nAttention = attention.length + signals.length
  const name = (id) => names[id] || String(id || '').replace(/^(person|agent|integration):/, '')
  const area = AREAS.find((a) => a.id === page) || AREAS[0]
  const liveSources = data.sources.filter((s) => s.status === 'live').length
  const today = new Date(now).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
  const hour = Number(new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(now)))
  const firstName = data.me ? String(data.me.name).split(/[\s@]/)[0] : ''
  const greeting = (hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý deň' : 'Dobrý večer') + (firstName ? ', ' + firstName : '') + '.'

  const nav = useCallback((p) => { setPage(p); setFilter('all'); setDetail(null); setError(''); if (root.current && window.scrollY > root.current.offsetTop + 200) window.scrollTo({ top: root.current.offsetTop, behavior: 'smooth' }) }, [])
  const open = useCallback((d) => {
    if (d.kind === 'assign') setForm({ summary: d.summary || '', nextAction: '', assigneeId: d.to || (data.assignable[0] || {}).id || '', key: 'ui-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) })
    if (d.kind === 'task') setNote('')
    setDetail(d); setError('')
  }, [data.assignable])
  const refresh = useCallback(() => start(() => router.refresh()), [router])
  const act = (fn, done) => start(async () => {
    setError('')
    const r = await fn()
    if (!r || !r.ok) { setError((r && r.error) || 'Nepodarilo sa. Skús znova.'); return }
    setToast(done); if (r.taskId) setDetail({ kind: 'task', id: r.taskId }); router.refresh()
  })

  // režim (denný/nočný) si pamätá prehliadač
  useEffect(() => {
    try { const t = localStorage.getItem('hq-theme'); if (t === 'night' || t === 'day') setTheme(t) } catch {}
    // štartovacia sekvencia raz za reláciu prehliadača, nikdy pri obmedzenom pohybe
    let run = false
    try { if (!sessionStorage.getItem('hq-boot') && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { sessionStorage.setItem('hq-boot', '1'); run = true } } catch {}
    if (run) setBoot('run')
  }, [])
  const bootDone = useCallback(() => setBoot('off'), [])
  const applyTheme = useCallback((t) => { setTheme(t); try { localStorage.setItem('hq-theme', t) } catch {} }, [])
  // živé obnovovanie: každú minútu, len keď je karta viditeľná a človek práve nepíše
  useEffect(() => { setLoadedAt(Date.now()) }, [data.now])
  useEffect(() => {
    const due = () => document.visibilityState === 'visible' && !document.querySelector('#livein-hq textarea:focus, #livein-hq input:focus, #livein-hq select:focus')
    const i = setInterval(() => { if (due()) router.refresh() }, 60000)
    const vis = () => { if (document.visibilityState === 'visible') router.refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis) }
  }, [router])
  // index Obsidian trezoru sa sťahuje až keď ho treba (mapa, znalosti, paleta)
  const loadVault = useCallback(() => {
    setVault((cur) => {
      if (cur.status !== 'idle' || !V) return cur
      fetch(vaultUrl, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => setVault(j && j.ok && j.index ? { status: 'ready', ix: unpackIndex(j.index) } : { status: 'error', ix: null })).catch(() => setVault({ status: 'error', ix: null }))
      return { status: 'loading', ix: null }
    })
  }, [V, vaultUrl])
  useEffect(() => { if (page === 'map' || page === 'knowledge' || palette.open) loadVault() }, [page, palette.open, loadVault])

  // príkazy: rovnaký výklad pre hlas aj pre vetu napísanú do palety
  const command = useCallback((text) => {
    const c = parseCommand(text, { people: data.assignable })
    setHeard(text)
    if (c.type === 'nav') nav(c.area)
    else if (c.type === 'assign') { if (canWrite) open({ kind: 'assign', to: c.assigneeId, summary: c.summary }); else setToast('Zadávať úlohy sa dá až po prihlásení.') }
    else if (c.type === 'briefing') setBrief(true)
    else if (c.type === 'refresh') refresh()
    else if (c.type === 'theme') applyTheme(c.value)
    else setPalette({ open: true, initial: c.query || text })
  }, [data.assignable, nav, open, refresh, applyTheme, canWrite])
  const voice = useVoice((text) => { setVoiceOpen(false); command(text) })
  const talk = () => { setVoiceOpen(true); setHeard(''); voice.start() }

  useEffect(() => {
    const key = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => ({ open: !p.open, initial: '' })) }
      else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') { e.preventDefault(); setPalette({ open: true, initial: '' }) }
      else if (!typing && e.key === 'Escape') { setDetail(null); setVoiceOpen(false) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])
  // svetlo pod kurzorom na sklenených paneloch
  const glow = (e) => { const c = e.target.closest && e.target.closest('.li-glass, .li-hero'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px') }

  /* ---------- mapa ---------- */
  const company = useMemo(() => companyGraph({ areas: AREAS, sources: data.sources, board: data.board, tasks }), [data.sources, data.board, tasks])
  const vg = useMemo(() => (vault.ix ? vaultGraph(vault.ix) : null), [vault.ix])
  const graph = useMemo(() => (graphMode === 'firma' ? company : graphMode === 'obsidian' ? vg || { nodes: [], links: [] } : mergeGraphs(company, vg)), [graphMode, company, vg])
  const openNode = useCallback((n) => {
    if (n.kind === 'area') nav(n.area)
    else if (n.kind === 'task') { open({ kind: 'task', id: n.taskId }) }
    else if (n.kind === 'actor') open({ kind: 'actor', id: n.actorId })
    else if (n.kind === 'source') nav('connections')
    else if (n.kind === 'note' && V) window.location.href = obsidianUrl(V.name, n.path)
    else if (n.kind === 'hub') nav('overview')
  }, [nav, open, V])
  const nodeInfo = (n) => (<>
    <small className="li-eyebrow">{KIND_LABEL[n.kind] || 'Uzol'}</small>
    <h3>{n.label}</h3>
    {n.kind === 'note' && <p>{n.path}{n.mtime ? ' · zmenené ' + fmtDay(n.mtime) : ''}{n.words ? ` · ${n.words} slov` : ''}</p>}
    {n.kind === 'note' && n.tags && n.tags.length > 0 && <p>{n.tags.slice(0, 6).map((t) => '#' + t).join(' ')}</p>}
    {n.kind === 'folder' && <p>{n.path || 'koreň trezoru'}</p>}
    {n.kind === 'task' && <p>{statusOf(n.status).label}</p>}
    {n.kind === 'source' && <p>{(SOURCE_STATUS[n.status] || {}).label}</p>}
    {n.kind !== 'folder' && <button type="button" className="li-button primary" onClick={() => openNode(n)}>{n.kind === 'note' ? 'Otvoriť v Obsidiane' : n.kind === 'task' ? 'Otvoriť úlohu' : n.kind === 'actor' ? 'Otvoriť detail' : 'Otvoriť'} <Icon name="upright" size={14} /></button>}
  </>)

  /* ---------- paleta príkazov ---------- */
  const items = useMemo(() => {
    const go = (href) => () => { window.location.href = href }
    const out = [
      ...(canWrite ? [{ id: 'x:new', group: 'Akcie', title: 'Zadať úlohu', sub: 'Nová úloha pre človeka alebo agenta', icon: 'plus', rank: 1, keys: 'nova uloha pridat zadanie', run: () => open({ kind: 'assign' }) }] : []),
      { id: 'x:brief', group: 'Akcie', title: 'Brífing priorít', sub: `${nAttention} vecí na tvoju pozornosť`, icon: 'list', rank: 2, keys: 'priority pozornost co treba', run: () => setBrief(true) },
      { id: 'x:voice', group: 'Akcie', title: 'Hlasový príkaz', sub: 'Povedz, čo potrebuješ', icon: 'mic', rank: 3, keys: 'mikrofon hovorit', run: talk },
      { id: 'x:refresh', group: 'Akcie', title: 'Obnoviť údaje', sub: 'Načítať všetko znova', icon: 'refresh', rank: 4, keys: 'aktualizovat nacitat', run: refresh },
      { id: 'x:theme', group: 'Akcie', title: theme === 'night' ? 'Prepnúť na denný režim' : 'Prepnúť na Matrix režim', icon: theme === 'night' ? 'sun' : 'moon', rank: 5, keys: 'tmavy svetly rezim tema', run: () => applyTheme(theme === 'night' ? 'day' : 'night') },
      ...AREAS.map((a, i) => ({ id: 'a:' + a.id, group: 'Oblasti', title: a.nav, sub: a.sub, icon: a.icon, rank: 10 + i, run: () => nav(a.id) })),
      ...signals.map((s, i) => ({ id: 'g:' + i, group: 'Signály', title: s.title, sub: s.sub, icon: 'alert', rank: 20, run: go(s.href) })),
      ...tasks.map((t) => ({ id: 't:' + t.taskId, group: 'Úlohy', title: t.title, sub: `${statusOf(t.status).label} · ${name(t.assigneeId)}`, icon: UPDATE_ICON[t.status] || 'dot', rank: 30, keys: t.taskId + ' ' + t.caseId + ' ' + t.nextAction, run: () => open({ kind: 'task', id: t.taskId }) })),
      ...data.board.map((a) => ({ id: 'p:' + a.id, group: 'Ľudia a agenti', title: a.name, sub: [a.runtime, a.state].filter(Boolean).join(' · '), icon: 'users', rank: 40, run: () => open(a.current ? { kind: 'task', id: a.current.taskId } : { kind: 'actor', id: a.id }) })),
    ]
    const seen = new Set()
    for (const a of AREAS) for (const [label, href] of a.links || []) { if (seen.has(href)) continue; seen.add(href); out.push({ id: 'm:' + href, group: 'Otvoriť v appke', title: label, sub: href, icon: 'upright', rank: 60, run: go(href) }) }
    out.push({ id: 'm:/', group: 'Otvoriť v appke', title: 'Domov appky', sub: '/', icon: 'upright', rank: 61, run: go('/') })
    if (V) {
      const notes = vault.ix ? vault.ix.notes : [...V.recent, ...V.hubs]
      const dup = new Set()
      for (const n of notes) { if (dup.has(n.path)) continue; dup.add(n.path); out.push({ id: 'n:' + n.path, group: 'Obsidian', title: n.title, sub: n.path, icon: 'gem', rank: 70, keys: (n.tags || []).join(' '), run: go(obsidianUrl(V.name, n.path)) }) }
    }
    return out
  }, [tasks, data.board, signals, V, vault.ix, theme, canWrite, nAttention])   // eslint-disable-line react-hooks/exhaustive-deps

  const briefCards = useMemo(() => [
    ...attention.map((t) => ({ badge: statusOf(t.status).label, tone: statusOf(t.status).tone, title: t.title, sub: `${name(t.assigneeId)} · ${t.summary}`, next: t.nextAction, action: 'Otvoriť úlohu', run: () => open({ kind: 'task', id: t.taskId }) })),
    ...signals.map((s) => ({ badge: s.badge, tone: s.tone, title: s.title, sub: s.sub, action: 'Otvoriť v appke', href: s.href })),
  ], [attention, signals])   // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- páska, log a štart: len skutočné hodnoty ---------- */
  const nf = (v) => new Intl.NumberFormat('sk-SK').format(v)
  const tape = useMemo(() => {
    const t = [], add = (label, value, tone) => { if (value != null && value !== '') t.push({ label, value: String(value), tone }) }
    add('PRÍCHODY', kpis.arrivals != null ? nf(kpis.arrivals) : null); add('ODCHODY', kpis.departures != null ? nf(kpis.departures) : null); add('HOSTIA V BYTOCH', kpis.guests != null ? nf(kpis.guests) : null)
    add('OBSADENOSŤ', kpis.occupancy != null ? kpis.occupancy + ' %' : null); add('NAJBLIŽŠÍCH 7 DNÍ', kpis.next7 != null ? nf(kpis.next7) + ' príchodov' : null)
    add('NOCI TENTO MESIAC', kpis.monthNights != null ? nf(kpis.monthNights) : null); add('POBYTY TENTO ROK', kpis.staysYtd != null ? nf(kpis.staysYtd) : null)
    add('LEADY PO LEHOTE', kpis.overdueLeads != null ? nf(kpis.overdueLeads) : null, kpis.overdueLeads ? 'hot' : ''); add('OTVORENÉ OPRAVY', kpis.openRepairs != null ? nf(kpis.openRepairs) : null, kpis.openRepairs ? 'hot' : '')
    add('ÚLOHY V REGISTRI', nf(tasks.length)); add('ZDROJE NAŽIVO', liveSources + ' / ' + data.sources.length)
    if (V) add('OBSIDIAN', nf(V.notes) + ' poznámok · ' + nf(V.links) + ' prepojení')
    return t
  }, [kpis, tasks.length, liveSources, data.sources.length, V])   // eslint-disable-line react-hooks/exhaustive-deps
  const logLines = useMemo(() => {
    const tm = (iso) => new Date(iso).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: TZ }), L = []
    for (const s of data.sources) {
      if (s.status === 'error' && s.lastErrorAt) L.push({ at: s.lastErrorAt, time: tm(s.lastErrorAt), tag: s.name, text: '✗ ' + (s.lastError || 'chyba'), tone: 'bad' })
      else if (s.status === 'live' && s.lastOkAt) L.push({ at: s.lastOkAt, time: tm(s.lastOkAt), tag: s.name, text: '✓ naživo', tone: 'ok' })
    }
    for (const u of data.updates) L.push({ at: u.at, time: tm(u.at), tag: name(u.actorId), text: OP_LABEL[OP_OF[u.status]] + ': ' + u.summary, tone: u.status === 'blocked' ? 'bad' : '' })
    for (const g of signals) L.push({ at: new Date(now).toISOString(), time: tm(now), tag: g.badge, text: '! ' + g.title, tone: 'warn' })
    return L.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10)
  }, [data.sources, data.updates, signals, now])   // eslint-disable-line react-hooks/exhaustive-deps
  const bootLines = useMemo(() => {
    const dots = (label) => ({ label })
    const L = [{ ...dots('identita'), value: data.me ? data.me.name : 'neprihlásený', tone: 'ok' }, { ...dots('register práce'), value: !data.ready ? 'NIE JE ZALOŽENÝ' : `${tasks.length} úloh`, tone: data.ready ? 'ok' : 'bad' }]
    for (const s of data.sources.filter((x) => ['guesty', 'crm', 'hubspot', 'asana', 'maintenance', 'finance', 'obsidian'].includes(x.key))) L.push({ ...dots(s.name.toLowerCase()), value: SOURCE_STATUS[s.status].label.toUpperCase(), tone: s.status === 'live' ? 'ok' : s.status === 'error' ? 'bad' : 'warn' })
    L.push({ ...dots('zdroje naživo'), value: `${liveSources} / ${data.sources.length}`, tone: 'ok' }, { ...dots('čaká na teba'), value: String(nAttention), tone: nAttention ? 'warn' : 'ok' })
    return L
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- spoločné riadky ---------- */
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
      <span className={'li-dot ' + a.tone + (a.state === 'Pracuje' ? ' pulse' : '')} aria-label={a.state} title={a.state}></span>
    </button>
  )
  const liveRow = (r, i, icon = 'upright') => {
    const inner = <><span className={'li-avatar ' + (r.tone === 'red' || r.tone === 'orange' ? 'orange' : '')}><Icon name={icon} /></span><span className="li-body"><strong>{r.title}</strong>{r.sub && <small>{r.sub}</small>}</span>{r.badge ? <Badge tone={r.tone || ''}>{r.badge}</Badge> : <Icon name="chevron" size={14} />}</>
    return r.href ? <a key={i} className="li-row" href={r.href} {...(r.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a> : <div key={i} className="li-row">{inner}</div>
  }
  const signalRow = (r, i) => (
    <a key={'s' + i} className="li-priority" href={r.href}>
      <span className="li-avatar orange"><Icon name="alert" /></span>
      <div><Badge tone={r.tone}>{r.badge}</Badge><h3>{r.title}</h3><p>{r.sub}</p></div>
      <Icon name="chevron" size={14} />
    </a>
  )
  const noteRow = (n, extra) => <a key={n.path} className="li-row" href={obsidianUrl(V.name, n.path)} title="Otvoriť v Obsidiane"><span className="li-avatar"><Icon name="gem" /></span><span className="li-body"><strong>{n.title}</strong><small>{n.path}</small></span>{extra ? <Badge tone="gray">{extra}</Badge> : <Icon name="upright" size={14} />}</a>
  const emptyRegister = <p className="li-empty">V registri zatiaľ nie je žiadna úloha.{canWrite ? ' Zadaj prvú tlačidlom „Zadať úlohu“ alebo klávesom ⌘K.' : ''}</p>
  const sourcesOf = (a) => data.sources.filter((s) => (a.sources || []).includes(s.key))
  const sourceList = (a, title) => (<>
    {sourcesOf(a).length > 0 && <Panel title={title}>{sourcesOf(a).map((s) => <div key={s.key} className="li-connection"><div>{s.name}<small>{s.note || s.scope}</small>{s.lastOkAt && <small>Posledný úspech: {fmt(s.lastOkAt)}</small>}{s.lastError && <small className="li-error">{s.lastError}</small>}</div><Badge tone={SOURCE_STATUS[s.status].tone}>{SOURCE_STATUS[s.status].label}</Badge></div>)}</Panel>}
    {a.links && <div style={{ marginTop: 15 }}><Panel title="Otvoriť v appke">{a.links.map(([label, href]) => <a key={href} className="li-row" href={href}><span className="li-avatar"><Icon name="upright" /></span><span className="li-body"><strong>{label}</strong><small>Existujúci modul LIVE-IN appky</small></span><Icon name="chevron" size={14} /></a>)}</Panel></div>}
  </>)

  /* ---------- oblasti ---------- */
  function Overview() {
    const hasDay = kpis.arrivals != null
    return (<>
      <section className="li-hero hq-hero">
        <i className="hq-sun" aria-hidden="true" />
        <div>
          <p className="li-eyebrow">{today.toLocaleUpperCase('sk')} · <Clock /></p>
          <h2>{hasDay ? <>Dnes <em><Num value={kpis.arrivals} /></em> {plural(kpis.arrivals, 'príchod', 'príchody', 'príchodov')}<br />a <em><Num value={kpis.departures} /></em> {plural(kpis.departures, 'odchod', 'odchody', 'odchodov')}.</> : <>Firma má smer.<br />Ty máš prehľad.</>}</h2>
          <p>{!data.ready ? 'Register práce ešte nie je v databáze založený.' : nAttention ? `${nAttention} ${nAttention === 1 ? 'vec čaká' : nAttention < 5 ? 'veci čakajú' : 'vecí čaká'} na tvoju pozornosť.` : 'Nič nečaká na tvoje rozhodnutie.'}{kpis.next7 != null ? ` Najbližších 7 dní: ${kpis.next7} ${plural(kpis.next7, 'príchod', 'príchody', 'príchodov')}.` : ''}</p>
          <div className="hq-hero-act">
            <button className="li-button orange" onClick={() => setBrief(true)}><Icon name="list" size={14} />Prejsť priority{nAttention ? ` (${nAttention})` : ''}</button>
            <button className="li-button" onClick={() => nav('map')}><Icon name="graph" size={14} />Mapa firmy</button>
            <button className="li-button" onClick={talk}><Icon name="mic" size={14} />Povedz to</button>
          </div>
        </div>
        <div className="hq-kpis">
          <Ring value={kpis.occupancy} label="obsadenosť" />
          <div className="k"><strong><Num value={kpis.guests} /></strong><small>hostí v bytoch</small></div>
          <div className="k"><strong><Num value={kpis.listings} /></strong><small>nehnuteľností</small></div>
          <div className="k"><strong><Num value={kpis.avgStay} decimals={1} /></strong><small>nocí priemerný pobyt</small></div>
        </div>
      </section>
      <section className="li-metrics" aria-label="Prehľad dňa">
        <button className="li-glass li-metric" onClick={() => nav('attention')}><span className="li-label"><Icon name="dot" size={12} />Moja pozornosť</span><div className="li-number"><Num value={nAttention} /></div><small>Úlohy z registra a signály z appky</small></button>
        <button className="li-glass li-metric" onClick={() => nav('agents')}><span className="li-label"><Icon name="users" size={12} />Rozpracované úlohy</span><div className="li-number"><Num value={data.openCount || 0} /></div><small>Ľudia a AI · z registra práce</small></button>
        <button className="li-glass li-metric" onClick={() => nav('visits')}><span className="li-label"><Icon name="calendar" size={12} />Obhliadky</span><div className="li-number"><Num value={live && live.overview.calendarCount != null ? live.overview.calendarCount : null} /></div><small>{live && live.overview.calendarCount != null ? 'Obhliadky z CRM · 7 dní' : 'Kalendár nie je pripojený'}</small></button>
        <button className="li-glass li-metric" onClick={() => nav('connections')}><span className="li-label"><Icon name="unplug" size={12} />Zdroje naživo</span><div className="li-number"><Num value={liveSources} /><span className="li-mini"> / {data.sources.length}</span></div><small>Ostatné čakajú na pripojenie</small></button>
      </section>
      <div className="li-columns">
        <div className="li-stack">
          <Panel title="Potrebuje tvoju pozornosť" link="Všetky" onLink={() => nav('attention')}>{attention.slice(0, 3).map(taskRow)}{signals.slice(0, 4).map(signalRow)}{!nAttention && <p className="li-empty">Žiadne blokovanie, výsledok na kontrolu ani signál z appky.</p>}</Panel>
          <Panel title="Kto na čom pracuje" link="Celý tím" onLink={() => nav('agents')}>{data.board.length ? data.board.slice(0, 4).map(actorRow) : <p className="li-empty">Zatiaľ žiadni vykonávatelia.</p>}</Panel>
          <Panel title="Spoločné aktualizácie" link="Detail" onLink={() => nav('agents')}>
            {data.updates.length ? data.updates.slice(0, 5).map((u) => (
              <div key={u.eventId} className="li-update"><Icon name={UPDATE_ICON[u.status] || 'dot'} size={14} /><div><p><strong>{name(u.actorId)}</strong> · {OP_LABEL[OP_OF[u.status]]}: {u.summary}</p><small>{ago(u.at, now)} · <button className="li-button ghost" style={{ minHeight: 0, padding: 0, fontSize: 9 }} onClick={() => open({ kind: 'task', id: u.taskId })}>{u.title}</button></small></div></div>
            )) : <p className="li-empty">Žiadne udalosti v registri.</p>}
          </Panel>
        </div>
        <div className="li-stack">
          {charts.week && <Panel title="Príchody a odchody · 7 dní" link="Prevádzka" onLink={() => nav('operations')}><WeekBars data={charts.week} /></Panel>}
          <Panel title={(live && live.overview.calendarTitle) || 'Dnes v kalendári'} link="Obhliadky" onLink={() => nav('visits')}>{live && live.overview.calendar.length ? live.overview.calendar.map((r, i) => <div key={i} className="li-agenda"><span className="li-clock">{r.clock}</span><a className={r.tone === 'orange' ? 'attention' : ''} href={r.href}><strong>{r.title}</strong><small>{r.sub}</small></a></div>) : <p className="li-empty">{live ? 'V CRM nie je na najbližších 7 dní naplánovaná obhliadka.' : 'Termíny sa nepodarilo načítať.'}</p>}</Panel>
          <Panel title="Obsidian" link="Mapa" onLink={() => nav('map')}>
            {V ? (<><div className="hq-mini-stats"><div><strong><Num value={V.notes} /></strong><small>poznámok</small></div><div><strong><Num value={V.links} /></strong><small>prepojení</small></div><div><strong>{V.lastChange ? fmtDay(V.lastChange) : '–'}</strong><small>posledná zmena</small></div></div>{V.recent.slice(0, 3).map((n) => noteRow(n))}</>) : <p className="li-empty">Index trezoru ešte nebol odoslaný do ústredne.</p>}
          </Panel>
          <Panel title="Živý log" link="Prepojenia" onLink={() => nav('connections')} className="hq-console-panel"><Console lines={logLines} /></Panel>
          <Panel title="Marketing v pohybe" link="Marketing" onLink={() => nav('marketing')}>{live && live.overview.marketing.length ? live.overview.marketing.map((r, i) => liveRow(r, i, 'play')) : <p className="li-empty">Údaje o obsahu sa nepodarilo načítať.</p>}</Panel>
        </div>
      </div>
    </>)
  }

  function Agents() {
    const list = data.board.filter((a) => filter === 'all' || a.runtime === filter || (filter === 'blocked' && (a.blocked || a.waiting)))
    return (<>
      <div className="li-flex li-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="li-tabs" style={{ margin: 0 }} aria-label="Filter tímu">{[['all', 'Celý tím'], ['GPT', 'GPT'], ['Claude', 'Claude'], ['Človek', 'Ľudia'], ['blocked', 'Čakajú na vstup']].map(([v, l]) => <button key={v} className={filter === v ? 'active' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}</div>
        <div className="li-flex" style={{ gap: 8 }}>
          <div className="li-tabs" style={{ margin: 0 }} aria-label="Zobrazenie úloh"><button className={agentsView === 'list' ? 'active' : ''} aria-pressed={agentsView === 'list'} onClick={() => setAgentsView('list')}><Icon name="rows" size={13} /> Zoznam</button><button className={agentsView === 'board' ? 'active' : ''} aria-pressed={agentsView === 'board'} onClick={() => setAgentsView('board')}><Icon name="board" size={13} /> Tabuľa</button></div>
          {canWrite && <button className="li-button primary" onClick={() => open({ kind: 'assign' })}><Icon name="plus" size={14} />Zadať úlohu</button>}
        </div>
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
      <div style={{ marginTop: 15 }}>
        {agentsView === 'board' ? (
          <div className="hq-board" aria-label="Úlohy podľa stavu">
            {BOARD.map(([id, label, st]) => { const col = tasks.filter((t) => st.includes(t.status)); return (
              <section key={id} className={'li-glass col ' + id}><h3>{label}<b>{col.length}</b></h3>
                {col.map((t) => <button key={t.taskId} className="hq-kcard" onClick={() => open({ kind: 'task', id: t.taskId })}><strong>{t.title}</strong><small>{name(t.assigneeId)} · {ago(t.lastAt, now)}</small></button>)}
                {!col.length && <p className="li-mini">Nič.</p>}
              </section>) })}
          </div>
        ) : <Panel title="Všetky úlohy v registri">{tasks.length ? tasks.map(taskRow) : emptyRegister}</Panel>}
      </div>
      <p className="li-sub" style={{ marginTop: 12 }}>Stav „Pracuje“ znamená, že vykonávateľ ohlásil krok za posledných 6 hodín. Register nevie, či jeho runtime práve beží. Stav úlohy mení len jej vykonávateľ vlastnou udalosťou, preto sa karty na tabuli nedajú presúvať.</p>
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
              {s.lastError && <small className="li-error">Posledná chyba{s.lastErrorAt ? ` (${fmt(s.lastErrorAt)})` : ''}: {s.lastError}</small>}
              {s.note && <small>{s.note}</small>}
            </div>
            <Badge tone={SOURCE_STATUS[s.status].tone}>{SOURCE_STATUS[s.status].label}</Badge>
          </div>
        ))}
        {data.quarantine > 0 && <p className="li-sub" style={{ marginTop: 12 }}>Odmietnuté alebo oneskorené udalosti v karanténe: {data.quarantine}. Neovplyvnili stav úloh.</p>}
      </Panel>
    )
  }

  function AreaPage() {
    const L = live && live.areas[area.id]
    const hasLive = !!(L && (L.metrics.length || L.lists.length))
    return (<>
      {hasLive && L.metrics.length > 0 && <section className="li-metrics" aria-label="Živé údaje oblasti">{L.metrics.map((m, i) => <a key={i} className="li-glass li-metric" href={m.href || '#'}><span className="li-label">{m.label}</span><div className="li-number">{m.value}</div><small>{m.note}</small></a>)}</section>}
      {area.id === 'operations' && (charts.week || charts.channels) && <div className="li-columns" style={{ marginBottom: 15 }}>
        {charts.week && <Panel title="Príchody a odchody · 7 dní"><WeekBars data={charts.week} /></Panel>}
        {(charts.channels || charts.cities) && <Panel title="Kanály a mestá">{charts.channels && <Split parts={charts.channels} />}{charts.cities && <HBars rows={charts.cities} />}</Panel>}
      </div>}
      {area.id === 'properties' && charts.funnel && <div style={{ marginBottom: 15 }}><Panel title="Cesta leadu" link="CRM" href="/crm"><HBars rows={charts.funnel} href="/crm" /></Panel></div>}
      {hasLive && L.lists.map((l, i) => <div key={i} style={{ marginBottom: 15 }}><section className="li-glass"><div className="li-panel-head"><h2>{l.title}</h2>{l.link && <a className="li-button ghost" href={l.link[1]}>{l.link[0]} <Icon name="upright" size={14} /></a>}</div>{l.rows.length ? l.rows.map((r, j) => liveRow(r, j)) : <p className="li-empty">{l.empty || 'Nič na zobrazenie.'}</p>}</section></div>)}
      {L && L.notes.map((n, i) => <p key={i} className="li-sub" style={{ margin: '0 0 12px' }}>{n}</p>)}
      {!hasLive && <p className="li-sub" style={{ marginBottom: 14 }}>Oblasť zostáva v ústredni, ale nezobrazuje žiadne čísla ani prípady, kým jej zdroje neposielajú overené údaje.</p>}
      {sourceList(area, hasLive ? 'Odkiaľ tieto údaje sú' : 'Táto oblasť zatiaľ nie je pripojená')}
    </>)
  }

  function Knowledge() {
    const q = fold(noteQuery).split(' ').filter(Boolean)
    const hits = q.length && vault.ix ? vault.ix.notes.filter((n) => { const h = fold(n.title + ' ' + n.path + ' ' + n.tags.join(' ')); return q.every((t) => h.includes(t)) }).slice(0, 40) : null
    return (<>
      {V ? (<>
        <section className="li-metrics" aria-label="Obsidian trezor">
          <div className="li-glass li-metric"><span className="li-label"><Icon name="gem" size={12} />Poznámky</span><div className="li-number"><Num value={V.notes} /></div><small>{V.name}</small></div>
          <div className="li-glass li-metric"><span className="li-label"><Icon name="graph" size={12} />Prepojenia</span><div className="li-number"><Num value={V.links} /></div><small>{V.unresolved} odkazov na neexistujúce poznámky</small></div>
          <div className="li-glass li-metric"><span className="li-label"><Icon name="calendar" size={12} />Posledná zmena</span><div className="li-number hq-small">{V.lastChange ? fmtDay(V.lastChange) : '–'}</div><small>čas úpravy súboru v trezore</small></div>
          <button className="li-glass li-metric" onClick={() => nav('map')}><span className="li-label"><Icon name="target" size={12} />Mapa trezoru</span><div className="li-number hq-small">Otvoriť ↗</div><small>{V.source === 'disk' ? 'číta sa priamo z disku' : 'stav zo synchronizácie ' + fmt(V.syncedAt)}</small></button>
        </section>
        <Panel title="Hľadať v Obsidiane" className="hq-notes">
          <label className="li-search"><Icon name="search" size={14} /><input value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="Názov poznámky, priečinok alebo štítok…" aria-label="Hľadať poznámky" /></label>
          {hits ? (hits.length ? hits.map((n) => noteRow(n, n.mtime ? fmtDay(n.mtime) : '')) : <p className="li-empty">Žiadna poznámka nezodpovedá.</p>) : q.length ? <p className="li-empty">{vault.status === 'error' ? 'Index trezoru sa nepodarilo načítať.' : 'Načítavam index trezoru…'}</p> : <p className="li-sub" style={{ marginTop: 10 }}>Hľadá sa v názvoch, cestách a štítkoch. Text poznámok v ústredni nie je; kliknutie otvorí poznámku v Obsidiane na tomto zariadení.</p>}
        </Panel>
        <div className="li-columns" style={{ marginTop: 15 }}>
          <div className="li-stack"><Panel title="Naposledy zmenené">{V.recent.map((n) => noteRow(n, fmtDay(n.mtime)))}</Panel></div>
          <div className="li-stack">
            <Panel title="Najprepojenejšie poznámky">{V.hubs.map((n) => noteRow(n, n.degree + ' prepojení'))}</Panel>
            <Panel title="Priečinky trezoru"><HBars rows={V.groups.map((g) => ({ label: g.name, value: g.count }))} /></Panel>
          </div>
        </div>
      </>) : <Panel title="Obsidian zatiaľ nie je v ústredni"><p className="li-sub">Trezor je na počítači, server k nemu priamo nevidí. Index (názvy, štítky a prepojenia poznámok, bez textu) sem posiela skript <code>tools/ustredna/vault-sync.mjs</code>.</p></Panel>}
      {live && live.areas.knowledge && live.areas.knowledge.notes.map((n, i) => <p key={i} className="li-sub" style={{ margin: '12px 0' }}>{n}</p>)}
      <div style={{ marginTop: 15 }}>{sourceList(area, 'Odkiaľ tieto údaje sú')}</div>
    </>)
  }

  function MapPage() {
    return (<>
      <div className="li-flex li-between hq-map-head">
        <div className="li-tabs" style={{ margin: 0 }} aria-label="Čo mapa ukazuje">{[['all', 'Všetko'], ['firma', 'Firma'], ['obsidian', 'Obsidian']].map(([v, l]) => <button key={v} className={graphMode === v ? 'active' : ''} aria-pressed={graphMode === v} onClick={() => setGraphMode(v)}>{l}</button>)}</div>
        <span className="li-mini">{graph.nodes.length} uzlov · {graph.links.length} spojení{V ? '' : ' · Obsidian nie je pripojený'}{V && vault.status === 'loading' ? ' · načítavam trezor…' : ''}{vault.status === 'error' ? ' · trezor sa nepodarilo načítať' : ''}</span>
      </div>
      {graph.nodes.length ? <Graph graph={graph} onOpen={openNode} renderInfo={nodeInfo} /> : <p className="li-empty">{vault.status === 'loading' ? 'Načítavam trezor…' : 'Zatiaľ nie je čo zobraziť.'}</p>}
      <p className="li-sub" style={{ marginTop: 12 }}>Firemná časť je z registra práce a zo zdravia zdrojov. Časť Obsidian sú poznámky tímového trezoru a ich odkazy; priečinky sú krúžky. Text poznámok v mape nie je.</p>
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

  const renders = { overview: Overview, agents: Agents, connections: Connections, knowledge: Knowledge, map: MapPage, attention: () => <><Panel title="Rozhodnutia a otvorené kroky" link="Brífing" onLink={() => setBrief(true)}>{attention.length ? attention.map(taskRow) : <p className="li-empty">{tasks.length ? 'V registri práce nič nečaká na tvoje rozhodnutie.' : 'V registri práce zatiaľ nie je žiadna úloha.'}</p>}</Panel>{signals.length > 0 && <div style={{ marginTop: 15 }}><Panel title="Signály z appky">{signals.map(signalRow)}</Panel></div>}</> }
  const Content = renders[page] || AreaPage
  const dTask = detail && detail.kind === 'task' ? byId[detail.id] : null
  const dActor = detail && detail.kind === 'actor' ? data.board.find((a) => a.id === detail.id) : null

  return (
    <div id="livein-hq" ref={root} data-theme={theme} data-page={page} aria-label="LIVE-IN firemná ústredňa" onPointerMove={glow}>
      <div className="hq-aurora" aria-hidden="true"><i /><i /><i /></div>
      <Rain active={theme === 'night'} />
      <div className="hq-scan" aria-hidden="true" />
      <div className="li-shell">
        <aside className="li-side">
          <div className="li-brand"><Logo /><small>FIREMNÁ ÚSTREDŇA</small><a className="li-home" href="/">← Späť do appky</a></div>
          <nav className="li-nav" aria-label="Hlavná navigácia ústredne">
            {AREAS.filter((a) => !a.extra).map((a) => <button key={a.id} className={page === a.id ? 'active' : ''} aria-current={page === a.id ? 'page' : undefined} onClick={() => nav(a.id)}><Icon name={a.icon} />{a.nav}{a.id === 'attention' && <span className={'li-count' + (nAttention ? ' hot' : '')}>{nAttention}</span>}</button>)}
            <div className="li-side-label">ĎALŠIE OBLASTI</div>
            {AREAS.filter((a) => a.extra).map((a) => <button key={a.id} className={'extra' + (page === a.id ? ' active' : '')} aria-current={page === a.id ? 'page' : undefined} onClick={() => nav(a.id)}><Icon name={a.icon} />{a.nav}</button>)}
          </nav>
          <div className="li-side-bottom"><p>Jeden tím.<br />Spoločný obraz firmy.</p>{data.me && <div className="li-person"><span className="li-avatar orange">{data.me.initials}</span><div><strong>{data.me.name}</strong><small>LIVE-IN</small></div></div>}</div>
        </aside>
        <main className="li-main">
          <header className="li-top hq-top">
            <button type="button" className="li-search hq-cmd" onClick={() => setPalette({ open: true, initial: '' })} aria-label="Otvoriť paletu príkazov"><Icon name="search" size={14} /><span>Hľadaj alebo zadaj príkaz…</span><kbd>⌘ K</kbd></button>
            <button type="button" className={'hq-live' + (busy ? ' busy' : '')} onClick={refresh} title="Obnoviť teraz. Údaje sa obnovujú samy každú minútu."><i /><b>{!data.ready ? 'REGISTER NIE JE ZALOŽENÝ' : data.local ? 'LOKÁLNE' : 'NAŽIVO'}</b><Since at={loadedAt} /></button>
            <button type="button" className="hq-icon" onClick={() => applyTheme(theme === 'night' ? 'day' : 'night')} aria-label={theme === 'night' ? 'Prepnúť na denný režim' : 'Prepnúť na nočný režim'} title={theme === 'night' ? 'Denný režim' : 'Matrix režim'}><Icon name={theme === 'night' ? 'sun' : 'moon'} size={15} /></button>
            <button type="button" className="hq-icon mic" onClick={talk} aria-label="Hlasový príkaz" title="Hlasový príkaz"><Icon name="mic" size={15} /></button>
          </header>
          <Ticker items={tape} />
          <div className="li-page-head">
            <div><p className="li-eyebrow">LIVE-IN / {area.nav.toLocaleUpperCase('sk')}</p><h1><Decode text={page === 'overview' ? greeting : area.title} /></h1><p className="li-sub">{area.sub}</p></div>
            {canWrite ? <button className="li-button" onClick={() => open({ kind: 'assign' })}><Icon name="plus" size={14} />Zadať úlohu</button> : null}
          </div>
          {readOnlyNote && <div className="li-toast" role="status"><span>{readOnlyNote}</span></div>}
          {!data.ready && <div className="li-toast" role="status"><span>Register práce ešte nie je v databáze. Obrazovka preto neukazuje žiadne úlohy.</span></div>}
          {toast && <div className="li-toast" role="status"><span>{toast}</span><button onClick={() => setToast('')}>Zavrieť</button></div>}
          {detail && (
            <section className="li-detail" role="dialog" aria-modal="false" aria-label="Detail položky">
              <div className="li-flex li-between"><span className="li-eyebrow">LIVE-IN · DETAIL</span><button className="li-close" aria-label="Zavrieť detail" onClick={() => setDetail(null)}><Icon name="x" size={15} /></button></div>
              {dTask && TaskDetail({ t: dTask })}
              {detail.kind === 'task' && !dTask && <p style={{ marginTop: 14 }}>Úloha sa načítava…</p>}
              {detail.kind === 'assign' && AssignForm()}
              {dActor && <><Badge tone={dActor.tone}>{dActor.state}</Badge><h2>{dActor.name}</h2><p>{dActor.role}</p><dl><dt>Pracuje cez</dt><dd>{dActor.runtime || 'Tím'}</dd><dt>Posledný signál</dt><dd>{dActor.lastAt ? ago(dActor.lastAt, now) : 'zatiaľ žiadny'}</dd><dt>Otvorené úlohy</dt><dd>{dActor.open}</dd></dl>{canWrite && dActor.kind !== 'integration' && <div className="li-detail-footer"><button className="li-button primary" onClick={() => open({ kind: 'assign', to: dActor.id })}>Zadať úlohu</button></div>}</>}
              {error && <p className="li-detail-note li-error" role="alert">{error}</p>}
            </section>
          )}
          <div id="li-content" key={page} className="hq-enter">{Content()}</div>
          <footer className="li-footer"><span>{today} · {data.local ? 'lokálny register na tomto počítači' : 'register práce'} · <kbd>⌘K</kbd> príkazy · <kbd>/</kbd> hľadať</span><button className="li-button ghost" onClick={() => nav('connections')}><Icon name="info" size={14} />{liveSources ? `Naživo: ${liveSources} z ${data.sources.length} zdrojov` : 'Žiadny zdroj zatiaľ nie je naživo'}</button></footer>
        </main>
      </div>
      <Palette open={palette.open} initial={palette.initial} items={items} onClose={() => setPalette({ open: false, initial: '' })} onUnknown={command} />
      <Briefing open={brief} onClose={() => setBrief(false)} cards={briefCards} />
      {boot === 'run' && <Boot lines={bootLines} onDone={bootDone} />}
      {voiceOpen && (
        <div className="hq-voice" role="dialog" aria-label="Hlasový príkaz">
          <button type="button" className={'orb' + (voice.listening ? ' on' : '')} onClick={() => (voice.listening ? voice.stop() : voice.start())} aria-label={voice.listening ? 'Zastaviť počúvanie' : 'Počúvať znova'}><Icon name="mic" size={22} /></button>
          <div>
            <strong>{voice.error ? voice.error : voice.listening ? (voice.text || 'Počúvam…') : heard ? `„${heard}“` : 'Ťukni na mikrofón a hovor.'}</strong>
            <small>Skús: „Otvor prevádzku“, „Zadaj úlohu Codexu: …“, „Nájdi …“, „Nočný režim“. Reč rozpoznáva tvoj prehliadač (Chrome posiela zvuk Googlu); zápis vždy potvrdíš tlačidlom.</small>
          </div>
          <button type="button" className="li-close" aria-label="Zavrieť" onClick={() => { voice.stop(); setVoiceOpen(false) }}><Icon name="x" size={15} /></button>
        </div>
      )}
    </div>
  )
}
