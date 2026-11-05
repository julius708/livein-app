'use client'
import { fmtDate } from '@/lib/fmt'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { TESTS, ranked, typeLabel } from '@/lib/personality-tests'
import { advice } from '@/lib/personality-team'
import { setShared } from '@/app/testy/actions'
import Radar from '@/components/Radar'

export function ResultBars({ testKey, scores }) {
  const rows = ranked(testKey, scores || {})
  return (
    <div className="ts-bars">
      {rows.map((r, k) => <div key={r.d} className="ts-bar"><span>{r.name}</span><div className="ts-track"><div className={'ts-fill' + (k < 2 ? ' top' : '')} style={{ width: r.pct + '%' }} /></div><b>{r.pct} %</b></div>)}
    </div>
  )
}

/** Karta výsledku: odznak, pavučina, stĺpce, rada pre spoluprácu; pri vlastnom výsledku prepínač zdieľania. */
export default function ResultCard({ row, own = false }) {
  const T = TESTS[row.test_key]
  const [shared, setSharedState] = useState(!!row.shared)
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  if (!T) return null
  const dims = Object.keys(T.dims)
  const labels = Object.fromEntries(dims.map((d) => [d, T.dims[d][0].split(' (')[0].split(' /')[0]]))
  const toggle = (val) => start(async () => { setErr(''); const r = await setShared(row.id, val); if (r.ok) setSharedState(val); else setErr(r.error) })
  return (
    <article className="card ts-rcard">
      <div className="ts-rcard-grid">
        <div>
          <div className="ts-head"><span className="ts-icon" aria-hidden="true">{T.icon}</span><h3>{T.title}</h3><span className="muted">{fmtDate(row.created_at)}</span></div>
          <p className="tg-type small">{typeLabel(row.test_key, row.summary)}</p>
          <ResultBars testKey={row.test_key} scores={row.scores} />
          <ul className="tb-advice small">{advice(row.test_key, row.scores || {}).map((x) => <li key={x.d}><b>{x.name}</b><span>{x.text}</span></li>)}</ul>
        </div>
        <Radar dims={dims} labels={labels} series={[{ scores: row.scores || {}, color: '#173E2C' }]} size="sm" />
      </div>
      {own && (
        <div className="ts-row sp">
          <label className="ts-share"><input type="checkbox" checked={shared} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> Zdieľať s tímom</label>
          <span><Link className="btn line" href="/testy/tim">Porovnať s tímom</Link> <Link className="btn line" href={'/testy/' + row.test_key}>Vyplniť znova</Link></span>
        </div>
      )}
      {err && <p className="msg err">{err}</p>}
    </article>
  )
}
