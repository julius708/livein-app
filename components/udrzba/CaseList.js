'use client'
import { useState } from 'react'
import { STATUSES, SEVERITIES, OPEN_STATUSES, categoryOf } from '@/lib/maint'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '')
const GROUPS = { open: 'Otvorené', approval: 'Čaká na majiteľa', ordered: 'Objednané', closed: 'Uzavreté', all: 'Všetky' }
const inGroup = (c, g) => g === 'all' || (g === 'open' && OPEN_STATUSES.includes(c.status)) || (g === 'approval' && ['awaiting_approval', 'question', 'no_response'].includes(c.status)) || (g === 'ordered' && ['ordered', 'in_progress', 'done'].includes(c.status)) || (g === 'closed' && ['closed', 'cancelled', 'duplicate'].includes(c.status))

export default function CaseList({ cases = [], now }) {
  const [g, setG] = useState('open'); const [q, setQ] = useState('')
  const rows = cases.filter((c) => inGroup(c, g)).filter((c) => !q || `${c.ref} ${c.listing_name} ${c.symptoms}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Prípady</h2>
        <div className="ud-filters">{Object.entries(GROUPS).map(([k, l]) => <button key={k} type="button" className={g === k ? 'on' : ''} onClick={() => setG(k)}>{l} <small>{cases.filter((c) => inGroup(c, k)).length}</small></button>)}</div>
      </div>
      <input type="text" placeholder="Hľadať (číslo, byt, príznaky)" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '10px 0' }} />
      {rows.length === 0 && <p className="hint">Nič tu nie je.</p>}
      <div className="ud-list">
        {rows.map((c) => {
          const over = c.due_at && OPEN_STATUSES.includes(c.status) && Date.parse(c.due_at) < now
          return (
            <a key={c.id} href={`/udrzba/${c.id}`} className={`ud-item${over ? ' over' : ''}`}>
              <span className="ud-ref">{c.ref}</span>
              <span><span className="t">{c.listing_name || c.listing_id} · {categoryOf(c.category).label}</span><br /><span className="m">{String(c.symptoms || '').slice(0, 110)}</span><br /><span className="m">{fmt(c.created_at)} · {c.created_by_name || ''}{c.due_at ? ` · termín ${fmt(c.due_at)}` : ''}{over ? ' · PO TERMÍNE' : ''}</span></span>
              <span className="row"><span className={`ud-pill ${c.severity}`}>{SEVERITIES[c.severity]?.label}</span><span className={`ud-pill st-${c.status}`}>{STATUSES[c.status] || c.status}</span></span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
