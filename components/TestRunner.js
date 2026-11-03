'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SCALE } from '@/lib/personality-tests'
import { saveResult, setShared } from '@/app/testy/actions'
import { ResultBars } from '@/components/TestResult'

/** Priebeh testu: jedna otázka naraz, škála 1–5, na konci uloženie a výsledok. */
export default function TestRunner({ testKey, title, icon, items }) {
  const [i, setI] = useState(0)
  const [a, setA] = useState([])
  const [busy, start] = useTransition()
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [shared, setSharedState] = useState(false)
  const it = items[i]
  const pick = (v) => {
    const next = a.slice(); next[i] = v; setA(next)
    if (i < items.length - 1) { setI(i + 1); return }
    start(async () => { setErr(''); const r = await saveResult(testKey, next); if (!r.ok) { setErr(r.error); return } setRes(r) })
  }
  const toggleShare = (val) => start(async () => { const r = await setShared(res.id, val); if (r.ok) setSharedState(val); else setErr(r.error) })
  if (res) return (
    <section className="card ts-result">
      <div className="ts-head"><span className="ts-icon" aria-hidden="true">{icon}</span><span className="ts-tag ok">Hotovo</span></div>
      <h2>{title}</h2>
      <p className="ts-sum"><b>{res.summary}</b></p>
      <ResultBars testKey={testKey} scores={res.scores} />
      <label className="ts-share"><input type="checkbox" checked={shared} disabled={busy} onChange={(e) => toggleShare(e.target.checked)} /> Zdieľať výsledok s tímom</label>
      {err && <p className="msg err">{err}</p>}
      <div className="ts-row"><Link className="btn" href="/testy">Ďalší test</Link><button type="button" className="btn line" onClick={() => { setRes(null); setI(0); setA([]); setSharedState(false) }}>Vyplniť znova</button></div>
    </section>
  )
  return (
    <section className="card ts-q">
      <div className="ts-head"><span className="ts-icon" aria-hidden="true">{icon}</span><b>{title}</b><span className="muted">{i + 1} / {items.length}</span></div>
      <div className="ts-prog" aria-hidden="true"><b style={{ width: (i / items.length * 100) + '%' }} /></div>
      {it.s && <p className="ts-situation">{it.s}</p>}
      <p className="ts-stmt">{it.t}</p>
      <div className="ts-scale" role="group" aria-label="Odpoveď">
        {SCALE.map((l, k) => <button key={k} type="button" className={a[i] === k + 1 ? 'on' : ''} disabled={busy} onClick={() => pick(k + 1)} style={{ '--s': (10 + k * 4) + 'px' }}><i /><small>{l}</small></button>)}
      </div>
      <div className="ts-row sp">
        <button type="button" className="btn line" disabled={i === 0 || busy} onClick={() => setI(i - 1)}>Späť</button>
        <span className="muted">{busy ? 'Ukladám…' : 'Odpovedaj spontánne.'}</span>
      </div>
      {err && <p className="msg err">{err}</p>}
    </section>
  )
}
