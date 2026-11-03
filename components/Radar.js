'use client'
/** Pavučinový graf: každá dimenzia je lúč, hodnota 0–100 %. series: [{scores, color, dashed?}]. */
export default function Radar({ dims, labels, series, size = 'md' }) {
  const Wd = 460, Ht = 300, cx = Wd / 2, cy = Ht / 2, r = 100
  const n = dims.length
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const p = (i, val) => [cx + Math.cos(ang(i)) * r * (val / 100), cy + Math.sin(ang(i)) * r * (val / 100)]
  const ring = (val) => dims.map((_, i) => p(i, val).join(',')).join(' ')
  return (
    <svg className={'tb-radar ' + size} viewBox={`0 0 ${Wd} ${Ht}`} role="img" aria-label="Profil">
      {[25, 50, 75, 100].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="#173e2c1f" />)}
      {dims.map((d, i) => { const [x, y] = p(i, 100); const [lx, ly] = p(i, 126); const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx < cx ? 'end' : 'start'; return <g key={d}><line x1={cx} y1={cy} x2={x} y2={y} stroke="#173e2c1f" /><text x={lx} y={ly + 4} textAnchor={anchor} className="tb-rlabel">{labels[d]}</text></g> })}
      {series.map((s, k) => <polygon key={k} className="tb-poly" points={dims.map((d, i) => p(i, s.scores[d] == null ? 0 : s.scores[d]).join(',')).join(' ')} fill={s.dashed ? 'none' : s.color} fillOpacity={0.18} stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? '5 4' : undefined} />)}
      {series.filter((s) => !s.dashed).map((s, k) => dims.map((d, i) => { const [x, y] = p(i, s.scores[d] == null ? 0 : s.scores[d]); return <circle key={k + d} cx={x} cy={y} r="3.5" fill={s.color} stroke="#fff" strokeWidth="1.5" /> }))}
    </svg>
  )
}
