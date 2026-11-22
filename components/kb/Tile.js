'use client'
import { tiltMove, tiltLeave } from './Tilt'

/** Dlaždica nástroja (rovnaká ako na domove hlavnej appky): ikona, názov, popis, „Otvoriť →“; nakláňa sa za kurzorom. */
export default function Tile({ href, icon, title, desc }) {
  return (
    <a className="tile t3d" href={href} onPointerMove={tiltMove} onPointerLeave={tiltLeave}>
      <span className="glow" aria-hidden="true" />
      <div className="ic" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="st">Otvoriť <span className="arr">→</span></div>
    </a>
  )
}
