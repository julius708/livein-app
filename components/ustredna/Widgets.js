'use client'
// Ústredňa – malé interaktívne prvky: animované čísla, hodiny, grafy (čisté SVG), paleta príkazov, hlas a brífing.
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { fold } from '@/lib/hq-voice'

const nf = new Intl.NumberFormat('sk-SK')

/** Číslo, ktoré pri zmene plynule dobehne na novú hodnotu. Prvé zobrazenie ukáže hneď skutočnú hodnotu (nikdy nie falošnú nulu); bez hodnoty „–“. */
export function Num({ value, suffix = '', decimals = 0 }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const start = prev.current
    prev.current = value
    if (value == null || start == null || start === value) { setShown(value); return }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || document.visibilityState !== 'visible') { setShown(value); return }
    const t0 = performance.now(), dur = 600 + Math.min(600, Math.abs(value - start) * 4)
    let raf
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); setShown(start + (value - start) * e); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    const safety = setTimeout(() => setShown(value), dur + 200)   // keby sa animácia nedokreslila (karta na pozadí), ostane správna hodnota
    return () => { cancelAnimationFrame(raf); clearTimeout(safety) }
  }, [value])
  if (shown == null) return <>–</>
  return <>{decimals ? shown.toFixed(decimals).replace('.', ',') : nf.format(Math.round(shown))}{suffix}</>
}

/** Živé hodiny a „pred koľkými sekundami“ sa údaje načítali. */
export function useTick(ms = 1000) { const [t, setT] = useState(0); useEffect(() => { const i = setInterval(() => setT((x) => x + 1), ms); return () => clearInterval(i) }, [ms]); return t }
export function Clock() {
  useTick(1000)
  const [ready, setReady] = useState(false); useEffect(() => setReady(true), [])
  return <span className="hq-clock" suppressHydrationWarning>{ready ? new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Bratislava' }) : '––:––:––'}</span>
}
export function Since({ at }) {
  useTick(5000)
  const [ready, setReady] = useState(false); useEffect(() => setReady(true), [])
  if (!ready) return <span suppressHydrationWarning>práve teraz</span>
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  return <span suppressHydrationWarning>{s < 8 ? 'práve teraz' : s < 60 ? `pred ${s} s` : `pred ${Math.round(s / 60)} min`}</span>
}

/** Stĺpce „príchody a odchody“ po dňoch s popisom pri prejdení myšou alebo ťuknutí. */
export function WeekBars({ data }) {
  const [tip, setTip] = useState(null)
  const max = Math.max(1, ...data.map((d) => Math.max(d.arr, d.dep)))
  const W = 320, H = 130, pad = 8, bw = (W - pad * 2) / data.length
  return (
    <div className="hq-chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={'Príchody a odchody po dňoch: ' + data.map((d) => `${d.label} ${d.arr} príchodov, ${d.dep} odchodov`).join('; ')}>
        <defs><pattern id="hq-win" width="5" height="7" patternUnits="userSpaceOnUse"><rect x="1.2" y="1.6" width="2.4" height="3.2" rx=".5" className="win" /></pattern></defs>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W - pad} y1={H - g * (H - 14)} y2={H - g * (H - 14)} className="grid" />)}
        {data.map((d, i) => {
          const x = pad + i * bw, ha = (d.arr / max) * (H - 14), hd = (d.dep / max) * (H - 14), w = Math.min(17, bw * 0.34)
          return (
            <g key={d.day} className={'col' + (d.today ? ' today' : '') + (tip === i ? ' on' : '')} onMouseEnter={() => setTip(i)} onClick={() => setTip(i)}>
              <rect x={x} y={0} width={bw} height={H + 22} fill="transparent" />
              <g className="tower" style={{ animationDelay: i * 45 + 'ms' }}><rect className="b-arr" x={x + bw / 2 - w - 1.5} y={H - ha} width={w} height={ha} rx="2.5" /><rect className="lit" x={x + bw / 2 - w - 1.5} y={H - ha} width={w} height={ha} rx="2.5" fill="url(#hq-win)" />{ha > 6 && <line className="mast" x1={x + bw / 2 - w / 2 - 1.5} x2={x + bw / 2 - w / 2 - 1.5} y1={H - ha} y2={H - ha - 5} />}</g>
              <g className="tower" style={{ animationDelay: i * 45 + 40 + 'ms' }}><rect className="b-dep" x={x + bw / 2 + 1.5} y={H - hd} width={w} height={hd} rx="2.5" /><rect className="lit" x={x + bw / 2 + 1.5} y={H - hd} width={w} height={hd} rx="2.5" fill="url(#hq-win)" /></g>
              <text x={x + bw / 2} y={H + 15} textAnchor="middle">{d.label}</text>
            </g>
          )
        })}
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="ground" />
      </svg>
      <div className="hq-chart-foot"><span><i className="b-arr" />Príchody</span><span><i className="b-dep" />Odchody</span>{tip != null && <b>{data[tip].label}: {data[tip].arr} príchodov · {data[tip].dep} odchodov</b>}</div>
    </div>
  )
}

/** Kruhový ukazovateľ percenta (obsadenosť). */
export function Ring({ value, label, size = 112 }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="hq-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value == null ? 'neznáme' : v + ' %'}`}>
      <svg viewBox={`0 0 ${size} ${size}`}><circle cx={size / 2} cy={size / 2} r={r} className="bg" /><circle cx={size / 2} cy={size / 2} r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
      <div><strong><Num value={value} suffix=" %" /></strong><small>{label}</small></div>
    </div>
  )
}

/** Vodorovný pruh rozdelený na časti (kanály rezervácií). */
export function Split({ parts }) {
  return (
    <div className="hq-split" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct} %`).join(', ')}>
      <div className="bar">{parts.filter((p) => p.pct > 0).map((p, i) => <span key={p.label} className={'p' + i} style={{ flexGrow: p.pct }} title={`${p.label}: ${p.pct} %`} />)}</div>
      <div className="lg">{parts.map((p, i) => <span key={p.label}><i className={'p' + i} />{p.label} <b>{p.pct} %</b></span>)}</div>
    </div>
  )
}

/** Vodorovné stĺpce (mestá, fázy leadov). */
export function HBars({ rows, href }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return <div className="hq-hbars">{rows.map((r, i) => { const C = href ? 'a' : 'div'; return <C key={r.label} href={href} className="row"><span>{r.label}</span><div className="track"><i style={{ width: Math.max(2, (r.value / max) * 100) + '%', animationDelay: i * 60 + 'ms' }} /></div><b>{nf.format(r.value)}</b>{r.sub && <small>{r.sub}</small>}</C> })}</div>
}

/** Paleta príkazov: hľadanie naprieč ústredňou a rýchle akcie. ↑ ↓ vyberá, Enter spustí, Esc zavrie. */
export function Palette({ open, onClose, items, initial = '', onUnknown }) {
  const [q, setQ] = useState(initial), [at, setAt] = useState(0)
  const input = useRef(null), list = useRef(null)
  useEffect(() => { if (open) { setQ(initial); setAt(0); setTimeout(() => input.current && input.current.focus(), 20) } }, [open, initial])
  const results = useMemo(() => {
    const tokens = fold(q).split(' ').filter(Boolean)
    const scored = []
    for (const it of items) {
      const hay = it._f || (it._f = fold(it.title + ' ' + (it.sub || '') + ' ' + (it.keys || '')))
      if (!tokens.every((t) => hay.includes(t))) continue
      const title = fold(it.title)
      scored.push([(tokens.length && title.startsWith(tokens[0]) ? 0 : tokens.length && title.includes(tokens[0]) ? 1 : 2) * 100 + (it.rank || 50), it])
    }
    return scored.sort((a, b) => a[0] - b[0]).slice(0, tokens.length ? 40 : 14).map((x) => x[1])
  }, [q, items])
  useEffect(() => { setAt(0) }, [q])
  useEffect(() => { const el = list.current && list.current.querySelector('[data-on="1"]'); if (el) el.scrollIntoView({ block: 'nearest' }) }, [at])
  if (!open) return null
  const run = (it) => { onClose(); it.run() }
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[at]) run(results[at]); else if (q.trim() && onUnknown) { onClose(); onUnknown(q) } }
  }
  let last = null
  return (
    <div className="hq-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hq-palette" role="dialog" aria-modal="true" aria-label="Paleta príkazov">
        <div className="hq-pin"><Icon name="search" size={16} /><input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Hľadaj úlohu, človeka, poznámku, oblasť alebo napíš príkaz…" aria-label="Hľadať alebo zadať príkaz" /><kbd>Esc</kbd></div>
        <div className="res" ref={list} role="listbox">
          {results.map((it, i) => { const head = it.group !== last ? (last = it.group) : null; return (<div key={it.id}>{head && <div className="grp">{head}</div>}<button type="button" role="option" aria-selected={i === at} data-on={i === at ? 1 : 0} className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onClick={() => run(it)}><span className="hq-pic"><Icon name={it.icon || 'right'} size={15} /></span><span className="tx"><strong>{it.title}</strong>{it.sub && <small>{it.sub}</small>}</span>{it.hint && <kbd>{it.hint}</kbd>}</button></div>) })}
          {!results.length && <p className="none">Nič sa nenašlo. Enter skúsi vetu ako príkaz (napr. „zadaj úlohu Codexu: …“).</p>}
        </div>
        <div className="ft"><span><kbd>↑</kbd><kbd>↓</kbd> výber</span><span><kbd>Enter</kbd> spustiť</span><span><kbd>⌘K</kbd> otvoriť kedykoľvek</span></div>
      </div>
    </div>
  )
}

/** Rozpoznanie reči v prehliadači (Web Speech API). Nič neposiela ústredni, kým veta nie je hotová; zvuk spracúva prehliadač. */
export function useVoice(onFinal) {
  const [state, setState] = useState({ listening: false, text: '', error: '', supported: true })
  const rec = useRef(null), cb = useRef(onFinal); cb.current = onFinal
  useEffect(() => { setState((s) => ({ ...s, supported: typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition) })) }, [])
  const stop = () => { try { rec.current && rec.current.stop() } catch {} }
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setState({ listening: false, text: '', error: 'Tento prehliadač nevie rozpoznávať reč. Skús Chrome, Edge alebo Safari.', supported: false }); return }
    stop()
    const r = new SR(); rec.current = r
    r.lang = 'sk-SK'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false
    let finalText = ''
    r.onstart = () => setState({ listening: true, text: '', error: '', supported: true })
    r.onresult = (e) => { let t = ''; for (const res of e.results) { t += res[0].transcript; if (res.isFinal) finalText = t } setState((s) => ({ ...s, text: t })) }
    r.onerror = (e) => setState((s) => ({ ...s, listening: false, error: e.error === 'not-allowed' ? 'Mikrofón nie je povolený. Povoľ ho v prehliadači pre túto stránku.' : e.error === 'no-speech' ? 'Nič som nepočul. Skús to znova.' : 'Rozpoznanie reči zlyhalo (' + e.error + ').' }))
    r.onend = () => { setState((s) => ({ ...s, listening: false })); if (finalText.trim()) cb.current(finalText.trim()) }
    try { r.start() } catch { setState((s) => ({ ...s, error: 'Mikrofón sa nepodarilo spustiť.' })) }
  }
  return { ...state, start, stop }
}

/** Brífing: priority jedna po druhej. ← → listuje, Esc zavrie. */
export function Briefing({ open, onClose, cards }) {
  const [i, setI] = useState(0)
  useEffect(() => { if (open) setI(0) }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') setI((x) => Math.min(cards.length - 1, x + 1)); else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)) }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [open, cards.length, onClose])
  if (!open) return null
  const c = cards[i]
  return (
    <div className="hq-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hq-brief" role="dialog" aria-modal="true" aria-label="Brífing priorít">
        <div className="hq-btop"><span className="li-eyebrow">BRÍFING · {cards.length ? `${i + 1} / ${cards.length}` : 'HOTOVO'}</span><button type="button" className="li-close" aria-label="Zavrieť brífing" onClick={onClose}><Icon name="x" size={15} /></button></div>
        <div className="dots">{cards.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />)}</div>
        {c ? (
          <div className="hq-bcard" key={i}>
            <span className={'li-state ' + (c.tone || '')}>{c.badge}</span>
            <h2>{c.title}</h2>
            {c.sub && <p>{c.sub}</p>}
            {c.next && <p className="next"><b>Ďalší krok:</b> {c.next}</p>}
            <div className="act">
              {c.action && (c.href ? <a className="li-button primary" href={c.href}>{c.action} <Icon name="upright" size={14} /></a> : <button type="button" className="li-button primary" onClick={() => { onClose(); c.run() }}>{c.action}</button>)}
              <button type="button" className="li-button" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="left" size={14} />Späť</button>
              {i < cards.length - 1 ? <button type="button" className="li-button" onClick={() => setI(i + 1)}>Ďalej <Icon name="right" size={14} /></button> : <button type="button" className="li-button" onClick={onClose}>Hotovo <Icon name="check" size={14} /></button>}
            </div>
          </div>
        ) : <div className="hq-bcard"><h2>Nič nečaká na tvoje rozhodnutie.</h2><p>Žiadne blokovanie, výsledok na kontrolu ani signál z appky.</p><div className="act"><button type="button" className="li-button primary" onClick={onClose}>Zavrieť</button></div></div>}
      </div>
    </div>
  )
}

/* ---------- „Matrix“ vrstva v štýle LIVE-IN ---------- */

/** Bežiaca páska so živými číslami. Pri prejdení myšou sa zastaví; čítačky dostanú zoznam raz. */
export function Ticker({ items }) {
  if (!items.length) return null
  const row = (hidden) => <div className="hq-tape-row" aria-hidden={hidden || undefined}>{items.map((it, i) => <span key={i} className={it.tone || ''}><b>{it.label}</b>{it.value}</span>)}</div>
  return <div className="hq-tape" role="list" aria-label="Živé čísla">{row(false)}{row(true)}</div>
}

/** Živý log: posledné udalosti registra a kontroly zdrojov ako riadky konzoly. Len skutočné záznamy. */
export function Console({ lines }) {
  return (
    <div className="hq-console" role="log" aria-label="Živý log ústredne">
      {lines.map((l, i) => <p key={i} className={l.tone || ''}><time>{l.time}</time><b>{l.tag}</b><span>{l.text}</span></p>)}
      {!lines.length && <p><span>Zatiaľ žiadny záznam.</span></p>}
      <p className="end"><i className="cur" /></p>
    </div>
  )
}

/** Mesačné stĺpce výnosov: minulé mesiace, aktuálny (zvýraznený) a už rezervovaný ďalší (obrys). */
export function MonthBars({ months, fmt }) {
  const [tip, setTip] = useState(null)
  const max = Math.max(1, ...months.map((m) => m.revenue)), W = 320, H = 120, pad = 6, bw = (W - pad * 2) / months.length
  const cur = tip != null ? months[tip] : months.find((m) => m.kind === 'current') || months[months.length - 1]
  return (
    <div className="hq-chart hq-months" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={'Výnosy po mesiacoch: ' + months.map((m) => `${m.label} ${fmt(m.revenue)}`).join('; ')}>
        {months.map((m, i) => { const h = Math.max(2, (m.revenue / max) * (H - 10)), x = pad + i * bw, w = Math.min(34, bw * 0.62); return (
          <g key={m.key} className={'col ' + m.kind + (tip === i ? ' on' : '')} onMouseEnter={() => setTip(i)} onClick={() => setTip(i)}>
            <rect x={x} y={0} width={bw} height={H + 20} fill="transparent" />
            <rect className="mbar" x={x + (bw - w) / 2} y={H - h} width={w} height={h} rx="5" style={{ animationDelay: i * 50 + 'ms' }} />
            <text x={x + bw / 2} y={H + 14} textAnchor="middle">{m.label}</text>
          </g>) })}
      </svg>
      <div className="hq-chart-foot"><span><i className="m-past" />uzavreté</span><span><i className="m-cur" />tento mesiac</span><span><i className="m-next" />už rezervované</span>{cur && <b>{cur.label}: {fmt(cur.revenue)}</b>}</div>
    </div>
  )
}

/** Postup k cieľu: začiatok → dnes → cieľ, s popisom. */
export function GoalBar({ start, now, target, labelStart, labelTarget }) {
  const span = Math.max(1, target - start), done = Math.max(0, Math.min(100, ((now - start) / span) * 100))
  return (
    <div className="hq-goal" role="img" aria-label={`Postup k cieľu: ${now} z ${target}`}>
      <div className="track"><i style={{ width: done + '%' }} /><b style={{ left: done + '%' }}>{now}</b></div>
      <div className="ends"><span>{start} · {labelStart}</span><span>{target} · {labelTarget}</span></div>
    </div>
  )
}
