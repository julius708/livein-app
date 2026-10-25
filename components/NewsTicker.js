'use client'
import { useState } from 'react'

const fmt = (d) => new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' })

/** Bežiaci pás noviniek o appkách (ako burzový ticker). Ťuknutie otvorí zoznam s plným textom. */
export default function NewsTicker({ items }) {
  const [open, setOpen] = useState(false)
  if (!items || !items.length) return null
  const strip = items.map((u) => (
    <span className="nt-it" key={u.id}><span className="nt-d">{fmt(u.created_at)}</span>{u.app && <span className="nt-app">{u.app}</span>}<span className="nt-h">{u.headline}</span><span className="nt-sep" aria-hidden="true">◆</span></span>
  ))
  return (
    <div className={`newsticker${open ? ' open' : ''}`} style={{ '--nt-dur': `${Math.max(40, items.length * 8)}s` }}>
      <button type="button" className="nt-bar" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Novinky v appkách">
        <span className="nt-lb"><span className="nt-dot" aria-hidden="true" />NOVINKY</span>
        <span className="nt-track" aria-hidden={open}>
          <span className="nt-run">{strip}</span>
          <span className="nt-run" aria-hidden="true">{strip}</span>
        </span>
        <span className="nt-more" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="nt-list" role="region" aria-label="Zoznam noviniek">
          {items.map((u) => (
            <article key={u.id}><div className="nt-meta"><span className="nt-d">{fmt(u.created_at)}</span>{u.app && <span className="nt-app">{u.app}</span>}<b>{u.headline}</b></div><p>{u.text}</p>{u.url && <a href={u.url}>Otvoriť ↗</a>}</article>
          ))}
          <p className="nt-foot">Zmeny v appkách sa zapisujú sem, nie na nástenku. Nástenka ostáva tímu.</p>
        </div>
      )}
    </div>
  )
}
