'use client'
import { useEffect, useRef, useState } from 'react'

/** Menu aplikácií v hlavičke: na každej stránke, aj na mobile. Zoznam príde zo servera podľa rolí používateľa. */
export default function AppsMenu({ apps, current }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  if (!apps || !apps.length) return null
  return (
    <div className={`appsmenu${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="am-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="am-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span><span className="am-lb">Aplikácie</span>
      </button>
      {open && (
        <div className="am-panel" role="menu" aria-label="Aplikácie LIVE-IN">
          <div className="am-head">Tvoje aplikácie</div>
          <div className="am-list">
            {apps.map((a) => (
              <a key={a.id} href={a.url} role="menuitem" className={`am-item${current === a.id ? ' on' : ''}`} onClick={() => setOpen(false)}>
                <span className="am-ic" aria-hidden="true">{a.icon}</span>
                <span className="am-tx"><b>{a.title}</b><small>{a.desc}</small></span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
