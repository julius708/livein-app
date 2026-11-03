'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as M from '@/lib/economy-math'
import { Overview, CompareView, ApartmentsView, MapView, ForecastView, BankView, InsightsView, DetailDialog, QualityDialog } from './views'

const VIEWS = [
  { id: 'overview', label: 'Prehľad', icon: '📊' },
  { id: 'compare', label: 'Porovnanie', icon: '⇄' },
  { id: 'apartments', label: 'Byty', icon: '🏢' },
  { id: 'map', label: 'Mapa', icon: '📍' },
  { id: 'forecast', label: 'Výhľad', icon: '🔭' },
  { id: 'bank', label: 'Banka', icon: '🏦' },
  { id: 'insights', label: 'Analýza', icon: '🧠' },
]
const NO_DOCK = new Set(['bank', 'insights'])
const fmtTime = (s) => (s ? new Date(s).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' }) : '—')

/** Ekonomika bytov – klientská časť: načíta snímok, drží výber obdobia a filtrov, kreslí pohľady. */
export default function Economy({ name = '', initial = null }) {
  const [snap, setSnap] = useState(initial)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(!initial)
  const [view, setView] = useState('overview')
  const [presetId, setPresetId] = useState('history')
  const [a, setA] = useState({ from: '', to: '' })
  const [b, setB] = useState({ from: '', to: '' })
  const [compareOn, setCompareOn] = useState(false)
  const [normalize, setNormalize] = useState(true)
  const [cohort, setCohort] = useState(false)
  const [filters, setFilters] = useState(M.EMPTY_FILTERS)
  const [detailId, setDetailId] = useState(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [dockOpen, setDockOpen] = useState(true)
  const mounted = useRef(true)
  const D = snap && snap.data

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      const r = await fetch('/api/ekonomika/snapshot', { cache: 'no-store', credentials: 'include' })
      const j = await r.json().catch(() => null)
      if (!mounted.current) return
      if (!r.ok || !j || !j.ok) { setErr(j && j.error === 'noaccess' ? 'Tento účet nemá prístup k ekonomike. Prístup k číslam firmy má len vedenie.' : 'Údaje sa teraz nepodarilo načítať. Skús to o chvíľu.'); return }
      setErr('')
      setSnap(j)
    } catch { if (mounted.current) setErr('Spojenie zlyhalo. Posledné načítané údaje zostávajú zobrazené.') } finally { if (mounted.current) setLoading(false) }
  }
  useEffect(() => { mounted.current = true; if (!initial) load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, 300000); return () => { mounted.current = false; clearInterval(t) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // východiskové obdobia po načítaní snímku
  useEffect(() => {
    if (!D) return
    const [x, y] = M.preset(D, presetId === 'custom' ? 'history' : presetId)
    setA((cur) => (cur.from && M.range(D, cur.from, cur.to) ? cur : { from: M.dateOf(D, x), to: M.dateOf(D, y) }))
    const e = M.dayOf(D, D.historicalTo)
    setB((cur) => (cur.from ? cur : { from: M.dateOf(D, Math.max(0, e - 59)), to: M.dateOf(D, Math.max(0, e - 30)) }))
  }, [D]) // eslint-disable-line react-hooks/exhaustive-deps
  // aktívna záložka nech je na telefóne vždy vidieť
  useEffect(() => { const el = document.querySelector('.eko-tabs button.on'); if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [view])
  // evidencia otvorených sekcií (bez obsahu)
  useEffect(() => { if (!D) return; const key = 'li-usage:/ekonomika#' + view, now = Date.now(); try { if (now - Number(sessionStorage.getItem(key) || 0) < 30000) return; sessionStorage.setItem(key, String(now)) } catch {} fetch('/api/usage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 'economy_' + view }), keepalive: true }).catch(() => {}) }, [view, !!D])

  const model = useMemo(() => {
    if (!D) return null
    const intervalA = a.from ? M.range(D, a.from, a.to) : null
    const intervalB = b.from ? M.range(D, b.from, b.to) : null
    const comparing = compareOn && !!intervalB && !!intervalA
    const props = D.listings.filter((p) => M.matches(p, filters))
    if (!intervalA) return { intervalA, intervalB, comparing, props, rows: [], rowsB: [], total: null }
    let rows = props.map((p) => M.stats(p, intervalA))
    let rowsB = comparing ? props.map((p) => M.stats(p, intervalB)) : []
    if (comparing && cohort) { const keep = rows.map((r, i) => r.nights > 0 && rowsB[i].nights > 0); rows = rows.filter((_, i) => keep[i]); rowsB = rowsB.filter((_, i) => keep[i]) }
    const total = M.totals(rows)
    const prevInterval = M.previous(D, intervalA)
    const rowsPrev = prevInterval ? rows.map((r) => M.stats(r.p, prevInterval)) : null
    const totalPrev = rowsPrev ? M.totals(rowsPrev) : null
    const months = M.monthly(D, rows, intervalA).map((m) => ({ ...m, label: M.monthLabel(m.key), future: M.dayOf(D, m.key + '-01') >= M.todayIndex(D) }))
    const ch = M.channels(rows, intervalA)
    const chTotal = Object.values(ch).reduce((x, y) => x + y, 0)
    const channelParts = Object.entries(ch).sort((x, y) => y[1] - x[1]).map(([name, cents]) => ({ name, label: M.channelLabel(name), cents }))
    const weekly = M.series(rows, intervalA, 7).map((s) => s.cents)
    return { intervalA, intervalB, comparing, props, rows, rowsB, total, prevInterval, rowsPrev, totalPrev, months, channelParts, chTotal, weekly }
  }, [D, a, b, compareOn, cohort, filters])

  const opts = useMemo(() => (D ? M.filterOptions(D) : null), [D])
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const applyPreset = (id) => { setPresetId(id); const [x, y] = M.preset(D, id); setA({ from: M.dateOf(D, x), to: M.dateOf(D, y) }) }
  const setDate = (which, k, v) => { if (which === 'a') { setPresetId('custom'); setA((c) => ({ ...c, [k]: v })) } else setB((c) => ({ ...c, [k]: v })) }
  const previousAsB = () => { if (!model || !model.intervalA) return; const p = M.previous(D, model.intervalA); if (!p) return; setB({ from: M.dateOf(D, p[0]), to: M.dateOf(D, p[1]) }); setCompareOn(true) }
  const swap = () => { setA(b); setB(a); setPresetId('custom') }
  const reset = () => { setFilters(M.EMPTY_FILTERS); setCompareOn(false); setCohort(false); setNormalize(true); applyPreset('history') }
  const go = (v) => { setView(v); if (v === 'compare') setCompareOn(true); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const activeFilters = Object.entries(filters).filter(([k, v]) => (k === 'q' ? v.trim() : v !== M.EMPTY_FILTERS[k])).length

  if (err && !D) return <section className="card eko-locked"><h2>Ekonomika</h2><p className="msg err">{err}</p><button className="btn" type="button" onClick={() => load()}>Skúsiť znova</button></section>
  if (!D) return <section className="eko-loading" aria-busy="true"><div className="eko-skel intro" /><div className="eko-skel-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="eko-skel" />)}</div><div className="eko-skel tall" /><p>Načítavam ekonomický snímok…</p></section>

  const first = name.split(' ')[0]
  const stale = Date.now() - Date.parse(D.readAt) > 26 * 3600 * 1000
  const cov = D.coverage || {}
  return (
    <div className="eko">
      <section className="li-page-intro eko-intro">
        <div>
          <span className="li-eyebrow">Ekonomika bytov</span>
          <h1>{first ? `${first}, ` : ''}vaše byty v súvislostiach.</h1>
          <p>Výnosy rezervácií, obsadenosť, kanály, výhľad a bankové toky. Všetko z jedného snímku Guesty, PriceLabs a výpisov, aby vedenie videlo celé portfólio na jednom mieste.</p>
          <div className="eko-chips">
            <span className={'eko-chip' + (stale ? ' warn' : '')}>{stale ? '⚠️ Staršie dáta · ' : '🟢 '}načítané {fmtTime(D.readAt)}</span>
            <span className="eko-chip">{cov.analyticCount || D.listings.filter((p) => p.active).length} aktívnych z {D.listings.length} bytov</span>
            {cov.bookingsInRange && <span className="eko-chip">{M.nf.format(cov.bookingsInRange)} rezervácií v dátach</span>}
            <button type="button" className="eko-chip btnish" onClick={() => setQualityOpen(true)}>Rozsah a kvalita dát ↗</button>
            <button type="button" className="eko-chip btnish" onClick={() => load()} disabled={loading}>{loading ? 'Obnovujem…' : 'Obnoviť'}</button>
          </div>
          {err && <p className="msg err">{err}</p>}
        </div>
      </section>

      <nav className="eko-tabs" aria-label="Sekcie ekonomiky">
        {VIEWS.map((v) => <button key={v.id} type="button" className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}><span aria-hidden="true">{v.icon}</span>{v.label}</button>)}
      </nav>

      {!NO_DOCK.has(view) && (
        <section className={'analysis-dock eko-dock' + (dockOpen ? '' : ' closed')} aria-label="Obdobie a filtre">
          <header className="eko-dock-head">
            <div>
              <span className="eyebrow">Váš výber</span>
              <h2>{view === 'forecast' ? 'Výhľad používa filtre bytov a pevný horizont snímku.' : 'Vyberte obdobie. Nájdite súvislosti.'}</h2>
            </div>
            <div className="eko-dock-actions">
              {activeFilters > 0 && <button type="button" className="eko-link" onClick={reset}>Zrušiť filtre ({activeFilters})</button>}
              <button type="button" className="eko-link" onClick={() => setDockOpen((o) => !o)} aria-expanded={dockOpen}>{dockOpen ? 'Skryť' : 'Upraviť výber'}</button>
            </div>
          </header>
          {dockOpen && view !== 'forecast' && (
            <>
              <div className="presets eko-presets" role="group" aria-label="Rýchle obdobia">
                {M.PRESETS.map((p) => <button key={p.id} type="button" className={presetId === p.id ? 'selected' : ''} onClick={() => applyPreset(p.id)}>{p.id === 'month' ? M.monthLong(D.historicalTo.slice(0, 7)) : p.label}</button>)}
                {presetId === 'custom' && <button type="button" className="selected">Vlastné</button>}
              </div>
              <div className="eko-ranges">
                <fieldset className="range-card period-a"><legend><span className="dot a" />Obdobie A</legend><div className="eko-dates"><label>Od<input type="date" min={D.rangeFrom} max={D.futureTo} value={a.from} onChange={(e) => setDate('a', 'from', e.target.value)} /></label><span>→</span><label>Do<input type="date" min={D.rangeFrom} max={D.futureTo} value={a.to} onChange={(e) => setDate('a', 'to', e.target.value)} /></label></div>{!model.intervalA && <p className="msg err">Skontrolujte obdobie A: „od“ musí byť pred „do“ a celý interval v dostupných dátach {M.prettyDate(D.rangeFrom)} – {M.prettyDate(D.futureTo)}.</p>}</fieldset>
                <fieldset className={'range-card period-b' + (compareOn ? '' : ' off')}><legend><span className="dot b" />Obdobie B<label className="eko-switch"><input type="checkbox" checked={compareOn} onChange={(e) => { setCompareOn(e.target.checked); if (e.target.checked && view === 'overview') setView('compare') }} /> porovnávať</label></legend><div className="eko-dates"><label>Od<input type="date" min={D.rangeFrom} max={D.futureTo} value={b.from} onChange={(e) => setDate('b', 'from', e.target.value)} disabled={!compareOn} /></label><span>→</span><label>Do<input type="date" min={D.rangeFrom} max={D.futureTo} value={b.to} onChange={(e) => setDate('b', 'to', e.target.value)} disabled={!compareOn} /></label></div><div className="eko-mini-actions"><button type="button" className="eko-link" onClick={previousAsB} disabled={!model.intervalA || !M.previous(D, model.intervalA)}>Predchádzajúce obdobie</button><button type="button" className="eko-link" onClick={swap} disabled={!compareOn}>Vymeniť A ⇄ B</button><label className="eko-check"><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> prepočet na deň</label><label className="eko-check"><input type="checkbox" checked={cohort} disabled={!compareOn} onChange={(e) => setCohort(e.target.checked)} /> len byty s nocami v oboch</label></div>{compareOn && !model.intervalB && <p className="msg err">Obdobie B nie je v dostupných dátach.</p>}</fieldset>
              </div>
            </>
          )}
          {dockOpen && (
            <div className="eko-filters">
              <label>Mesto<select value={filters.city} onChange={(e) => setFilter('city', e.target.value)}><option value="all">Všetky mestá</option>{opts.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>Rozsah<select value={filters.scope} onChange={(e) => setFilter('scope', e.target.value)}><option value="active">Aktívne byty</option><option value="all">Celý katalóg</option><option value="inactive">Neaktívne a ukončené</option></select></label>
              <label>Spálne<select value={filters.bedrooms} onChange={(e) => setFilter('bedrooms', e.target.value)}><option value="all">Všetky veľkosti</option>{opts.bedrooms.map((v) => <option key={v} value={v}>{M.optionLabel('bedrooms', v)}</option>)}</select></label>
              <label>Kapacita<select value={filters.capacity} onChange={(e) => setFilter('capacity', e.target.value)}><option value="all">Všetky kapacity</option>{opts.capacity.map((v) => <option key={v} value={v}>{M.optionLabel('capacity', v)}</option>)}</select></label>
              <label>Skupina<select value={filters.group} onChange={(e) => setFilter('group', e.target.value)}><option value="all">Všetky skupiny</option>{opts.group.map((v) => <option key={v} value={v}>{M.optionLabel('group', v)}</option>)}</select></label>
              <label>Model<select value={filters.model} onChange={(e) => setFilter('model', e.target.value)}><option value="all">Všetky modely</option>{opts.model.map((v) => <option key={v} value={v}>{M.optionLabel('model', v)}</option>)}</select></label>
              <label>Kvalita dát<select value={filters.quality} onChange={(e) => setFilter('quality', e.target.value)}><option value="all">Všetky byty</option><option value="overlap">Prekrytia na preverenie</option><option value="clean">Bez prekrytí</option></select></label>
              <label className="grow">Byt alebo ulica<input type="search" placeholder="Napr. Skypark, Gorkého…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></label>
            </div>
          )}
          <p className="eko-summary" aria-live="polite">
            <b>{model.props.length}</b> / {D.listings.length} bytov vo výbere
            {model.intervalA && view !== 'forecast' && <> · obdobie A {M.prettyDate(a.from)} – {M.prettyDate(a.to)} ({M.days(model.intervalA)} dní, {M.rangeNature(D, model.intervalA)})</>}
            {model.comparing && view !== 'forecast' && <> · B {M.prettyDate(b.from)} – {M.prettyDate(b.to)} ({M.days(model.intervalB)} dní)</>}
            {view === 'forecast' && <> · výhľad {M.prettyDate(D.asOf)} – {M.prettyDate(D.futureTo)}</>}
            {' · '}dáta {M.prettyDate(D.rangeFrom)} – {M.prettyDate(D.futureTo)}, história do {M.prettyDate(D.historicalTo)}
          </p>
        </section>
      )}

      {view === 'overview' && <Overview D={D} m={model} normalize={normalize} onDetail={setDetailId} go={go} />}
      {view === 'compare' && <CompareView D={D} m={model} a={a} b={b} normalize={normalize} compareOn={compareOn} onDetail={setDetailId} />}
      {view === 'apartments' && <ApartmentsView D={D} m={model} onDetail={setDetailId} />}
      {view === 'map' && <MapView D={D} m={model} normalize={normalize} onDetail={setDetailId} />}
      {view === 'forecast' && <ForecastView D={D} m={model} />}
      {view === 'bank' && <BankView D={D} />}
      {view === 'insights' && <InsightsView D={D} m={model} onDetail={setDetailId} />}

      <DetailDialog D={D} m={model} id={detailId} onClose={() => setDetailId(null)} />
      <QualityDialog D={D} open={qualityOpen} onClose={() => setQualityOpen(false)} />
    </div>
  )
}
