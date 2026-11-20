'use client'
import { useEffect, useRef } from 'react'

/** Okno alebo bočný panel: zatvára sa Esc, klikom mimo alebo krížikom; vráti zameranie, kam bolo predtým. */
export default function Modal({ title, onClose, side = false, wide = false, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current && ref.current.focus()
    const k = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o; if (prev && prev.focus) prev.focus() }
  }, [onClose])
  return (
    <div className="up-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'up-modal' + (side ? ' side' : '') + (wide ? ' wide' : '')}>
        <header><h2>{title}</h2><button type="button" className="up-x" onClick={onClose} aria-label="Zavrieť">✕</button></header>
        <div className="up-modal-body">{children}</div>
      </div>
    </div>
  )
}
