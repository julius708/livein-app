'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { SCALE, TESTS, partialScore, ranked, typeLabel } from '@/lib/personality-tests'
import { advice } from '@/lib/personality-team'
import { saveResult, setShared } from '@/app/testy/actions'
import Radar from '@/components/Radar'

const FACES = ['👎', '🤔', '😐', '🙂', '🙌']
const dimLabels = (key) => Object.fromEntries(Object.keys(TESTS[key].dims).map((d) => [d, TESTS[key].dims[d][0].split(' (')[0].split(' /')[0]]))

/** Priebeh testu ako hra: jedna otázka naraz, profil sa kreslí priebežne, na konci odhalenie výsledku. */
export default function TestRunner({ testKey, title, icon, items, teamAvg }) {
  const [i, setI] = useState(0)
  const [a, setA] = useState([])
  const [busy, start] = useTransition()
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [shared, setSharedState] = useState(false)
  const it = items[i]
  const live = partialScore(testKey, a)
  const answered = a.filter((v) => Number.isInteger(v)).length
  const pick = (v) => {
    const next = a.slice(); next[i] = v; setA(next)
    if (i < items.length - 1) { setI(i + 1); return }
    start(async () => { setErr(''); const r = await saveResult(testKey, next); if (!r.ok) { setErr(r.error); return } setRes(r) })
  }
  useEffect(() => {
    if (res) return
    const h = (e) => { const k = Number(e.key); if (k >= 1 && k <= 5 && !busy) pick(k); if (e.key === 'Backspace' && i > 0) setI(i - 1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const toggleShare = (val) => start(async () => { const r = await setShared(res.id, val); if (r.ok) setSharedState(val); else setErr(r.error) })

  if (res) return <ResultView testKey={testKey} title={title} icon={icon} scores={res.scores} summary={res.summary} teamAvg={teamAvg} shared={shared} busy={busy} err={err} onShare={toggleShare} onRetry={() => { setRes(null); setI(0); setA([]); setSharedState(false) }} />

  const lead = Object.entries(live).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1])[0]
  const pct = Math.round((answered / items.length) * 100)
  return (
    <div className="tg">
      <section className="card tg-q">
        <div className="tg-top">
          <div className="tg-title"><span className="ts-icon" aria-hidden="true">{icon}</span><b>{title}</b></div>
          <div className="tg-ring" aria-label={`Otázka ${i + 1} z ${items.length}`}><svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="25" fill="none" stroke="#173e2c14" strokeWidth="6" /><circle cx="30" cy="30" r="25" fill="none" stroke="#F46D16" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(157 * answered) / items.length} 157`} transform="rotate(-90 30 30)" /></svg><span>{i + 1}<small>/{items.length}</small></span></div>
        </div>
        <div className="tg-card" key={i}>
          {it.s && <p className="tg-situation">{it.s}</p>}
          <p className="tg-stmt">{it.t}</p>
        </div>
        <div className="tg-scale" role="group" aria-label="Odpoveď">
          {SCALE.map((l, k) => <button key={k} type="button" className={'tg-opt o' + k + (a[i] === k + 1 ? ' on' : '')} disabled={busy} onClick={() => pick(k + 1)}><span className="tg-face" aria-hidden="true">{FACES[k]}</span><small>{l}</small><kbd>{k + 1}</kbd></button>)}
        </div>
        <div className="ts-row sp">
          <button type="button" className="btn line" disabled={i === 0 || busy} onClick={() => setI(i - 1)}>← Späť</button>
          <span className="muted">{busy ? 'Vyhodnocujem…' : 'Odpovedaj spontánne, prvý pocit je správny. Klávesy 1–5.'}</span>
        </div>
        {err && <p className="msg err">{err}</p>}
      </section>
      <aside className="card tg-live">
        <h3>Tvoj profil sa kreslí</h3>
        <p className="tb-help">{answered ? `${pct} % hotových.` : 'Každá odpoveď pridá kúsok do obrazu.'} {lead ? <>Zatiaľ vedie <b>{dimLabels(testKey)[lead[0]]}</b>.</> : null}</p>
        <Radar dims={Object.keys(TESTS[testKey].dims)} labels={dimLabels(testKey)} series={[{ scores: live, color: '#F46D16' }]} size="sm" />
        <p className="tg-fine">Výsledok uvidíš celý až na konci. Nie je to skúška, nedá sa „pokaziť“.</p>
      </aside>
    </div>
  )
}

/** Odhalenie výsledku: odznak, pavučina s priemerom tímu, stĺpce, čo to znamená a zdieľanie. */
export function ResultView({ testKey, title, icon, scores, summary, teamAvg, shared, busy, err, onShare, onRetry }) {
  const T = TESTS[testKey]
  const dims = Object.keys(T.dims)
  const rows = ranked(testKey, scores)
  const adv = advice(testKey, scores)
  const low = rows[rows.length - 1]
  return (
    <div className="tg-result">
      <section className="card tg-hero">
        <div className="tg-hero-txt">
          <span className="ts-tag ok">Hotovo</span>
          <h2>{icon} {title}</h2>
          <p className="tg-type">{typeLabel(testKey, summary)}</p>
          <p className="tb-help">{T.desc}</p>
          <label className="ts-share big"><input type="checkbox" checked={shared} disabled={busy} onChange={(e) => onShare(e.target.checked)} /> Zdieľať s tímom a vidieť, komu som podobný</label>
          {err && <p className="msg err">{err}</p>}
        </div>
        <div className="tg-hero-chart">
          <Radar dims={dims} labels={dimLabels(testKey)} series={[{ scores, color: '#173E2C' }, ...(teamAvg ? [{ scores: teamAvg, color: '#F46D16', dashed: true }] : [])]} />
          <p className="tb-note"><span className="tb-sw" style={{ background: '#173E2C' }} />ty{teamAvg && <><span className="tb-sw" style={{ background: '#F46D16' }} />priemer tímu</>}</p>
        </div>
      </section>
      <section className="tg-two">
        <article className="card">
          <h3>Tvoje dimenzie</h3>
          <div className="ts-bars">{rows.map((r, k) => <div key={r.d} className="ts-bar"><span>{r.name}</span><div className="ts-track"><div className={'ts-fill' + (k < 2 ? ' top' : '')} style={{ width: r.pct + '%' }} /></div><b>{r.pct} %</b></div>)}</div>
        </article>
        <article className="card">
          <h3>Čo to o tebe hovorí</h3>
          <ul className="tb-advice">{adv.map((x) => <li key={x.d}><b>{x.name} {x.pct} %</b><span>{T.dims[x.d][1]} {x.text}</span></li>)}</ul>
          {low && <p className="tg-low"><b>Najmenej výrazné: {low.name} ({low.pct} %).</b> {low.help} Nie je to slabina, skôr oblasť, kde ti kolegovia môžu pomôcť.</p>}
        </article>
      </section>
      <div className="ts-row">
        <Link className="btn" href="/testy/tim">Porovnať sa s tímom →</Link>
        <Link className="btn line" href="/testy">Ďalší test</Link>
        {onRetry && <button type="button" className="btn line" onClick={onRetry}>Vyplniť znova</button>}
      </div>
    </div>
  )
}
