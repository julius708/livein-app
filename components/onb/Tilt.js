'use client'

/** Karta/odkaz s rovnakým 3D efektom ako dlaždice na domove hlavnej appky: nakláňa sa za kurzorom a svieti tam, kde je myš. */
export function tiltMove(e) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  el.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`)
}
export function tiltLeave(e) {
  const s = e.currentTarget.style
  s.setProperty('--rx', '0deg'); s.setProperty('--ry', '0deg')
}
export default function TiltLink({ href, className = '', children }) {
  return (
    <a className={`tile t3d ${className}`} href={href} onPointerMove={tiltMove} onPointerLeave={tiltLeave}>
      <span className="glow" aria-hidden="true" />
      {children}
    </a>
  )
}
