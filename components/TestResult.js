'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { TESTS, ranked } from '@/lib/personality-tests'
import { setShared } from '@/app/testy/actions'

export function ResultBars({ testKey, scores }) {
  const rows = ranked(testKey, scores || {})
  return (
    <div className="ts-bars">
      {rows.map((r) => <div key={r.d} className="ts-bar"><span>{r.name}</span><div className="ts-track"><div className="ts-fill" style={{ width: r.pct + '%' }} /></div><b>{r.pct} %</b></div>)}
      {rows.slice(0, 2).map((r) => <p key={'h' + r.d} className="ts-help"><b>{r.name}:</b> {r.help}</p>)}
    </div>
  )
}

/** Karta výsledku: zhrnutie, stĺpce, pri vlastnom výsledku prepínač zdieľania. */
export default function ResultCard({ row, own = false }) {
  const T = TESTS[row.test_key]
  const [shared, setSharedState] = useState(!!row.shared)
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  if (!T) return null
  const toggle = (val) => start(async () => { setErr(''); const r = await setShared(row.id, val); if (r.ok) setSharedState(val); else setErr(r.error) })
  return (
    <article className="card ts-rcard">
      <div className="ts-head"><span className="ts-icon" aria-hidden="true">{T.icon}</span><h3>{T.title}</h3><span className="muted">{new Date(row.created_at).toLocaleDateString('sk-SK')}</span></div>
      <p className="ts-sum"><b>{row.summary}</b></p>
      <ResultBars testKey={row.test_key} scores={row.scores} />
      {own && (
        <div className="ts-row sp">
          <label className="ts-share"><input type="checkbox" checked={shared} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> Zdieľať s tímom</label>
          <Link className="btn line" href={'/testy/' + row.test_key}>Vyplniť znova</Link>
        </div>
      )}
      {err && <p className="msg err">{err}</p>}
    </article>
  )
}
