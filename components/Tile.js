'use client'

/** Dlaždica nástroja: nakláňa sa za kurzorom a svieti tam, kde je myš; na dotyk reaguje stlačením. */
export default function Tile({ href, icon, title, desc }) {
  function move(e) {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
    el.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`)
  }
  function leave(e) {
    const s = e.currentTarget.style
    s.setProperty('--rx', '0deg'); s.setProperty('--ry', '0deg')
  }
  return (
    <a className="tile t3d" href={href} onPointerMove={move} onPointerLeave={leave}>
      <span className="glow" aria-hidden="true" />
      <div className="ic" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="st">Otvoriť <span className="arr">→</span></div>
    </a>
  )
}
