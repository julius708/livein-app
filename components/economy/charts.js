'use client'
import { useId, useState } from 'react'
import { money, decimal, pct } from '@/lib/economy-math'

const GREEN = '#173E2C', ORANGE = '#F46D16', MIST = '#8FA596', GRID = '#173e2c14'
const fmtAxis = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' M' : Math.abs(v) >= 1000 ? Math.round(v / 1000) + ' tis.' : String(Math.round(v)))
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p }

/** Stĺpcový graf po mesiacoch: výnos (stĺpce) + obsadenosť (čiara). Klávesnicou prístupné, každý stĺpec má popis. */
export function MonthlyChart({ months, label = 'Výnos podľa mesiacov' }) {
  const [hot, setHot] = useState(null)
  if (!months.length) return <p className="eko-empty">V období nie sú žiadne dáta.</p>
  const W = 760, H = 260, L = 46, R = 40, T = 22, B = 36, pw = W - L - R, ph = H - T - B
  const max = niceMax(Math.max(...months.map((m) => m.revenue), 1)), n = months.length, gap = Math.min(14, pw / n * 0.3), bw = (pw - gap * (n - 1)) / n
  const hasOcc = months.some((m) => m.occupancy != null)
  const occY = (o) => T + ph - (Math.min(100, o) / 100) * ph
  const path = hasOcc ? months.map((m, i) => `${i ? 'L' : 'M'}${L + i * (bw + gap) + bw / 2},${occY(m.occupancy || 0)}`).join(' ') : ''
  const future = (m) => m.future
  return (
    <figure className="eko-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + ph - f * ph} y2={T + ph - f * ph} stroke={GRID} /><text x={L - 8} y={T + ph - f * ph + 4} textAnchor="end" className="eko-ax">{fmtAxis(max * f)}</text></g>)}
        {hasOcc && [0, 50, 100].map((o) => <text key={o} x={W - R + 8} y={occY(o) + 4} className="eko-ax o">{o} %</text>)}
        {months.map((m, i) => {
          const x = L + i * (bw + gap), h = (m.revenue / max) * ph, on = hot === i
          return (
            <g key={m.key} tabIndex={0} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)} className="eko-bar-g">
              <title>{`${m.label}${m.partial ? ' (' + m.days + ' dní)' : ''}: ${money(m.revenue)} · ${decimal(m.nights, 0)} nocí${m.occupancy != null ? ' · obsadenosť ' + pct(m.occupancy) : ''}${m.adr ? ' · ' + money(m.adr) + ' / noc' : ''}`}</title>
              <rect x={x} y={T + ph - h} width={bw} height={Math.max(h, 1)} rx={Math.min(8, bw / 2)} fill={future(m) ? '#F46D1655' : on ? ORANGE : GREEN} stroke={future(m) ? ORANGE : 'none'} strokeDasharray={future(m) ? '4 3' : undefined} />
              {(on || n <= 8) && <text x={x + bw / 2} y={T + ph - h - 7} textAnchor="middle" className="eko-val">{fmtAxis(m.revenue)}</text>}
              <text x={x + bw / 2} y={H - 12} textAnchor="middle" className={'eko-ax' + (on ? ' on' : '')}>{m.label}{m.partial ? '*' : ''}</text>
            </g>
          )
        })}
        {hasOcc && <path d={path} fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity=".9" />}
        {hasOcc && months.map((m, i) => <circle key={m.key} cx={L + i * (bw + gap) + bw / 2} cy={occY(m.occupancy || 0)} r={hot === i ? 5 : 3.5} fill="#fff" stroke={ORANGE} strokeWidth="2" />)}
      </svg>
      <figcaption className="eko-legend"><span><i style={{ background: GREEN }} />výnos rezervácií</span>{hasOcc && <span><i className="line" style={{ background: ORANGE }} />obsadenosť</span>}{months.some(future) && <span><i style={{ background: '#F46D1655', border: '1px dashed ' + ORANGE }} />už rezervované (budúcnosť)</span>}{months.some((m) => m.partial) && <span>* neúplný mesiac ({months.filter((m) => m.partial).map((m) => m.days + ' ' + (m.days === 1 ? 'deň' : m.days < 5 ? 'dni' : 'dní')).join(', ')})</span>}</figcaption>
    </figure>
  )
}

/** Dve čiary od bodu 1: obdobie A a B po úsekoch. */
export function CompareChart({ A, B, daysA, daysB, dateA, dateB, step, normalize }) {
  const [hot, setHot] = useState(null)
  const W = 760, H = 250, L = 52, T = 18, R = 20, BM = 40, pw = W - L - R, ph = H - T - BM
  const max = niceMax(Math.max(1, ...A.map((p) => p.value), ...B.map((p) => p.value))), maxDays = Math.max(daysA, daysB)
  const x = (p) => L + ((p.offset + (p.days - 1) / 2) / Math.max(1, maxDays - 1)) * pw, y = (p) => T + ph - (p.value / max) * ph
  const unit = step === 1 ? 'deň' : step === 7 ? 'týždeň' : 'úsek'
  return (
    <figure className="eko-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Porovnanie výnosu období A a B od začiatku obdobia">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + ph - f * ph} y2={T + ph - f * ph} stroke={GRID} /><text x={L - 8} y={T + ph - f * ph + 4} textAnchor="end" className="eko-ax">{fmtAxis(max * f)}</text></g>)}
        {[[B, MIST, 'B', dateB], [A, ORANGE, 'A', dateA]].map(([s, color, name, dat]) => (
          <g key={name}>
            <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" points={s.map((p) => x(p) + ',' + y(p)).join(' ')} />
            {s.map((p, i) => <circle key={i} cx={x(p)} cy={y(p)} r={hot === name + i ? 6 : s.length > 65 ? 2 : 4} fill={color} onMouseEnter={() => setHot(name + i)} onMouseLeave={() => setHot(null)}><title>{`${name} · ${unit} ${i + 1} (${dat(p.offset)} – ${dat(p.offset + p.days - 1)}): ${money(p.value)}${normalize ? ' / deň' : ''}`}</title></circle>)}
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={L + f * pw} y={H - 12} textAnchor="middle" className="eko-ax">{unit} {Math.round((f * Math.max(0, maxDays - 1)) / step) + 1}</text>)}
      </svg>
      <figcaption className="eko-legend"><span><i className="line" style={{ background: ORANGE }} />obdobie A</span><span><i className="line" style={{ background: MIST }} />obdobie B</span></figcaption>
    </figure>
  )
}

/** Prstenec podielov kanálov + zoznam. */
export function Donut({ parts, total }) {
  const id = useId()
  const colors = [GREEN, ORANGE, '#5B8E7D', '#C9A227', '#7A6C9E', '#B5543A', '#9BB0A5']
  const R = 54, C = 2 * Math.PI * R
  let acc = 0
  if (!total) return <p className="eko-empty">V období nie sú rezervované výnosy.</p>
  return (
    <div className="eko-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Podiel kanálov na výnose">
        <circle cx="70" cy="70" r={R} fill="none" stroke={GRID} strokeWidth="18" />
        {parts.map((p, i) => { const f = p.cents / total, el = <circle key={p.name} cx="70" cy="70" r={R} fill="none" stroke={colors[i % colors.length]} strokeWidth="18" strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-acc * C} transform="rotate(-90 70 70)"><title>{`${p.label}: ${money(p.cents / 100)} (${pct(f * 100)})`}</title></circle>; acc += f; return el })}
        <text x="70" y="66" textAnchor="middle" className="eko-donut-n">{parts.length}</text>
        <text x="70" y="84" textAnchor="middle" className="eko-donut-l">{parts.length === 1 ? 'kanál' : parts.length < 5 ? 'kanály' : 'kanálov'}</text>
      </svg>
      <ul>
        {parts.map((p, i) => <li key={p.name}><i style={{ background: colors[i % colors.length] }} /><span>{p.label}</span><b>{money(p.cents / 100)}</b><small>{pct((p.cents / total) * 100)}</small></li>)}
      </ul>
    </div>
  )
}

/** Malá čiara trendu (týždenné súčty). */
export function Spark({ values, color = GREEN, w = 120, h = 34 }) {
  if (!values || values.length < 2) return <svg className="eko-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />
  const max = Math.max(...values, 1), min = Math.min(...values, 0)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / (max - min || 1)) * (h - 8)}`)
  return (
    <svg className="eko-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} />
      <circle cx={pts.at(-1).split(',')[0]} cy={pts.at(-1).split(',')[1]} r="3" fill={color} />
    </svg>
  )
}

/** Histogram 2000 simulovaných výsledkov. */
export function Histogram({ values, p10, p50, p90 }) {
  const bins = Array(24).fill(0), lo = values[0], hi = values.at(-1)
  for (const v of values) bins[Math.min(23, Math.floor(((v - lo) / (hi - lo || 1)) * 24))]++
  const max = Math.max(...bins, 1), W = 760, H = 200, L = 10, pw = W - 20, ph = H - 40, bw = pw / 24
  const xOf = (v) => L + ((v - lo) / (hi - lo || 1)) * pw
  return (
    <figure className="eko-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rozdelenie 2000 simulovaných výnosov, minimum ${money(lo)}, maximum ${money(hi)}`}>
        {bins.map((n, i) => { const v = lo + ((hi - lo) * i) / 24, inBand = v >= p10 && v <= p90; return <rect key={i} x={L + i * bw + 1} y={ph - (n / max) * ph + 10} width={bw - 2} height={(n / max) * ph} rx="4" fill={inBand ? GREEN : '#173e2c33'}><title>{`${money(v)} – ${money(lo + ((hi - lo) * (i + 1)) / 24)}: ${n} scenárov`}</title></rect> })}
        {[['P10', p10], ['P50', p50], ['P90', p90]].map(([l, v]) => <g key={l}><line x1={xOf(v)} x2={xOf(v)} y1={6} y2={ph + 12} stroke={ORANGE} strokeWidth={l === 'P50' ? 3 : 1.5} strokeDasharray={l === 'P50' ? undefined : '4 3'} /><text x={xOf(v)} y={H - 18} textAnchor="middle" className="eko-ax on">{l}</text><text x={xOf(v)} y={H - 4} textAnchor="middle" className="eko-ax">{fmtAxis(v)}</text></g>)}
      </svg>
    </figure>
  )
}

/** Vodorovné páry stĺpcov (príjmy / výdavky po mesiacoch alebo A / B po kanáloch). */
export function PairBars({ rows, aLabel = 'Príjmy', bLabel = 'Výdavky', aColor = GREEN, bColor = ORANGE, format = (n) => money(n / 100) }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]))
  if (!rows.length) return <p className="eko-empty">Nie sú dáta.</p>
  return (
    <div className="eko-pairs">
      {rows.map((r) => (
        <div key={r.key} className="eko-pair">
          <strong>{r.label}</strong>
          <div><span><i style={{ width: (r.a / max) * 100 + '%', background: aColor }} /><small>{format(r.a)}</small></span><span><i style={{ width: (r.b / max) * 100 + '%', background: bColor }} /><small>{format(r.b)}</small></span></div>
        </div>
      ))}
      <div className="eko-legend"><span><i style={{ background: aColor }} />{aLabel}</span><span><i style={{ background: bColor }} />{bLabel}</span></div>
    </div>
  )
}
