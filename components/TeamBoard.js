'use client'
import { fmtDate } from '@/lib/fmt'
import { useMemo, useState } from 'react'
import { TESTS, TEST_KEYS } from '@/lib/personality-tests'
import { AXES, position, similarity, teamAverage, pairs, compare, advice, personColor, initials } from '@/lib/personality-team'
import Radar from '@/components/Radar'

const W = 760, H = 560, PAD = 70, R = 21

/** Interaktívny tímový pohľad: mapa, porovnanie dvoch ľudí, rozloženie dimenzií a dvojice. */
export default function TeamBoard({ people, meId }) {
  const available = TEST_KEYS.filter((k) => people.some((p) => p.by[k]))
  const [key, setKey] = useState(available[0] || 'disc')
  const list = useMemo(() => people.map((p, i) => ({ ...p, color: personColor(i), res: p.by[key] })).filter((p) => p.res), [people, key])
  const [sel, setSel] = useState(() => {
    const me = people.find((p) => p.id === meId)
    return me ? [me.id] : []
  })
  const T = TESTS[key]
  const ax = AXES[key]
  const dims = Object.keys(T.dims)
  const avg = useMemo(() => teamAverage(key, list.map((p) => ({ scores: p.res.scores }))), [key, list])
  const allPairs = useMemo(() => pairs(key, list.map((p) => ({ ...p, scores: p.res.scores }))), [key, list])
  const selected = sel.map((id) => list.find((p) => p.id === id)).filter(Boolean)
  const a = selected[0], b = selected[1]
  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-1), id]))
  // Mierka mapy sa prispôsobí tímu (najvzdialenejší človek je pri okraji) a krúžky sa jemne odtlačia, aby sa neprekrývali.
  const pts = useMemo(() => {
    const raw = list.map((p) => position(key, p.res.scores))
    const m = Math.max(0.25, ...raw.map((q) => Math.max(Math.abs(q.x), Math.abs(q.y))))
    const k = 0.82 / m
    const out = raw.map((q) => ({ cx: W / 2 + q.x * k * (W / 2 - PAD), cy: H / 2 - q.y * k * (H / 2 - PAD) }))
    for (let it = 0; it < 60; it++) for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
      const dx = out[b].cx - out[a].cx, dy = out[b].cy - out[a].cy, d = Math.hypot(dx, dy) || 0.01, min = R * 2.3
      if (d < min) { const push = (min - d) / 2, ux = dx / d, uy = dy / d; out[a].cx -= ux * push; out[a].cy -= uy * push; out[b].cx += ux * push; out[b].cy += uy * push }
    }
    const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    return Object.fromEntries(list.map((p, i) => [p.id, { cx: lim(out[i].cx, PAD + R + 4, W - PAD - R - 4), cy: lim(out[i].cy, PAD + R + 4, H - PAD - R - 4) }]))
  }, [key, list])
  const pt = (p) => pts[p.id]
  const nearest = a ? list.filter((p) => p.id !== a.id).map((p) => ({ p, sim: similarity(key, a.res.scores, p.res.scores) })).sort((x, y) => y.sim - x.sim) : []

  if (!available.length) return <p className="card ts-empty">Zatiaľ nikto nezdieľal výsledok. Buď prvý: vyplň test a zapni „Zdieľať s tímom“.</p>

  return (
    <div className="tb">
      <div className="tb-tests" role="tablist" aria-label="Test">
        {available.map((k) => <button key={k} role="tab" aria-selected={k === key} className={'tb-test' + (k === key ? ' on' : '')} onClick={() => { setKey(k) }}>{TESTS[k].icon} {TESTS[k].title} <small>{people.filter((p) => p.by[k]).length}</small></button>)}
      </div>

      <section className="card tb-map-card">
        <div className="tb-map-head">
          <div><h2>Mapa tímu · {T.title}</h2><p>{ax.how} Mierka je prispôsobená tímu. Klikni na človeka: zobrazí sa jeho profil a prepojenia na ostatných. Dvaja vybraní sa porovnajú nižšie.</p></div>
          <div className="tb-legend">{list.map((p) => <button key={p.id} className={'tb-chip' + (sel.includes(p.id) ? ' on' : '')} style={{ '--c': p.color }} onClick={() => toggle(p.id)}><i>{initials(p.name)}</i>{p.name}{p.id === meId ? ' (ja)' : ''}</button>)}</div>
        </div>
        <div className="tb-map-wrap">
          <svg className="tb-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Mapa tímu ' + T.title}>
            <defs><radialGradient id="tbg" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#eef2ea" /></radialGradient></defs>
            <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} rx="28" fill="url(#tbg)" stroke="#173e2c22" />
            <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="#173e2c22" strokeDasharray="4 6" />
            <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#173e2c22" strokeDasharray="4 6" />
            {ax.corners && [[PAD + 14, PAD + 22], [W - PAD - 14, PAD + 22], [PAD + 14, H - PAD - 12], [W - PAD - 14, H - PAD - 12]].map(([x, y], i) => <text key={i} x={x} y={y} className="tb-corner" textAnchor={i % 2 ? 'end' : 'start'}>{ax.corners[[0, 1, 3, 2][i]]}</text>)}
            <text x={PAD} y={H - PAD + 26} className="tb-axis" textAnchor="start">← {ax.x.labels[0]}</text>
            <text x={W - PAD} y={H - PAD + 26} className="tb-axis" textAnchor="end">{ax.x.labels[1]} →</text>
            <text x={PAD - 14} y={PAD - 10} className="tb-axis" textAnchor="start">↑ {ax.y.labels[1]}</text>
            <text x={PAD - 14} y={H - PAD + 48} className="tb-axis" textAnchor="start">↓ {ax.y.labels[0]}</text>
            {a && list.filter((p) => p.id !== a.id).map((p) => { const s = similarity(key, a.res.scores, p.res.scores); const A = pt(a), B = pt(p); return <line key={'l' + p.id} x1={A.cx} y1={A.cy} x2={B.cx} y2={B.cy} stroke={a.color} strokeOpacity={Math.max(0.06, ((s - 50) / 50) * 0.7)} strokeWidth={s >= 80 ? 3 : 1.5} /> })}
            {list.map((p) => { const { cx, cy } = pt(p); const on = sel.includes(p.id); const dim = sel.length && !on; return (
              <g key={p.id} className={'tb-dot' + (on ? ' on' : '') + (dim ? ' dim' : '')} transform={`translate(${cx} ${cy})`} onClick={() => toggle(p.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.id) } }} aria-label={p.name} aria-pressed={on}>
                <circle r={on ? R + 3 : R} fill={p.color} stroke="#fff" strokeWidth={on ? 4 : 2.5} />
                <text y="5" textAnchor="middle" className="tb-ini">{initials(p.name)}</text>
                {(on || list.length <= 8) && <text y={on ? R + 18 : R + 15} textAnchor="middle" className="tb-name">{p.name.split(' ')[0]}</text>}<title>{p.name + ' · ' + p.res.summary}</title>
              </g>
            ) })}
          </svg>
        </div>
      </section>

      {a && (
        <section className="tb-two">
          <article className="card tb-person" style={{ '--c': a.color }}>
            <div className="tb-ph"><i className="tb-av">{initials(a.name)}</i><div><h3>{a.name}</h3><p>{a.res.summary} · {fmtDate(a.res.created_at)}</p></div></div>
            <Radar dims={dims} labels={Object.fromEntries(dims.map((d) => [d, T.dims[d][0].split(" (")[0].split(" /")[0]]))} series={[{ scores: a.res.scores, color: a.color }, ...(b ? [{ scores: b.res.scores, color: b.color }] : []), { scores: avg, color: '#98A39B', dashed: true }]} />
            <p className="tb-note"><span className="tb-sw" style={{ background: a.color }} />{a.name.split(' ')[0]}{b && <><span className="tb-sw" style={{ background: b.color }} />{b.name.split(' ')[0]}</>}<span className="tb-sw tb-sw-avg" />priemer tímu</p>
            <ul className="tb-advice">{advice(key, a.res.scores).map((x) => <li key={x.d}><b>{x.name} {x.pct} %</b><span>{x.text}</span></li>)}</ul>
          </article>
          <article className="card tb-cmp">
            {b ? (
              <>
                <h3>{a.name.split(' ')[0]} a {b.name.split(' ')[0]}</h3>
                <SimRing value={similarity(key, a.res.scores, b.res.scores)} />
                {(() => { const c = compare(key, a.res.scores, b.res.scores); return (
                  <div className="tb-cmp-grid">
                    <div><h4>V čom sa zhodujete</h4>{c.same.map((r) => <p key={r.d}><b>{r.name}</b> {r.a} % a {r.b} %</p>)}</div>
                    <div><h4>V čom sa líšite</h4>{c.differ.map((r) => <p key={r.d}><b>{r.name}</b> {r.a} % a {r.b} %</p>)}</div>
                  </div>
                ) })()}
                <ul className="tb-advice small">{advice(key, b.res.scores).map((x) => <li key={x.d}><b>{b.name.split(' ')[0]}: {x.name}</b><span>{x.text}</span></li>)}</ul>
              </>
            ) : (
              <>
                <h3>Komu je {a.name.split(' ')[0]} najbližšie</h3>
                <p className="tb-help">Vyber na mape alebo v zozname druhého človeka a uvidíš porovnanie. Tu je poradie podľa podobnosti.</p>
                <ul className="tb-rank">{nearest.map(({ p, sim }) => <li key={p.id}><button onClick={() => toggle(p.id)} style={{ '--c': p.color }}><i>{initials(p.name)}</i><span>{p.name}</span><b>{sim} %</b><em style={{ width: sim + '%' }} /></button></li>)}</ul>
              </>
            )}
          </article>
        </section>
      )}

      <section className="card tb-dist">
        <h2>Ako je tím rozložený</h2>
        <p className="tb-help">Každá bodka je jeden človek, zvislá čiara je priemer tímu. Vidíš, kde je tím silný a kde sa ľudia dopĺňajú.</p>
        {dims.map((d) => (
          <div key={d} className="tb-row">
            <div className="tb-row-name"><b>{T.dims[d][0]}</b><span>{T.dims[d][1]}</span></div>
            <div className="tb-strip">
              <i className="tb-avg" style={{ left: avg[d] + '%' }} title={'Priemer ' + avg[d] + ' %'} />
              {list.map((p) => <button key={p.id} className={'tb-pt' + (sel.includes(p.id) ? ' on' : '')} style={{ left: (p.res.scores[d] || 0) + '%', background: p.color }} title={p.name + ' · ' + (p.res.scores[d] || 0) + ' %'} onClick={() => toggle(p.id)} aria-label={p.name + ' ' + (p.res.scores[d] || 0) + ' %'}>{initials(p.name)}</button>)}
            </div>
            <b className="tb-row-avg">{avg[d]} %</b>
          </div>
        ))}
      </section>

      {allPairs.length > 0 && (
        <section className="tb-pairs">
          <article className="card"><h3>Najpodobnejšie dvojice</h3><ul>{allPairs.slice(0, 5).map((p) => <li key={p.a.id + p.b.id}><button onClick={() => setSel([p.a.id, p.b.id])}><i style={{ background: p.a.color }}>{initials(p.a.name)}</i><i style={{ background: p.b.color }}>{initials(p.b.name)}</i><span>{p.a.name.split(' ')[0]} a {p.b.name.split(' ')[0]}</span><b>{p.sim} %</b></button></li>)}</ul></article>
          <article className="card"><h3>Najväčšie protiklady</h3><p className="tb-help">Rozdielni ľudia sa v tíme dopĺňajú. Pozri si, v čom.</p><ul>{allPairs.slice(-5).reverse().map((p) => <li key={p.a.id + p.b.id}><button onClick={() => setSel([p.a.id, p.b.id])}><i style={{ background: p.a.color }}>{initials(p.a.name)}</i><i style={{ background: p.b.color }}>{initials(p.b.name)}</i><span>{p.a.name.split(' ')[0]} a {p.b.name.split(' ')[0]}</span><b>{p.sim} %</b></button></li>)}</ul></article>
        </section>
      )}

      <section className="card tb-glossary">
        <h2>Čo znamenajú dimenzie · {T.title}</h2>
        <p className="tb-help">{T.desc}</p>
        <div className="tb-gloss">{dims.map((d) => <div key={d}><b>{T.dims[d][0]}</b><span>{T.dims[d][1]}</span></div>)}</div>
      </section>
    </div>
  )
}

/** Kruh s percentom podobnosti. */
function SimRing({ value }) {
  const r = 44, C = 2 * Math.PI * r
  const label = value >= 85 ? 'Veľmi podobní' : value >= 70 ? 'Podobní' : value >= 55 ? 'Čiastočne odlišní' : 'Dopĺňajú sa'
  return (
    <div className="tb-ring">
      <svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r={r} fill="none" stroke="#173e2c14" strokeWidth="10" /><circle cx="55" cy="55" r={r} fill="none" stroke="#F46D16" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(C * value) / 100} ${C}`} transform="rotate(-90 55 55)" /><text x="55" y="61" textAnchor="middle" className="tb-ring-v">{value} %</text></svg>
      <div><b>{label}</b><span>podobnosť profilu</span></div>
    </div>
  )
}
