'use client'
import { fmtDate } from '@/lib/fmt'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as M from '@/lib/economy-math'
import { money, money2, nf, pct, decimal, prettyDate, signed, cityOf, skPlural } from '@/lib/economy-math'
import { MonthlyChart, CompareChart, Donut, Spark, Histogram, PairBars } from './charts'

const trend = (a, b, reverse = false) => (a == null || b == null || b === 0 ? 'neutral' : (a - b) * (reverse ? -1 : 1) > 0 ? 'positive' : a === b ? 'neutral' : 'negative')
const deltaText = (a, b, unit = '%') => { const d = unit === 'p. b.' ? (a == null || b == null ? null : a - b) : M.change(a, b); return d == null ? 'bez základne' : signed(decimal(d)) + ' ' + unit }
const download = (name, content, type) => { const url = URL.createObjectURL(new Blob([content], { type })); const l = document.createElement('a'); l.href = url; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
const airbnbUrl = (p) => { const l = (p.channelLinks || []).find((c) => c.channel_name === 'airbnb'); return l ? 'https://www.airbnb.com/rooms/' + l.channel_listing_id : null }

/** Číslo s poznámkou, voliteľne so zmenou oproti predchádzajúcemu obdobiu a malým trendom. */
export function Metric({ label, value, note, now, prev, reverse, unit, spark, primary, children }) {
  const cls = prev != null && now != null ? trend(now, prev, reverse) : null
  return (
    <article className={'metric eko-metric' + (primary ? ' primary' : '')}>
      <small>{label}</small>
      <strong>{value}</strong>
      {cls && <span className={'eko-delta ' + cls} title="Oproti rovnako dlhému predchádzajúcemu obdobiu">{deltaText(now, prev, unit)} <i>vs. predtým</i></span>}
      {spark && <Spark values={spark} color={primary ? '#F46D16' : '#173E2C'} />}
      {note && <p>{note}</p>}
      {children}
    </article>
  )
}

function PropertyCard({ r, D, onDetail, interval }) {
  const p = r.p, future = interval && interval[0] >= M.todayIndex(D)
  const weekly = useMemo(() => (interval ? M.series([r], interval, 7).map((s) => s.cents) : []), [r, interval])
  return (
    <button type="button" className="eko-card" onClick={() => onDetail(p.id)}>
      <img src={p.photo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="eko-card-body">
        <div className="eko-meta">{cityOf(p)} · {p.bedrooms == null ? '—' : p.bedrooms === 0 ? 'štúdio' : p.bedrooms + ' ' + skPlural(p.bedrooms, 'spálňa', 'spálne', 'spální')} · {p.capacity ?? '—'} hostí</div>
        <h3>{p.name}</h3>
        <div className="eko-card-stats">
          <div><strong>{money(r.revenue)}</strong><small>{future ? 'už rezervovaný výnos' : 'výnos rezervácií'}</small></div>
          <div><strong>{money(r.adr)}</strong><small>za obsadenú noc</small></div>
          <div><strong>{pct(r.occupancy)}</strong><small>obsadenosť</small></div>
        </div>
        <div className="eko-card-foot"><span className={p.active ? 'ok' : 'off'}>{p.active ? '● Aktívny' : p.status}</span><span>{nf.format(r.nights)} nocí</span>{p.overlaps > 0 && <span className="warn">prekrytia</span>}<Spark values={weekly} w={90} h={26} /></div>
      </div>
    </button>
  )
}

function Panel({ eyebrow, title, action, children, className = '' }) {
  return (
    <article className={'panel eko-panel ' + className}>
      {(eyebrow || title || action) && <div className="eko-panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}{title && <h2>{title}</h2>}</div>{action}</div>}
      {children}
    </article>
  )
}

// ---------------- Prehľad ----------------
export function Overview({ D, m, onDetail, go }) {
  if (!m.intervalA) return <p className="msg err">Vyberte platné obdobie A.</p>
  const t = m.total, tp = m.totalPrev, future = m.intervalA[0] >= M.todayIndex(D)
  const top = [...m.rows].sort((x, y) => y.revenue - x.revenue)
  const topShare = t.cents ? (top.slice(0, 10).reduce((n, r) => n + r.cents, 0) / t.cents) * 100 : null
  const lead = m.channelParts[0]
  const movers = useMemo(() => {
    // oproti rovnako dlhému obdobiu pred A; pri dlhom A bez predchodcu porovnáme posledných 30 dní s predchádzajúcimi 30 vo vnútri A
    let cur = m.rows, prev = m.rowsPrev, note
    if (prev) note = `Porovnanie s rovnako dlhým obdobím tesne pred obdobím A (${prettyDate(M.dateOf(D, m.prevInterval[0]))} – ${prettyDate(M.dateOf(D, m.prevInterval[1]))}).`
    else if (M.days(m.intervalA) >= 60) { const e = m.intervalA[1]; cur = m.rows.map((r) => M.stats(r.p, [e - 29, e])); prev = m.rows.map((r) => M.stats(r.p, [e - 59, e - 30])); note = `Posledných 30 dní obdobia A (${prettyDate(M.dateOf(D, e - 29))} – ${prettyDate(M.dateOf(D, e))}) oproti predchádzajúcim 30 dňom.` }
    else return null
    const list = cur.map((r, i) => ({ r, prev: prev[i], diff: r.revenue - prev[i].revenue, ch: M.change(r.revenue, prev[i].revenue) })).filter((x) => x.r.revenue || x.prev.revenue)
    return { note, up: [...list].sort((x, y) => y.diff - x.diff).slice(0, 4).filter((x) => x.diff > 0), down: [...list].sort((x, y) => x.diff - y.diff).slice(0, 4).filter((x) => x.diff < 0) }
  }, [m.rows, m.rowsPrev, m.intervalA, m.prevInterval, D])
  const cities = useMemo(() => {
    const g = new Map()
    for (const r of m.rows) { const c = cityOf(r.p); if (!g.has(c)) g.set(c, []); g.get(c).push(r) }
    return [...g.entries()].map(([name, list]) => ({ name, n: list.length, ...M.totals(list) })).sort((x, y) => y.revenue - x.revenue)
  }, [m.rows])
  const d = M.days(m.intervalA)
  const dec = tp ? M.decompose(t, tp) : null
  return (
    <div className="eko-view">
      <section className="eko-kpis">
        <Metric primary label={future ? 'Už rezervovaný výnos' : 'Výnos rezervácií'} value={money(t.revenue)} now={t.revenue} prev={tp && tp.revenue} spark={m.weekly} note="Cena ubytovania podľa rezervácií · nie príjem LIVE-IN" />
        <Metric label="Obsadenosť" value={pct(t.occupancy)} now={t.occupancy} prev={tp && tp.occupancy} unit="p. b." note={`${nf.format(t.nights)} nocí z ${nf.format(t.units * d)} možných`} />
        <Metric label="Cena za obsadenú noc" value={money(t.adr)} now={t.adr} prev={tp && tp.adr} note="Vážený pomer výnosu a nocí" />
        <Metric label="Výnos na dostupnú noc" value={money(t.revpan)} now={t.revpan} prev={tp && tp.revpan} note="RevPAN · výnos ÷ (byty × dni)" />
        <Metric label="Príchody" value={nf.format(t.arrivals)} now={t.arrivals} prev={tp && tp.arrivals} note={`${decimal(t.arrivals ? t.nights / t.arrivals : null)} nocí na pobyt`} />
        <Metric label="Storno" value={pct(t.storno)} now={t.storno} prev={tp && tp.storno} reverse unit="p. b." note={`${nf.format(t.cancelled)} zrušených z ${nf.format(t.arrivals + t.cancelled)} príchodov`} />
      </section>

      <Panel className="eko-story" eyebrow="Čo hovoria čísla" title={m.rows.length ? `${first3(m.rows.length)} za ${d} dní` : 'Prázdny výber'}>
        {m.rows.length ? (
          <ul className="eko-story-list">
            <li>Výber priniesol <b>{money(t.revenue)}</b> pri {nf.format(t.nights)} obsadených nociach, obsadenosť <b>{pct(t.occupancy)}</b> a <b>{money(t.adr)}</b> za noc.</li>
            {tp && tp.revenue > 0 && <li>Oproti predchádzajúcim {d} dňom je výnos <b className={trend(t.revenue, tp.revenue)}>{deltaText(t.revenue, tp.revenue)}</b>{dec && dec.volume != null ? <>: z toho {money(dec.volume)} cez počet nocí a {money(dec.price)} cez cenu za noc.</> : '.'}</li>}
            {lead && <li>Najsilnejší kanál je <b>{lead.label}</b> s {pct((lead.cents / m.chTotal) * 100)} výnosu{m.channelParts[1] ? <>, potom {m.channelParts[1].label} ({pct((m.channelParts[1].cents / m.chTotal) * 100)})</> : null}.</li>}
            {top[0] && <li>Najvyšší výnos mal <b>{top[0].p.name}</b> ({money(top[0].revenue)}); desať najsilnejších bytov tvorí <b>{pct(topShare)}</b> výberu.</li>}
            {t.storno != null && t.storno > 15 && <li className="warn">Storno {pct(t.storno)} je vysoké; oplatí sa pozrieť kanály a podmienky zrušenia.</li>}
          </ul>
        ) : <p>Žiadny byt nezodpovedá filtrom. Uvoľnite výber v hornom paneli.</p>}
      </Panel>

      <div className="eko-two">
        <Panel eyebrow="Výnos z rezervácií" title="Každý mesiac má svoj príbeh." action={<span className="eko-pill">podľa nocí pobytu</span>}>
          <MonthlyChart months={m.months} />
          <p className="eko-fine">Výnos ubytovania rozdelený na noci pobytu; súčet grafu = súčet bytov. Čiara ukazuje obsadenosť výberu v mesiaci.</p>
        </Panel>
        <Panel eyebrow="Rezervačné kanály" title="Odkiaľ prichádza výnos">
          <Donut parts={m.channelParts.slice(0, 7)} total={m.chTotal} />
        </Panel>
      </div>

      <Panel eyebrow="Byty s najvyšším výnosom" title="Silné výsledky majú konkrétnu adresu." action={<button type="button" className="eko-link" onClick={() => go('apartments')}>Všetky byty ↗</button>}>
        <div className="eko-cards">{top.slice(0, 5).map((r) => <PropertyCard key={r.p.id} r={r} D={D} onDetail={onDetail} interval={m.intervalA} />)}</div>
        <p className="eko-fine">Poradie podľa výnosu rezervácií, nie podľa zisku. Rozdielna dĺžka histórie bytov ovplyvňuje poradie.</p>
      </Panel>

      <div className="eko-two">
        {movers && (movers.up.length || movers.down.length) ? (
          <Panel eyebrow="Pohyb oproti predchádzajúcemu obdobiu" title="Kto rastie a kto klesá">
            <div className="eko-movers">
              <div><h3>▲ Rast</h3><ul>{movers.up.map((x) => <li key={x.r.p.id}><button type="button" onClick={() => onDetail(x.r.p.id)}>{x.r.p.name}</button><span className="positive">{signed(money(x.diff))}</span><small>{x.ch == null ? 'nový výnos' : signed(decimal(x.ch)) + ' %'}</small></li>)}</ul></div>
              <div><h3>▼ Pokles</h3><ul>{movers.down.map((x) => <li key={x.r.p.id}><button type="button" onClick={() => onDetail(x.r.p.id)}>{x.r.p.name}</button><span className="negative">{money(x.diff)}</span><small>{x.ch == null ? '—' : signed(decimal(x.ch)) + ' %'}</small></li>)}</ul></div>
            </div>
            <p className="eko-fine">{movers.note} Sezóna a nové byty vysvetľujú veľkú časť rozdielov.</p>
          </Panel>
        ) : <Panel eyebrow="Pohyb" title="Bez predchádzajúceho obdobia"><p className="eko-fine">Pre porovnanie s predchádzajúcim obdobím posuňte obdobie A ďalej od začiatku dát alebo použite Porovnanie A ⇄ B.</p></Panel>}
        <Panel eyebrow="Lokality" title="Mestá v rovnakom období">
          <div className="eko-table"><table><thead><tr><th>Mesto</th><th>Byty</th><th>Výnos</th><th>Obsadenosť</th><th>Cena / noc</th><th>RevPAN</th></tr></thead><tbody>{cities.map((c) => <tr key={c.name}><td><strong>{c.name}</strong></td><td>{c.n}</td><td>{money(c.revenue)}</td><td>{pct(c.occupancy)}</td><td>{money(c.adr)}</td><td>{money(c.revpan)}</td></tr>)}</tbody></table></div>
          <p className="eko-fine">Bez nákladov a štandardu bytov nejde o poradie ziskovosti lokalít.</p>
        </Panel>
      </div>
    </div>
  )
}
const first3 = (n) => `${n} ${skPlural(n, 'byt', 'byty', 'bytov')}`

// ---------------- Porovnanie ----------------
export function CompareView({ D, m, a, b, normalize, compareOn, onDetail }) {
  const [step, setStep] = useState(7)
  const [sort, setSort] = useState('changeDown')
  if (!m.intervalA) return <p className="msg err">Vyberte platné obdobie A.</p>
  if (!compareOn || !m.intervalB) return <Panel eyebrow="A ⇄ B" title="Zapnite porovnanie s obdobím B."><p className="eko-fine">V hornom paneli zapnite „porovnávať“ a vyberte obdobie B. Tip: tlačidlo „Predchádzajúce obdobie“ nastaví B tesne pred A.</p></Panel>
  const A = m.total, B = M.totals(m.rowsB), dA = M.days(m.intervalA), dB = M.days(m.intervalB)
  const basis = (r) => (normalize ? r.daily : r.revenue)
  const overlap = Math.max(0, Math.min(m.intervalA[1], m.intervalB[1]) - Math.max(m.intervalA[0], m.intervalB[0]) + 1)
  const specs = [
    { name: normalize ? 'Výnos / deň obdobia' : 'Výnos rezervácií', a: A.revenue / (normalize ? dA : 1), b: B.revenue / (normalize ? dB : 1), f: money },
    { name: 'Obsadenosť', a: A.occupancy, b: B.occupancy, f: pct, unit: 'p. b.' },
    { name: 'Cena za obsadenú noc', a: A.adr, b: B.adr, f: money },
    { name: 'Výnos na dostupnú noc', a: A.revpan, b: B.revpan, f: money },
    { name: 'Storno podľa príchodov', a: A.storno, b: B.storno, f: pct, reverse: true, unit: 'p. b.' },
  ]
  const rows = m.rows.map((r, i) => ({ a: r, b: m.rowsB[i], diff: basis(r) - basis(m.rowsB[i]), ch: M.change(basis(r), basis(m.rowsB[i])) }))
  rows.sort((x, y) => (sort === 'name' ? x.a.p.name.localeCompare(y.a.p.name, 'sk') : sort === 'revenue' ? y.a.revenue - x.a.revenue : sort === 'changeUp' ? x.diff - y.diff : y.diff - x.diff))
  const chA = M.channels(m.rows, m.intervalA), chB = M.channels(m.rowsB, m.intervalB)
  const names = [...new Set([...Object.keys(chA), ...Object.keys(chB)])].sort((x, y) => (chA[y] || 0) + (chB[y] || 0) - (chA[x] || 0) - (chB[x] || 0))
  const pairRows = names.map((n) => ({ key: n, label: M.channelLabel(n), a: (chA[n] || 0) / (normalize ? dA : 1), b: (chB[n] || 0) / (normalize ? dB : 1) }))
  const exportCsv = () => download(`LIVE-IN_porovnanie_${a.from}_${a.to}.csv`, M.csv(['Byt', 'Mesto', 'A od', 'A do', 'B od', 'B do', 'Dni A', 'Dni B', 'Výnos A EUR', 'Výnos B EUR', 'Výnos/deň A', 'Výnos/deň B', 'Noci A', 'Noci B', 'Obsadenosť A %', 'Obsadenosť B %', 'Cena/noc A', 'Cena/noc B', 'Zmena %'], rows.map((r) => [r.a.p.name, cityOf(r.a.p), a.from, a.to, b.from, b.to, r.a.days, r.b.days, r.a.revenue, r.b.revenue, r.a.daily, r.b.daily, r.a.nights, r.b.nights, r.a.occupancy, r.b.occupancy, r.a.adr, r.b.adr, r.ch])), 'text/csv;charset=utf-8')
  const dat = (interval) => (o) => prettyDate(M.dateOf(D, interval[0] + o))
  return (
    <div className="eko-view">
      <div className="eko-section-head"><div><span className="eyebrow">A ⇄ B</span><h2>Čo sa zlepšilo. Kde je priestor.</h2></div><button type="button" className="btn line" onClick={exportCsv} disabled={!rows.length}>Stiahnuť CSV</button></div>
      <p className="eko-note">Rovnakých {m.rows.length} bytov · A: {dA} dní ({M.rangeNature(D, m.intervalA)}) · B: {dB} dní ({M.rangeNature(D, m.intervalB)}). {normalize ? 'Výnos je prepočítaný na kalendárny deň výberu.' : 'Porovnávate celkové hodnoty; dlhšie obdobie môže mať vyšší súčet.'}{overlap ? ` Obdobia sa prekrývajú v ${overlap} dňoch.` : ''}</p>
      <section className="eko-kpis five">
        {specs.map((s) => <article key={s.name} className="comparison-kpi eko-ckpi"><small>{s.name}</small><div><span className="a">A <strong>{s.f(s.a)}</strong></span><span className="b">B <strong>{s.f(s.b)}</strong></span></div><span className={'eko-delta ' + trend(s.a, s.b, s.reverse)}>{deltaText(s.a, s.b, s.unit)}</span></article>)}
      </section>
      <div className="eko-two">
        <Panel eyebrow="Vývoj počas obdobia" title="Obdobia vedľa seba" action={<label className="eko-inline">Krok<select value={step} onChange={(e) => setStep(Number(e.target.value))}><option value={7}>týždne</option><option value={1}>dni</option><option value={30}>30 dní</option></select></label>}>
          <CompareChart A={M.series(m.rows, m.intervalA, step, normalize)} B={M.series(m.rowsB, m.intervalB, step, normalize)} daysA={dA} daysB={dB} dateA={dat(m.intervalA)} dateB={dat(m.intervalB)} step={step} normalize={normalize} />
          <p className="eko-fine">Obe obdobia začínajú v bode 1. Kratšie obdobie sa končí skôr; chýbajúce dni nie sú nuly.</p>
        </Panel>
        <Panel eyebrow="Rezervačné kanály" title="Odkiaľ prišla zmena"><PairBars rows={pairRows} aLabel="obdobie A" bLabel="obdobie B" aColor="#F46D16" bColor="#8FA596" /></Panel>
      </div>
      <Panel eyebrow="Byt po byte" title="Rast a pokles v rovnakom výbere" action={<label className="eko-inline">Poradie<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="changeDown">najväčší rast</option><option value="changeUp">najväčší pokles</option><option value="revenue">najvyšší výnos A</option><option value="name">abecedne</option></select></label>}>
        <div className="eko-table"><table><thead><tr><th>Byt</th><th>{normalize ? 'Výnos / deň A' : 'Výnos A'}</th><th>{normalize ? 'Výnos / deň B' : 'Výnos B'}</th><th>Zmena</th><th>%</th><th>Cena / noc A → B</th><th>Obsadenosť A → B</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.a.p.id}><td><button type="button" className="eko-tp" onClick={() => onDetail(r.a.p.id)}><img src={r.a.p.photo} alt="" loading="lazy" /><span>{r.a.p.name}<small>{cityOf(r.a.p)}</small></span></button></td><td>{money(basis(r.a))}</td><td>{money(basis(r.b))}</td><td className={trend(basis(r.a), basis(r.b))}>{signed(money(r.diff))}</td><td className={trend(basis(r.a), basis(r.b))}>{r.ch == null ? '—' : signed(decimal(r.ch)) + ' %'}</td><td>{money(r.a.adr)} → {money(r.b.adr)}</td><td>{pct(r.a.occupancy)} → {pct(r.b.occupancy)}</td></tr>)}
        </tbody></table>{!rows.length && <p className="eko-empty">Žiadny byt nezodpovedá filtrom.</p>}</div>
      </Panel>
    </div>
  )
}

// ---------------- Byty ----------------
export function ApartmentsView({ D, m, onDetail }) {
  const [sort, setSort] = useState('revenue')
  const [mode, setMode] = useState('cards')
  if (!m.intervalA) return <p className="msg err">Vyberte platné obdobie A.</p>
  const list = [...m.rows].sort((x, y) => (sort === 'name' ? x.p.name.localeCompare(y.p.name, 'sk') : sort === 'value' ? (y.value ?? -1) - (x.value ?? -1) : (y[sort] ?? -Infinity) - (x[sort] ?? -Infinity)))
  const exportCsv = () => download('LIVE-IN_byty.csv', M.csv(['Byt', 'Mesto', 'Aktívny', 'Spálne', 'Kapacita', 'Model', 'Skupina', 'Výnos EUR', 'Noci', 'Obsadenosť %', 'Cena/noc', 'Cena/noc/kapacita', 'Príchody', 'Storno %', 'Obsadenosť 60 dní PriceLabs %', 'Trh 60 dní %', 'Prekrytia'], list.map((r) => [r.p.name, cityOf(r.p), r.p.active ? 'áno' : 'nie', r.p.bedrooms, r.p.capacity, r.p.model || '', r.p.group || '', r.revenue, r.nights, r.occupancy, r.adr, r.value, r.arrivals, r.storno, r.p.occ60, r.p.market60, r.p.overlaps])), 'text/csv;charset=utf-8')
  return (
    <div className="eko-view">
      <div className="eko-section-head"><div><span className="eyebrow">{list.length} {skPlural(list.length, 'byt', 'byty', 'bytov')}</span><h2>Celé portfólio, byt po byte.</h2></div>
        <div className="eko-controls"><label className="eko-inline">Zoradiť<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="revenue">najvyšší výnos</option><option value="occupancy">najvyššia obsadenosť</option><option value="adr">najvyššia cena za noc</option><option value="nights">najviac nocí</option><option value="value">cena na kapacitu</option><option value="storno">najvyššie storno</option><option value="name">abecedne</option></select></label>
          <div className="eko-seg" role="group" aria-label="Zobrazenie"><button type="button" className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>Karty</button><button type="button" className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>Tabuľka</button></div>
          <button type="button" className="btn line" onClick={exportCsv}>CSV</button></div></div>
      {mode === 'cards' ? <div className="eko-cards">{list.map((r) => <PropertyCard key={r.p.id} r={r} D={D} onDetail={onDetail} interval={m.intervalA} />)}</div> : (
        <Panel><div className="eko-table"><table><thead><tr><th>Byt</th><th>Mesto</th><th>Výnos</th><th>Noci</th><th>Obsadenosť</th><th>Cena / noc</th><th>Na kapacitu</th><th>Storno</th><th>60 dní (PriceLabs)</th></tr></thead><tbody>
          {list.map((r) => <tr key={r.p.id}><td><button type="button" className="eko-tp" onClick={() => onDetail(r.p.id)}><img src={r.p.photo} alt="" loading="lazy" /><span>{r.p.name}<small>{r.p.active ? 'aktívny' : r.p.status}</small></span></button></td><td>{cityOf(r.p)}</td><td>{money(r.revenue)}</td><td>{nf.format(r.nights)}</td><td>{pct(r.occupancy)}</td><td>{money(r.adr)}</td><td>{money(r.value)}</td><td>{pct(r.storno)}</td><td>{r.p.occ60 == null ? '—' : <>{pct(r.p.occ60)} <small className="muted">/ trh {pct(r.p.market60)}</small></>}</td></tr>)}
        </tbody></table></div></Panel>
      )}
      {!list.length && <p className="eko-empty">Žiadny byt nezodpovedá filtru.</p>}
    </div>
  )
}

// ---------------- Mapa ----------------
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L)
    if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; l.dataset.leaflet = '1'; document.head.appendChild(l) }
    let s = document.querySelector('script[data-leaflet]')
    if (!s) { s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async = true; s.dataset.leaflet = '1'; document.head.appendChild(s) }
    s.addEventListener('load', () => resolve(window.L)); s.addEventListener('error', () => reject(new Error('leaflet')))
  })
}
const METRICS = [['revenue', 'Výnos rezervácií', money], ['occupancy', 'Obsadenosť', pct], ['adr', 'Cena za obsadenú noc', money], ['nights', 'Obsadené noci', (n) => nf.format(n)], ['daily', 'Výnos / deň obdobia', money], ['change', 'Zmena A oproti B (%)', (n) => signed(decimal(n)) + ' %']]
export function MapView({ D, m, normalize, onDetail }) {
  const [metric, setMetric] = useState('revenue')
  const [focus, setFocus] = useState('')
  const [failed, setFailed] = useState(false)
  const box = useRef(null), map = useRef(null), layer = useRef(null)
  const basis = (r) => (normalize ? r.daily : r.revenue)
  const valueOf = (r) => (metric === 'change' ? (m.comparing ? M.change(basis(r), basis(M.stats(r.p, m.intervalB))) : null) : r[metric])
  const fmt = METRICS.find((x) => x[0] === metric)[2]
  const rows = m.rows
  useEffect(() => {
    let dead = false
    loadLeaflet().then((L) => {
      if (dead || !box.current) return
      if (!map.current) { map.current = L.map(box.current, { scrollWheelZoom: false }).setView([48.4, 19], 7); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map.current); layer.current = L.layerGroup().addTo(map.current) }
      layer.current.clearLayers()
      const max = Math.max(1, ...rows.map((r) => Math.abs(valueOf(r) ?? 0))), pts = []
      for (const r of rows) {
        const p = r.p
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
        const v = valueOf(r), f = Math.max(0, (v ?? 0) / max)
        const color = metric === 'change' ? (v == null ? '#9aa8aa' : v > 0 ? '#1E8A5A' : v < 0 ? '#C23B3B' : '#879aa2') : f > 0.65 ? '#F46D16' : f > 0.3 ? '#173E2C' : '#9BB0A5'
        pts.push([p.lat, p.lng])
        L.circleMarker([p.lat, p.lng], { radius: metric === 'change' ? 7 + Math.min(9, Math.sqrt(Math.abs(v ?? 0))) : 5 + Math.sqrt(f) * 10, color: '#fff', weight: 1.7, fillColor: color, fillOpacity: 0.92 }).addTo(layer.current).bindTooltip(`${p.name} · ${v == null ? '—' : fmt(v)}`).on('click', () => setFocus(p.id))
      }
      if (pts.length) map.current.fitBounds(pts, { padding: [24, 24], maxZoom: 14 })
    }).catch(() => setFailed(true))
    return () => { dead = true }
  }, [rows, metric, m.comparing, normalize]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null } }, [])
  const sel = rows.find((r) => r.p.id === focus) || null
  const selB = sel && m.comparing ? M.stats(sel.p, m.intervalB) : null
  const peers = sel ? rows.filter((r) => r.p.id !== sel.p.id && Math.abs(r.p.lat - sel.p.lat) < 0.0002 && Math.abs(r.p.lng - sel.p.lng) < 0.0002) : []
  const pick = (id) => { setFocus(id); const p = D.listings.find((x) => x.id === id); if (map.current && p && Number.isFinite(p.lat)) map.current.panTo([p.lat, p.lng]) }
  if (!m.intervalA) return <p className="msg err">Vyberte platné obdobie A.</p>
  return (
    <div className="eko-view">
      <Panel eyebrow="Skutočné polohy z Guesty" title="Výkon portfólia na mape." action={<label className="eko-inline">Farba a veľkosť<select value={metric} onChange={(e) => setMetric(e.target.value)}>{METRICS.map(([k, l]) => <option key={k} value={k} disabled={k === 'change' && !m.comparing}>{l}</option>)}</select></label>}>
        <div className="eko-map-layout">
          <div>
            <div className="eko-map" ref={box} role="region" aria-label="Mapa bytov">{failed && <div className="eko-empty">Podklad mapy sa nenačítal. Skúste obnoviť stránku; ostatné pohľady fungujú.</div>}</div>
            <div className="eko-legend map">{metric === 'change' ? <><span><i style={{ background: '#1E8A5A' }} />rast</span><span><i style={{ background: '#C23B3B' }} />pokles</span><span><i style={{ background: '#9aa8aa' }} />bez základne</span></> : <><span><i style={{ background: '#F46D16' }} />najsilnejšie</span><span><i style={{ background: '#173E2C' }} />stred</span><span><i style={{ background: '#9BB0A5' }} />slabšie</span></>}</div>
          </div>
          <div className="eko-map-side">
            <label className="eko-inline block">Vybrať byt<select value={focus} onChange={(e) => pick(e.target.value)}><option value="">Kliknite na mapu alebo vyberte byt</option>{[...rows].sort((x, y) => x.p.name.localeCompare(y.p.name, 'sk')).map((r) => <option key={r.p.id} value={r.p.id}>{r.p.name}</option>)}</select></label>
            {sel ? (
              <div className="eko-map-sel">
                <img src={sel.p.photo} alt="" />
                <span className="eyebrow">{cityOf(sel.p)} · {sel.p.status}</span>
                <h3>{sel.p.name}</h3>
                <dl><dt>Výnos A</dt><dd>{money(sel.revenue)}</dd><dt>Obsadenosť A</dt><dd>{pct(sel.occupancy)}</dd><dt>Cena / noc A</dt><dd>{money(sel.adr)}</dd>{selB && <><dt>Výnos B</dt><dd>{money(selB.revenue)}</dd><dt>Zmena</dt><dd className={trend(basis(sel), basis(selB))}>{deltaText(basis(sel), basis(selB))}</dd></>}</dl>
                <button type="button" className="btn line" onClick={() => onDetail(sel.p.id)}>Celý detail ↗</button>
                {peers.length > 0 && <div className="eko-peers"><span className="eyebrow">Ďalšie byty na tejto polohe</span>{peers.map((r) => <button key={r.p.id} type="button" onClick={() => setFocus(r.p.id)}>{r.p.name}<small>{money(r.revenue)}</small></button>)}</div>}
              </div>
            ) : <p className="eko-fine">Kliknite na bod na mape. Veľkosť a farba bodu vyjadrujú zvolenú metriku za obdobie A.</p>}
          </div>
        </div>
      </Panel>
    </div>
  )
}

// ---------------- Výhľad ----------------
export function ForecastView({ D, m }) {
  const [o, setO] = useState(M.DEFAULT_FORECAST)
  const set = (k, v) => setO((c) => ({ ...c, [k]: v }))
  const props = m.props
  const f = useMemo(() => {
    const future = M.range(D, D.asOf, D.futureTo), histEnd = M.dayOf(D, D.historicalTo), hist = [Math.max(0, histEnd - 89), histEnd], annual = M.range(D, D.rangeFrom, D.historicalTo)
    const booked = M.totals(props.map((p) => M.stats(p, future))).revenue
    const reference = (M.totals(props.map((p) => M.stats(p, hist))).revenue * 90) / M.days(hist)
    const total = M.totals(props.map((p) => M.stats(p, annual)))
    const sim = M.simulate(booked, reference, o)
    const last = M.totals(props.map((p) => M.stats(p, [histEnd - 29, histEnd]))), prior = M.totals(props.map((p) => M.stats(p, [histEnd - 59, histEnd - 30])))
    const dec = M.decompose(last, prior)
    const rank = props.map((p) => M.stats(p, annual)).sort((x, y) => y.cents - x.cents)
    const topShare = total.cents ? (rank.slice(0, 10).reduce((n, r) => n + r.cents, 0) / total.cents) * 100 : null
    const ch = M.channels(props.map((p) => M.stats(p, annual)), annual), leading = Object.entries(ch).sort((x, y) => y[1] - x[1])[0]
    const overlap = props.reduce((n, p) => n + (p.overlaps || 0), 0)
    const low = props.filter((p) => p.active && p.occ60 != null && p.market60 != null).sort((x, y) => x.occ60 - x.market60 - (y.occ60 - y.market60)).slice(0, 3)
    const months = M.monthly(D, props.map((p) => M.stats(p, future)), future).map((x) => ({ ...x, label: M.monthLabel(x.key), future: true }))
    return { future, booked, reference, total, sim, last, prior, dec, topShare, leading, chTotal: Object.values(ch).reduce((x, y) => x + y, 0), overlap, low, months, annual }
  }, [D, props, o])
  const ev = M.EVENTS.find((e) => e.id === o.event)
  const report = `<span class="eyebrow">Názor analytika · ${props.length} bytov vo výbere</span><h2>Výkon rezervácií je merateľný. Finančné zdravie ešte potrebuje náklady.</h2>
<p>Ročný výnos rezervácií vo výbere dosiahol <strong>${money(f.total.revenue)}</strong> pri ${nf.format(f.total.nights)} obsadených nociach a obsadenosti ${pct(f.total.occupancy)}. Vážená cena na noc je ${money(f.total.adr)}. Ide o výnos ubytovania podľa rezervácií, nie o príjem firmy.</p>
<h3>Momentum posledných 30 dní</h3><p>Oproti predchádzajúcim 30 dňom sa výnos zmenil o ${deltaText(f.last.revenue, f.prior.revenue)}. Rozklad: počet nocí ${money(f.dec.volume)}, cena za noc ${money(f.dec.price)}. Rozklad vysvetľuje aritmetiku, nie príčinu; nové byty a sezónnosť výsledok ovplyvňujú.</p>
<h3>Výhľad na 90 dní</h3><p>Máme rezervovaných ${money(f.booked)}. Pracovný scenár dáva ${money(f.sim.base)}: ${money(f.sim.retained)} zachovaného výnosu a ${money(f.sim.extra)} nového dopredaja. Historická referencia ${money(f.reference)} vychádza z posledných 90 dní, nie je sezónnym cieľom. Predpoklady: doplnenie ${o.pickup} %, cena ${o.price} %, strata rezervovaného výnosu ${o.cancel} %, neistota ±${o.uncertainty} %; ${ev.label}, výskyt ${o.probability} %. Rozpätie P10–P90: ${money(f.sim.p10)} – ${money(f.sim.p90)}.</p>
<h3>Koncentrácia a riziká</h3><p>Desať bytov s najvyšším ročným výnosom tvorí ${pct(f.topShare)} výnosu výberu. ${f.leading ? `Najväčší kanál ${M.channelLabel(f.leading[0])} nesie ${pct((f.leading[1] / f.chTotal) * 100)}.` : ''} ${f.overlap ? `V zdroji je ${f.overlap} prekrytých nocí na preverenie.` : 'Bez prekrytých nocí v zdroji.'} ${f.low.length ? 'Najslabšia obsadenosť na 60 dní oproti trhu: ' + f.low.map((p) => `${p.name} (${pct(p.occ60)} / trh ${pct(p.market60)})`).join(', ') + '.' : ''}</p>
${D.bank ? '<h3>Bankové toky a likvidita · firmy oddelene</h3>' + [...new Set(D.bank.rows.map((r) => r.entity))].map((e) => { const rs = D.bank.rows.filter((r) => r.entity === e && r.to === D.bank.to); return `<p><strong>${e}</strong> · ${rs.length} účtov · zostatok k ${D.bank.to} ${money(rs.reduce((n, r) => n + r.closingCents, 0) / 100)} · čistý pohyb za ${D.bank.to.slice(0, 7)} ${money(rs.reduce((n, r) => n + r.creditCents - r.debitCents, 0) / 100)}.</p>` }).join('') + '<p>Bankový pohľad nepoužíva filtre bytov. Peniaze majiteľov a interné prevody nie sú oddelené; zostatok nie je voľná hotovosť firmy.</p>' : ''}`
  const exportReport = () => download(`LIVE-IN_analyticky_report_${D.asOf}.html`, `<!doctype html><html lang="sk"><meta charset="utf-8"><title>LIVE-IN · Analytický report</title><style>body{font:17px/1.7 system-ui;color:#1E3328;max-width:900px;margin:50px auto;padding:25px}h2{font-size:30px;color:#173E2C}h3{margin-top:32px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#66716A}</style><body><p>LIVE-IN · Súkromný analytický report · ${new Date().toLocaleString('sk-SK')}</p>${report}</body></html>`, 'text/html;charset=utf-8')
  const Slider = ({ k, label, min, max, unit = '%' }) => <label className="eko-slider"><span>{label}<b>{o[k]}{unit}</b></span><input type="range" min={min} max={max} value={o[k]} onChange={(e) => set(k, Number(e.target.value))} /></label>
  return (
    <div className="eko-view">
      <div className="eko-section-head"><div><span className="eyebrow">Výhľad + scenáre</span><h2>Čo máme rezervované. Čo môže prísť.</h2></div><button type="button" className="btn line" onClick={exportReport}>Stiahnuť analytický report</button></div>
      <p className="eko-note">Scenárový model, nie overená predpoveď. Používa nasledujúcich 90 dní od dátumu snímku ({prettyDate(D.asOf)} – {prettyDate(D.futureTo)}); filtre bytov platia, obdobia A/B nie. Výnos je hrubý výnos rezervácií, nie zisk ani cash flow.</p>
      <section className="eko-kpis four">
        <Metric primary label="Už rezervované" value={money(f.booked)} note={`pred možnou stratou · ${props.length} bytov`} />
        <Metric label="Pracovný scenár" value={money(f.sim.base)} note="zachované rezervácie + modelovaný dopredaj" />
        <Metric label="Rozpätie P10 – P90" value={`${M.compact(f.sim.p10)} – ${M.compact(f.sim.p90)}`} note={`stred P50 ${money(f.sim.p50)} · nie garancia`} />
        <Metric label="Ak nastane udalosť" value={money(f.sim.stress)} note={`${signed(money(f.sim.eventImpact))} oproti pracovnému scenáru`} />
      </section>
      <div className="eko-two">
        <Panel eyebrow="Predpoklady" title="Posuňte a sledujte scenár">
          <div className="eko-sliders">
            <Slider k="pickup" label="Doplnenie do historickej referencie" min={0} max={200} />
            <Slider k="price" label="Zmena ceny nových nocí" min={-50} max={50} />
            <Slider k="cancel" label="Strata už rezervovaného výnosu" min={0} max={100} />
            <Slider k="uncertainty" label="Neistota dopredaja (±)" min={0} max={100} />
            <label className="eko-slider"><span>Budúca situácia</span><select value={o.event} onChange={(e) => set('event', e.target.value)}>{M.EVENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
            <Slider k="probability" label="Pravdepodobnosť udalosti" min={0} max={100} />
            <button type="button" className="eko-link" onClick={() => setO(M.DEFAULT_FORECAST)}>Vrátiť východiskové hodnoty</button>
          </div>
          <p className="eko-fine">Dopredaj = kladný rozdiel medzi 90-dňovou referenciou (posledných 90 dní) a už rezervovaným výnosom × zvolený podiel × zmena ceny. Referencia nezohľadňuje sezónnosť. Simulácia nemení ceny.</p>
        </Panel>
        <Panel eyebrow="2 000 scenárov" title="Rozdelenie možných výsledkov">
          <Histogram values={f.sim.values} p10={f.sim.p10} p50={f.sim.p50} p90={f.sim.p90} />
          <p className="eko-fine">P10 / P50 / P90 sú percentily modelovaných scenárov, nie overený interval reálneho výnosu. Rovnaké vstupy dávajú vždy rovnaký výsledok.</p>
        </Panel>
      </div>
      <Panel eyebrow="Už rezervované po mesiacoch" title="Čo je dnes v kalendári">
        <MonthlyChart months={f.months} label="Už rezervovaný výnos po mesiacoch" />
        <p className="eko-fine">Rezervácie, ktoré už sú v Guesty na nasledujúce obdobie. Mesiace ďalej v budúcnosti sú prirodzene prázdnejšie, dopredaj ich ešte doplní.</p>
      </Panel>
      <Panel className="eko-report"><div dangerouslySetInnerHTML={{ __html: report }} /></Panel>
    </div>
  )
}

// ---------------- Banka ----------------
export function BankView({ D }) {
  const b = D.bank
  const entities = useMemo(() => (b ? [...new Set(b.rows.map((r) => r.entity || 'Nepriradené'))].sort() : []), [b])
  const [entity, setEntity] = useState(entities[0] || '')
  const [account, setAccount] = useState('all')
  const [from, setFrom] = useState(b ? b.to.slice(0, 4) + '-01' : '')
  const [to, setTo] = useState(b ? b.to.slice(0, 7) : '')
  if (!b) return <Panel eyebrow="Overené výpisy" title="Bankové výpisy ešte nie sú v snímku."><p className="eko-fine">Po ďalšom importe výpisov sa tu objavia účty, pohyby a zostatky.</p></Panel>
  const accounts = [...new Set(b.rows.filter((r) => r.entity === entity).map((r) => r.account))].sort()
  const valid = from && to && from <= to && from >= b.from.slice(0, 7) && to <= b.to.slice(0, 7)
  const x = valid ? M.bankMonths(b, { entity, account: accounts.includes(account) ? account : 'all', from, to }) : null
  const e = b.entityYTD && b.entityYTD.entities ? b.entityYTD.entities.find((z) => z.entity === entity) : null
  const fee = b.managementFees && b.managementFees.entity === entity ? b.managementFees : null
  const allBalanced = b.rows.every((r) => r.differenceCents === 0), continuous = b.continuity.every((r) => r.differenceCents === 0 && r.gapDays === 0)
  const cats = e ? e.candidate_categories.filter((c) => c.category !== 'Párovaný prevod medzi účtami tej istej firmy') : []
  return (
    <div className="eko-view">
      <div className="eko-section-head"><div><span className="eyebrow">Overené výpisy</span><h2>Peniaze na účtoch. Pohyby v čase.</h2></div></div>
      <p className="eko-note">Každá spoločnosť sa zobrazuje samostatne podľa držiteľa účtu. Príjmy obsahujú aj peniaze majiteľov a interné prevody, výdavky nie sú automaticky náklady firmy. Čistý pohyb nie je zisk a zostatok nie je voľná hotovosť LIVE-IN. Filtre bytov a obdobia A/B sa tu nepoužívajú.</p>
      <Panel>
        <div className="eko-filters">
          <label>Spoločnosť<select value={entity} onChange={(e) => { setEntity(e.target.value); setAccount('all') }}>{entities.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
          <label>Účet<select value={account} onChange={(e) => setAccount(e.target.value)}><option value="all">Všetky účty ({accounts.length})</option>{accounts.map((a) => <option key={a} value={a}>Účet …{a}</option>)}</select></label>
          <label>Od mesiaca<input type="month" min={b.from.slice(0, 7)} max={b.to.slice(0, 7)} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Do mesiaca<input type="month" min={b.from.slice(0, 7)} max={b.to.slice(0, 7)} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {!valid && <p className="msg err">Vyberte platný rozsah v dostupnom období {b.from} – {b.to}.</p>}
      </Panel>
      {x && (
        <>
          <section className="eko-kpis four">
            <Metric primary label="Príjmy na účty" value={money(x.credit / 100)} note="vrátane interných prevodov a peňazí majiteľov" />
            <Metric label="Výdavky z účtov" value={money(x.debit / 100)} note="nie overené prevádzkové náklady" />
            <Metric label="Čistý bankový pohyb" value={money((x.credit - x.debit) / 100)} note="príjmy mínus výdavky · nie zisk" />
            <Metric label="Zostatok na konci výberu" value={money(x.closing / 100)} note={x.last ? `k ${M.monthLong(x.last.month)} · ${x.last.accounts} ${skPlural(x.last.accounts, 'účet', 'účty', 'účtov')}` : 'bez dostupného výpisu'} />
          </section>
          <div className="eko-two">
            <Panel eyebrow="Po mesiacoch" title="Príjmy a výdavky">
              <PairBars rows={x.list.map((r) => ({ key: r.month, label: M.monthLabel(r.month), a: r.credit, b: r.debit }))} />
              <p className="eko-fine">Výpisy camt.053 · len zaúčtované pohyby. Interné prevody zostávajú v oboch stranách, sumy sú obrat účtov, nie konsolidované cash flow.</p>
            </Panel>
            <Panel eyebrow="Mesačný prehľad" title="Tabuľka">
              <div className="eko-table"><table><thead><tr><th>Mesiac</th><th>Účty</th><th>Príjmy</th><th>Výdavky</th><th>Čistý pohyb</th><th>Konečný zostatok</th></tr></thead><tbody>{x.list.map((r) => <tr key={r.month}><td>{M.monthLabel(r.month)}</td><td>{r.accounts}</td><td>{money(r.credit / 100)}</td><td>{money(r.debit / 100)}</td><td className={r.credit - r.debit >= 0 ? 'positive' : 'negative'}>{money((r.credit - r.debit) / 100)}</td><td>{money(r.closing / 100)}</td></tr>)}</tbody></table></div>
              <p className="eko-fine">Dostupné obdobie {b.from} – {b.to} · {b.rows.length} výpisov · {b.duplicatesRemoved} duplicít vyradených · zostatky {allBalanced ? 'sedia' : 'vyžadujú kontrolu'} · nadväznosť {continuous ? 'bez medzier' : 'vyžaduje kontrolu'}. Výber: {x.rows.length} výpisov, {nf.format(x.rows.reduce((n, r) => n + r.count, 0))} pohybov.</p>
            </Panel>
          </div>
          <Panel eyebrow="P&L YTD · pracovný podklad" title={entity}>
            {e ? (
              <>
                <p className="eko-fine">{prettyDate(b.entityYTD.period[0])} – {prettyDate(b.entityYTD.period[1])} · {e.account_count} účtov · stav: čiastočný bankový dôkaz, nie účtovný P&L.</p>
                <div className="eko-table"><table><thead><tr><th>Položka</th><th>Suma</th><th>Poznámka</th></tr></thead><tbody>
                  {fee ? <>
                    <tr><td>PMC provízie z vyúčtovaní</td><td>{money2(fee.commissionCents / 100)}</td><td>priradenie firme potvrdené; DPH a uzavretie ešte overiť</td></tr>
                    <tr><td>Fixné Guesty poplatky</td><td>{money2(fee.fixedCents / 100)}</td><td>výnosový podklad firmy</td></tr>
                    <tr><td>Ostatné poplatky a opravy netto</td><td>{money2(fee.otherCents / 100)}</td><td>doložené v Management Fee; účtovné zaradenie overiť</td></tr>
                    <tr><td><strong>Management Fee spolu</strong></td><td><strong>{money2(fee.totalCents / 100)}</strong></td><td>{fee.statements} výkazov · schválené {money2(fee.approvedCents / 100)}, označené {money2(fee.flaggedCents / 100)}, čakajúce {money2(fee.pendingCents / 100)}</td></tr>
                  </> : <tr><td>Výnosy firmy</td><td>neuzavreté</td><td>vlastné nájomné a služby podľa právnej roly bytu; doklady, DPH a obdobie plnenia</td></tr>}
                  <tr><td>Bankové príjmy (bez párovaných prevodov)</td><td>{money2(e.cash_excluding_same_holder_pairs_only.credit_cents / 100)}</td><td>{nf.format(e.cash_excluding_same_holder_pairs_only.count)} pohybov</td></tr>
                  <tr><td>Bankové výdavky (bez párovaných prevodov)</td><td>{money2(e.cash_excluding_same_holder_pairs_only.debit_cents / 100)}</td><td>obsahujú aj výplaty majiteľom a interné toky</td></tr>
                  <tr><td><strong>Čistý bankový pohyb</strong></td><td><strong>{money2(e.cash_excluding_same_holder_pairs_only.net_cash_cents / 100)}</strong></td><td>nie zisk</td></tr>
                </tbody></table></div>
                {cats.length > 0 && <><h3 className="eko-h3">Kandidátske kategórie pohybov</h3><div className="eko-table"><table><thead><tr><th>Kategória</th><th>Pohyby</th><th>Príjmy</th><th>Výdavky</th><th>Netto</th></tr></thead><tbody>{cats.map((c) => <tr key={c.category}><td>{c.category}</td><td>{nf.format(c.count)}</td><td>{money(c.credit_cents / 100)}</td><td>{money(c.debit_cents / 100)}</td><td className={c.net_cash_cents >= 0 ? 'positive' : 'negative'}>{money(c.net_cash_cents / 100)}</td></tr>)}</tbody></table></div><p className="eko-fine">Kategórie sú návrh z textov pohybov; na účtovné zaradenie treba faktúru, zmluvu alebo knihu.</p></>}
              </>
            ) : <p className="eko-fine">P&L podklady pre túto firmu ešte nie sú dostupné.</p>}
          </Panel>
        </>
      )}
    </div>
  )
}

// ---------------- Analýza ----------------
export function InsightsView({ D, m, onDetail }) {
  const rows = m.intervalA ? m.rows : []
  const active = rows.filter((r) => r.p.active)
  const low = active.filter((r) => r.p.occ60 != null && r.p.market60 != null).sort((x, y) => x.p.occ60 - x.p.market60 - (y.p.occ60 - y.p.market60)).slice(0, 4)
  const high = active.filter((r) => r.p.occ60 != null && r.p.market60 != null).sort((x, y) => y.p.occ60 - y.p.market60 - (x.p.occ60 - x.p.market60)).slice(0, 3)
  const missingModels = active.filter((r) => !r.p.model).length
  const overlap = active.filter((r) => r.p.overlaps > 0)
  const topAdr = [...active].filter((r) => r.nights >= 30).sort((x, y) => (y.adr ?? 0) - (x.adr ?? 0)).slice(0, 3)
  const lowOcc = [...active].filter((r) => r.days >= 60).sort((x, y) => x.occupancy - y.occupancy).slice(0, 4)
  const li = (r, text) => <li key={r.p.id}><button type="button" onClick={() => onDetail(r.p.id)}>{r.p.name}</button><span>{text}</span></li>
  const ex = D.expertReport
  return (
    <div className="eko-view">
      <div className="eko-section-head"><div><span className="eyebrow">Automatické pohľady</span><h2>Konkrétne podklady, nie hotové rozhodnutia.</h2></div></div>
      <p className="eko-note">Návrhy sa opierajú o zobrazené dáta a filtre; nie sú schválením odborníka ani povolením meniť ceny.</p>
      <div className="eko-insights">
        <article className="panel eko-insight"><span className="eyebrow">Cenotvorba a dopyt</span><h3>Kde preveriť budúci dopyt</h3><p>Obsadenosť nasledujúcich 60 dní v snímku PriceLabs oproti jeho trhovému porovnaniu:</p><ul className="eko-ilist">{low.map((r) => li(r, `${pct(r.p.occ60)} byt / ${pct(r.p.market60)} trh`))}</ul><p>Návrh: preveriť blokácie, minimálny pobyt, cenu a prezentáciu. Samotný rozdiel nepreukazuje príčinu.</p><div className="eko-source">PriceLabs · interval 60 dní, odlišný od výhľadu 90 dní</div></article>
        <article className="panel eko-insight"><span className="eyebrow">Nad trhom</span><h3>Kde dopyt predbieha trh</h3><ul className="eko-ilist">{high.map((r) => li(r, `${pct(r.p.occ60)} byt / ${pct(r.p.market60)} trh`))}</ul><p>Vysoká obsadenosť oproti trhu môže znamenať priestor na cenu. Pred zmenou porovnať cenu za noc so susedmi.</p><h3 className="eko-h3">Najslabšia obsadenosť v období A</h3><ul className="eko-ilist">{lowOcc.map((r) => li(r, `${pct(r.occupancy)} · ${money(r.revenue)}`))}</ul></article>
        <article className="panel eko-insight"><span className="eyebrow">Finančný pohľad</span><h3>Výnos ešte nie je zisk</h3><p>{active.length} aktívnych bytov potrebuje overené pravidlo príjmu firmy a úplné náklady. {missingModels} {skPlural(missingModels, 'nemá', 'nemajú', 'nemá')} v Guesty názov obchodného modelu.</p><p>Rozdeliť správu, garantovaný nájom a ceny riadené majiteľom. Zisk počítať až po zosúladení poplatkov, DPH, nákladov a vyúčtovaní.</p><h3 className="eko-h3">Najvyššia cena za noc (min. 30 nocí)</h3><ul className="eko-ilist">{topAdr.map((r) => li(r, `${money(r.adr)} · ${nf.format(r.nights)} nocí`))}</ul><div className="eko-source">Guesty businessModel + rozsah dát</div></article>
        <article className="panel eko-insight"><span className="eyebrow">Kvalita dát</span><h3>Čo treba preveriť</h3><p>{overlap.length ? `${overlap.length} ${skPlural(overlap.length, 'byt má', 'byty majú', 'bytov má')} prekryté rezervácie v zdroji.` : 'Bez prekrytých rezervácií vo výbere.'}</p><ul className="eko-ilist">{overlap.slice(0, 4).map((r) => li(r, `${r.p.overlaps} ${skPlural(r.p.overlaps, 'noc', 'noci', 'nocí')}`))}</ul><ul className="eko-limits">{(D.limitations || []).map((t) => <li key={t}>{t}</li>)}</ul></article>
      </div>
      {ex && <Panel eyebrow="Odborný report PriceLabs" title="Čo môžeme tvrdiť o celom portfóliu?"><p>PriceLabs vrátil report pre {ex.catalog} záznamov za {prettyDate(ex.from)} – {prettyDate(ex.to)}. Medziročné porovnanie sa opiera len o <strong>{ex.compared} bytov s dostupnou históriou</strong>. {ex.note}</p><p className="eko-fine">Ročná obsadenosť a výnos na dostupnú noc čakajú na historické blokácie a aktívne obdobia. Príjem LIVE-IN, marža a zisk čakajú na účtovné podklady.</p></Panel>}
    </div>
  )
}

// ---------------- Dialógy ----------------
function useDialog(open) {
  const ref = useRef(null)
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close() }, [open])
  return ref
}
export function DetailDialog({ D, m, id, onClose }) {
  const ref = useDialog(!!id)
  const p = id ? D.listings.find((x) => x.id === id) : null
  const data = useMemo(() => {
    if (!p || !m.intervalA) return null
    const r = M.stats(p, m.intervalA), full = [0, M.dayOf(D, D.historicalTo)]
    const months = M.monthly(D, [M.stats(p, [0, M.lastDay(D)])], [0, M.lastDay(D)]).map((x) => ({ ...x, label: M.monthLabel(x.key), future: M.dayOf(D, x.key + '-01') >= M.todayIndex(D) }))
    const ch = M.channels([r], m.intervalA), total = Object.values(ch).reduce((a, b) => a + b, 0)
    const year = M.stats(p, full), prev = M.previous(D, m.intervalA), rPrev = prev ? M.stats(p, prev) : null
    const rank = D.listings.filter((x) => x.active).map((x) => M.stats(x, m.intervalA)).sort((x, y) => y.cents - x.cents).findIndex((x) => x.p.id === p.id)
    return { r, months, parts: Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([name, cents]) => ({ name, label: M.channelLabel(name), cents })), total, year, rPrev, rank }
  }, [p, m, D])
  return (
    <dialog ref={ref} className="eko-dialog" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      {p && data && (
        <div className="eko-detail">
          <button type="button" className="eko-close" onClick={onClose} aria-label="Zavrieť">×</button>
          <img className="eko-detail-photo" src={p.photo} alt="" />
          <div className="eko-detail-body">
            <span className="eyebrow">{cityOf(p)} · {p.status}{data.rank >= 0 && <> · {data.rank + 1}. z aktívnych podľa výnosu</>}</span>
            <h2>{p.name}</h2>
            <p className="eko-fine">{p.title} · {p.bedrooms === 0 ? 'štúdio' : `${p.bedrooms ?? '—'} ${skPlural(p.bedrooms || 0, 'spálňa', 'spálne', 'spální')}`} · {p.capacity ?? '—'} hostí · model {p.model || 'neuvedený'}{p.group ? ` · ${p.group}` : ''}</p>
            <div className="eko-detail-grid">
              <div><strong>{money(data.r.revenue)}</strong><small>výnos A{data.rPrev ? <i className={'eko-delta ' + trend(data.r.revenue, data.rPrev.revenue)}>{deltaText(data.r.revenue, data.rPrev.revenue)}</i> : null}</small></div>
              <div><strong>{pct(data.r.occupancy)}</strong><small>obsadenosť A</small></div>
              <div><strong>{money(data.r.adr)}</strong><small>cena za noc</small></div>
              <div><strong>{nf.format(data.r.nights)}</strong><small>obsadených nocí · {data.r.arrivals} príchodov</small></div>
              <div><strong>{pct(data.r.storno)}</strong><small>storno podľa príchodov</small></div>
              <div><strong>{p.occ60 == null ? '—' : pct(p.occ60)}</strong><small>obsadenosť 60 dní · trh {pct(p.market60)}</small></div>
              <div><strong>{money(data.year.revenue)}</strong><small>výnos za celú históriu</small></div>
              <div><strong>{money(data.r.value)}</strong><small>cena / noc / kapacita</small></div>
            </div>
            <h3 className="eko-h3">Celá história a už rezervované mesiace</h3>
            <MonthlyChart months={data.months} label={`Výnos bytu ${p.name} po mesiacoch`} />
            <div className="eko-two tight">
              <div><h3 className="eko-h3">Kanály v období A</h3><Donut parts={data.parts} total={data.total} /></div>
              <div><h3 className="eko-h3">Zdroje a odkazy</h3><p className="eko-fine">Guesty + PriceLabs · katalóg načítaný {new Date(D.readAt).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}. PriceLabs snímok bytu: {p.sourceRefreshed ? fmtDate(p.sourceRefreshed) : 'neuvedený'}.</p>
                {airbnbUrl(p) && <a className="btn line" href={airbnbUrl(p)} target="_blank" rel="noopener noreferrer">Otvoriť na Airbnb ↗</a>}
                {p.overlaps > 0 && <p className="msg err">Zdrojové rezervácie sa prekrývajú v {p.overlaps} nociach; treba preveriť jednotky a duplicity.</p>}
                <p className="eko-fine">Príjem LIVE-IN a zisk nie sú vyčíslené. Ročná obsadenosť čaká na dostupné noci a blokácie.</p></div>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
export function QualityDialog({ D, open, onClose }) {
  const ref = useDialog(open)
  const overlaps = D.listings.reduce((n, p) => n + (p.overlaps || 0), 0), cov = D.coverage || {}
  return (
    <dialog ref={ref} className="eko-dialog" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="eko-quality">
        <button type="button" className="eko-close" onClick={onClose} aria-label="Zavrieť">×</button>
        <span className="eyebrow">Dôkazy a obmedzenia</span>
        <h2>Čomu sa dá veriť.</h2>
        <p>{D.listings.length} záznamov v katalógu · {D.listings.filter((p) => p.photo).length} fotografií · {D.listings.filter((p) => p.lat != null).length} polôh · {D.listings.filter((p) => p.active).length} aktívnych · EUR.</p>
        <ul>
          {(D.limitations || []).map((t) => <li key={t}>{t}</li>)}
          <li>{overlaps} prekrytých nocí rezervácií v zdroji. Obsadené noci sú deduplikované podľa bytu a dátumu; sumy ponechané na kontrolu.</li>
          {cov.bookingsInRange && <li>{nf.format(cov.bookingsInRange)} rezervácií v rozsahu {prettyDate(cov.historicalFrom)} – {prettyDate(cov.forecastTo)} · stav zberu: {cov.status}.</li>}
          {D.expertReport && <li>Odborný report PriceLabs: medziročné porovnanie má len {D.expertReport.compared} bytov. Závery nie sú potvrdené nezávislým odborníkom.</li>}
        </ul>
        <p className="eko-fine">Stránka kontroluje novší snímok každých 5 minút, kým je otvorená. Rezervácie z Guesty sa sťahujú každú hodinu. Čas zdrojových dát: {new Date(D.readAt).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}.</p>
      </div>
    </dialog>
  )
}
