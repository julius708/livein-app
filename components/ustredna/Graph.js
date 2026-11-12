'use client'
// Ústredňa – interaktívna mapa (silový graf na plátne, bez knižníc): ťahanie uzlov, posun, priblíženie kolieskom alebo dvoma prstami,
// zvýraznenie susedov, hľadanie a filter skupín. Pri obnovení údajov si uzly držia polohu.
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { GRAPH_GROUPS, groupColor } from '@/lib/hq-graph'

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const groupOf = (n) => (GRAPH_GROUPS.some((g) => g.id === n.group) ? n.group : '*')

export default function Graph({ graph, onOpen, renderInfo, height = 620 }) {
  const wrap = useRef(null), canvas = useRef(null)
  const sim = useRef({ nodes: [], links: [], adj: [], alpha: 1, pos: new Map() })
  const view = useRef({ k: 0.6, tx: 0, ty: 0, w: 800, h: 600, fitted: false })
  const ptr = useRef({ pts: new Map(), drag: null, pan: null, moved: false, pinch: 0 })
  const [hidden, setHidden] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(null)        // id vybraného uzla
  const [hover, setHover] = useState(null)
  const state = useRef({ sel: null, hover: null, query: '', dirty: true })
  state.current.sel = sel; state.current.hover = hover; state.current.query = fold(query); state.current.dirty = true

  const present = useMemo(() => GRAPH_GROUPS.filter((g) => graph.nodes.some((n) => groupOf(n) === g.id)), [graph])
  const counts = useMemo(() => { const c = {}; for (const n of graph.nodes) c[groupOf(n)] = (c[groupOf(n)] || 0) + 1; return c }, [graph])

  // prestavba simulácie pri zmene dát alebo filtra; známe uzly si nechajú polohu
  useEffect(() => {
    const s = sim.current, keep = new Map(s.nodes.map((n) => [n.id, n]))
    const idx = new Map(), nodes = []
    const order = present.map((g) => g.id)
    graph.nodes.forEach((n, i) => {
      if (hidden.has(groupOf(n))) return
      const old = keep.get(n.id) || s.pos.get(n.id)
      const gi = Math.max(0, order.indexOf(groupOf(n))), ang = (gi / Math.max(1, order.length)) * Math.PI * 2 + (i % 97) * 0.065, rad = 140 + (i % 13) * 34
      idx.set(i, nodes.length)
      nodes.push({ ...n, x: old ? old.x : Math.cos(ang) * rad, y: old ? old.y : Math.sin(ang) * rad, vx: 0, vy: 0, deg: 0, color: groupColor(groupOf(n)) })
    })
    const links = []
    for (const [a, b, w] of graph.links) { if (idx.has(a) && idx.has(b)) { const i = idx.get(a), j = idx.get(b); links.push([i, j, w]); nodes[i].deg++; nodes[j].deg++ } }
    const adj = nodes.map(() => [])
    for (const [i, j] of links) { adj[i].push(j); adj[j].push(i) }
    for (const n of nodes) n.r = n.kind === 'hub' ? 15 : n.kind === 'area' ? 10 : n.kind === 'actor' ? 8 : n.kind === 'folder' ? 4 + Math.min(5, Math.sqrt(n.deg) * 0.7) : n.kind === 'note' ? 2.6 + Math.min(7, Math.sqrt(n.deg) * 1.1) : 5
    const fresh = nodes.filter((n) => !keep.has(n.id) && !s.pos.has(n.id)).length
    s.nodes = nodes; s.links = links; s.adj = adj; s.alpha = fresh > nodes.length * 0.2 ? 1 : fresh ? 0.35 : Math.max(s.alpha, 0.05)
    if (fresh > nodes.length * 0.2) view.current.fitted = false
    state.current.dirty = true
  }, [graph, hidden, present])

  useEffect(() => {
    const cv = canvas.current, ctx = cv.getContext('2d'), s = sim.current, v = view.current
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, alive = true
    v.flow = !reduce; v.tickNo = 0
    const resize = () => { const r = wrap.current.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); v.w = r.width; v.h = r.height; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); v.dpr = d; if (!v.fitted) { v.tx = r.width / 2; v.ty = r.height / 2 } state.current.dirty = true }
    const ro = new ResizeObserver(resize); ro.observe(wrap.current); resize()

    function tick() {
      const N = s.nodes, n = N.length, a = s.alpha
      for (let i = 0; i < n; i++) {
        const p = N[i]
        for (let j = i + 1; j < n; j++) {
          const q = N[j]; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy
          if (d2 > 90000) continue
          if (d2 < 1) { dx = (i % 7) - 3 || 1; dy = (j % 5) - 2 || 1; d2 = dx * dx + dy * dy }
          const f = (1500 * (1 + (p.r + q.r) * 0.06)) / d2 * a, d = Math.sqrt(d2), fx = (dx / d) * f, fy = (dy / d) * f
          p.vx -= fx; p.vy -= fy; q.vx += fx; q.vy += fy
        }
      }
      for (const [i, j, w] of s.links) {
        const p = N[i], q = N[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1
        const rest = (p.kind === 'note' && q.kind === 'note' ? 46 : p.kind === 'folder' || q.kind === 'folder' ? 30 : 95) + (p.r + q.r), k = (w ? 0.055 : 0.03) / Math.max(1, Math.sqrt(Math.min(p.deg, q.deg)) * 0.6)
        const f = (d - rest) * k * a, fx = (dx / d) * f, fy = (dy / d) * f
        p.vx += fx; p.vy += fy; q.vx -= fx; q.vy -= fy
      }
      for (const p of N) {
        if (p.fixed) { p.vx = 0; p.vy = 0; continue }
        p.vx -= p.x * 0.0035 * a; p.vy -= p.y * 0.0035 * a
        p.vx *= 0.82; p.vy *= 0.82
        const sp = Math.hypot(p.vx, p.vy); if (sp > 40) { p.vx *= 40 / sp; p.vy *= 40 / sp }
        p.x += p.vx; p.y += p.vy
      }
      s.alpha = a * 0.992
    }
    function fit() {
      if (!s.nodes.length) return
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
      for (const p of s.nodes) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
      const k = Math.max(0.12, Math.min(1.6, 0.9 * Math.min(v.w / Math.max(60, x1 - x0), v.h / Math.max(60, y1 - y0))))
      v.k = k; v.tx = v.w / 2 - ((x0 + x1) / 2) * k; v.ty = v.h / 2 - ((y0 + y1) / 2) * k; v.fitted = true
    }
    v.fit = () => { fit(); state.current.dirty = true }
    function draw() {
      const { sel, hover, query } = state.current, N = s.nodes, d = v.dpr || 1
      const focusId = hover || sel, fi = focusId ? N.findIndex((p) => p.id === focusId) : -1
      const near = fi >= 0 ? new Set([fi, ...s.adj[fi]]) : null
      const match = query ? N.map((p) => fold(p.label + ' ' + (p.path || '')).includes(query)) : null
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, v.w, v.h)
      ctx.translate(v.tx, v.ty); ctx.scale(v.k, v.k)
      ctx.lineWidth = 1 / v.k
      for (const [i, j, w] of s.links) {
        const on = near && (i === fi || j === fi)
        if (near && !on) ctx.strokeStyle = 'rgba(255,255,255,0.025)'; else ctx.strokeStyle = on ? 'rgba(255,170,95,0.9)' : w ? 'rgba(206,232,214,0.20)' : 'rgba(206,232,214,0.09)'
        ctx.lineWidth = (on ? 1.8 : 1) / v.k
        ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke()
      }
      // dátové „pakety“ putujúce po firemných spojeniach (nie po odkazoch poznámok)
      if (v.flow) {
        const tt = performance.now() / 1000
        ctx.fillStyle = '#ffc79c'; ctx.shadowColor = '#f46d16'; ctx.shadowBlur = 10
        for (let li = 0; li < s.links.length; li++) {
          const [i, j] = s.links[li], a = N[i], b = N[j]
          if (a.kind === 'note' || a.kind === 'folder' || b.kind === 'note' || b.kind === 'folder') continue
          if (near && !(i === fi || j === fi)) continue
          const k = (tt * 0.32 + li * 0.173) % 1
          ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 2.1 / Math.max(0.6, v.k), 0, 6.2832); ctx.fill()
        }
        ctx.shadowBlur = 0
      }
      for (let i = 0; i < N.length; i++) {
        const p = N[i], dim = (near && !near.has(i)) || (match && !match[i])
        ctx.globalAlpha = dim ? 0.13 : 1
        if (!dim && (p.kind !== 'note' || i === fi || (match && match[i]))) { ctx.shadowColor = p.color; ctx.shadowBlur = (i === fi ? 26 : 12) }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832)
        if (p.kind === 'folder') { ctx.strokeStyle = p.color; ctx.lineWidth = 1.4 / Math.max(0.5, v.k); ctx.stroke() } else { ctx.fillStyle = p.color; ctx.fill() }
        ctx.shadowBlur = 0
        if (p.id === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / v.k; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4 / v.k, 0, 6.2832); ctx.stroke() }
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 0; i < N.length; i++) {
        const p = N[i], strong = p.kind === 'hub' || p.kind === 'area' || i === fi || (near && near.has(i)) || (match && match[i])
        if (!strong && !(p.r * v.k > 9) && !(p.kind === 'actor' && v.k > 0.35) && !(p.kind === 'folder' && v.k > 0.7 && p.deg > 6)) continue
        if ((near && !near.has(i)) || (match && !match[i] && i !== fi)) continue
        const size = (p.kind === 'hub' ? 15 : p.kind === 'area' ? 12.5 : 11) / v.k
        ctx.font = `${p.kind === 'hub' || p.kind === 'area' || i === fi ? 600 : 500} ${size}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`
        const text = p.label.length > 34 && i !== fi ? p.label.slice(0, 32) + '…' : p.label
        ctx.fillStyle = 'rgba(8,26,18,0.72)'; const tw = ctx.measureText(text).width
        ctx.fillRect(p.x - tw / 2 - 4 / v.k, p.y + p.r + 3 / v.k, tw + 8 / v.k, size + 5 / v.k)
        ctx.fillStyle = i === fi ? '#fff' : 'rgba(240,246,238,0.92)'
        ctx.fillText(text, p.x, p.y + p.r + 5 / v.k)
      }
    }
    function frame() {
      if (!alive) return
      if (s.alpha > 0.02 && !reduce) { tick(); if (s.nodes.length < 500) tick(); state.current.dirty = true; if (!v.fitted && s.alpha < 0.75) fit() }
      else if (!v.fitted) fit()
      if (v.flow && !document.hidden && (++v.tickNo % 2 === 0)) state.current.dirty = true   // pakety: prekresľovať ~30× za sekundu
      if (state.current.dirty) { draw(); state.current.dirty = false }
      raf = requestAnimationFrame(frame)
    }
    if (reduce) { for (let i = 0; i < 260 && s.alpha > 0.02; i++) tick(); fit() }
    raf = requestAnimationFrame(frame)
    // keď prehliadač snímky nekreslí (karta na pozadí), mapa sa rozloží naraz, aby po návrate nebola prázdna
    let frames = 0; const count = () => { frames++ }; const probe = requestAnimationFrame(count)
    const fallback = setInterval(() => { if (frames || !alive) return; for (let i = 0; i < 120 && s.alpha > 0.02; i++) tick(); fit(); draw(); state.current.dirty = false }, 700)

    const world = (e) => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top, x: (e.clientX - r.left - v.tx) / v.k, y: (e.clientY - r.top - v.ty) / v.k } }
    const hit = (w) => { let best = null, bd = 1e9; for (const p of s.nodes) { const d2 = (p.x - w.x) ** 2 + (p.y - w.y) ** 2, lim = (p.r + 7 / v.k) ** 2; if (d2 < lim && d2 < bd) { bd = d2; best = p } } return best }
    const zoomAt = (sx, sy, f) => { const k = Math.max(0.08, Math.min(5, v.k * f)); v.tx = sx - ((sx - v.tx) / v.k) * k; v.ty = sy - ((sy - v.ty) / v.k) * k; v.k = k; v.fitted = true; state.current.dirty = true }
    const down = (e) => {
      const P = ptr.current; cv.setPointerCapture(e.pointerId); P.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); P.moved = false
      if (P.pts.size === 2) { const [a, b] = [...P.pts.values()]; P.pinch = Math.hypot(a.x - b.x, a.y - b.y); P.drag = null; P.pan = null; return }
      const w = world(e), n = hit(w)
      if (n) { P.drag = n; n.fixed = true } else P.pan = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty }
    }
    const move = (e) => {
      const P = ptr.current
      if (P.pts.has(e.pointerId)) P.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (P.pts.size === 2 && P.pinch) { const [a, b] = [...P.pts.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect(); zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / P.pinch); P.pinch = dist; P.moved = true; return }
      const w = world(e)
      if (P.drag) { P.drag.x = w.x; P.drag.y = w.y; P.moved = true; s.alpha = Math.max(s.alpha, 0.25); state.current.dirty = true; return }
      if (P.pan) { if (Math.abs(e.clientX - P.pan.x) + Math.abs(e.clientY - P.pan.y) > 3) P.moved = true; v.tx = P.pan.tx + e.clientX - P.pan.x; v.ty = P.pan.ty + e.clientY - P.pan.y; v.fitted = true; state.current.dirty = true; return }
      const n = hit(w); cv.style.cursor = n ? 'pointer' : 'grab'; setHover((h) => (h === (n ? n.id : null) ? h : n ? n.id : null))
    }
    const up = (e) => {
      const P = ptr.current; P.pts.delete(e.pointerId); P.pinch = 0
      if (P.drag) { const n = P.drag; n.fixed = false; P.drag = null; if (!P.moved) setSel((cur) => (cur === n.id ? null : n.id)) }
      else if (P.pan && !P.moved) setSel(null)
      P.pan = null
    }
    const wheel = (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016))) }
    const dbl = (e) => { const n = hit(world(e)); if (n && onOpen) onOpen(n) }
    const leave = () => setHover(null)
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('dblclick', dbl); cv.addEventListener('pointerleave', leave)
    return () => { alive = false; cancelAnimationFrame(raf); cancelAnimationFrame(probe); clearInterval(fallback); ro.disconnect(); for (const p of s.nodes) s.pos.set(p.id, { x: p.x, y: p.y }); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); cv.removeEventListener('dblclick', dbl); cv.removeEventListener('pointerleave', leave) }
  }, [onOpen])

  const selNode = sel ? sim.current.nodes.find((n) => n.id === sel) || graph.nodes.find((n) => n.id === sel) : null
  const neighbours = useMemo(() => { if (!sel) return []; const s = sim.current, i = s.nodes.findIndex((n) => n.id === sel); return i < 0 ? [] : s.adj[i].map((j) => s.nodes[j]).filter((n) => n.kind !== 'folder').slice(0, 12) }, [sel, graph, hidden])
  const focus = (id) => { const s = sim.current, v = view.current, n = s.nodes.find((x) => x.id === id); if (!n) return; setSel(id); v.k = Math.max(v.k, 0.9); v.tx = v.w / 2 - n.x * v.k; v.ty = v.h / 2 - n.y * v.k; v.fitted = true; state.current.dirty = true }
  const submit = (e) => { e.preventDefault(); const q = fold(query); if (!q) return; const n = sim.current.nodes.filter((x) => fold(x.label + ' ' + (x.path || '')).includes(q)).sort((a, b) => b.deg - a.deg)[0]; if (n) focus(n.id) }
  const toggle = (id) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n })
  const found = query ? sim.current.nodes.filter((x) => fold(x.label + ' ' + (x.path || '')).includes(fold(query))).length : null

  return (
    <div className="hq-graph" ref={wrap} style={{ height }}>
      <canvas ref={canvas} aria-label="Interaktívna mapa firmy: uzly sú ľudia, agenti, úlohy, zdroje a poznámky" />
      <form className="hq-graph-search" onSubmit={submit}>
        <Icon name="search" size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hľadať v mape…" aria-label="Hľadať v mape" />
        {found != null && <span>{found}</span>}
      </form>
      <div className="hq-graph-tools">
        <button type="button" onClick={() => view.current.fit && view.current.fit()} title="Zobraziť celú mapu"><Icon name="target" size={14} />Celá mapa</button>
        <button type="button" onClick={() => { sim.current.alpha = 1; view.current.fitted = false }} title="Znova rozložiť uzly"><Icon name="refresh" size={14} />Rozložiť</button>
      </div>
      <div className="hq-graph-legend" aria-label="Skupiny v mape">
        {present.map((g) => <button type="button" key={g.id} className={hidden.has(g.id) ? 'off' : ''} aria-pressed={!hidden.has(g.id)} onClick={() => toggle(g.id)}><i style={{ background: g.color }} />{g.label}<b>{counts[g.id]}</b></button>)}
      </div>
      {selNode && (
        <aside className="hq-graph-info">
          <button type="button" className="x" aria-label="Zavrieť" onClick={() => setSel(null)}><Icon name="x" size={14} /></button>
          {renderInfo ? renderInfo(selNode) : <h3>{selNode.label}</h3>}
          {neighbours.length > 0 && <div className="nb"><small>Prepojené ({neighbours.length})</small>{neighbours.map((n) => <button type="button" key={n.id} onClick={() => focus(n.id)}><i style={{ background: n.color }} />{n.label}</button>)}</div>}
        </aside>
      )}
      <p className="hq-graph-hint">Ťahaj uzly · kolieskom alebo dvoma prstami priblíž · dvojklik otvorí</p>
    </div>
  )
}
