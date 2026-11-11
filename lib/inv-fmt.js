// Formátovanie bez Intl, aby server aj prehliadač vypísali presne to isté (bez hydration rozdielov).
const NB = ' '
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, NB)
export const eur = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v) < 0 && Math.round(Math.abs(Number(v))) > 0 ? '−' : ''}${group(String(Math.round(Math.abs(Number(v)))))}${NB}€`)
export const eur2 = (v) => { if (v == null || !Number.isFinite(Number(v))) return '—'; const a = Math.abs(Number(v)); const [i, d] = a.toFixed(2).split('.'); return `${Number(v) < 0 && a > 0 ? '−' : ''}${group(i)},${d}${NB}€` }
export const pct1 = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(1).replace('.', ',')}${NB}%`)
export const num1 = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : String(Math.round(Number(v) * 10) / 10).replace('.', ','))
export { fmtDate, fmtDateTime } from './fmt.js'
export const ageDays = (iso, now = Date.now()) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null }
