// Deterministické formátovanie dátumov (rovnaký výstup na serveri aj v prehliadači, časová zóna Bratislava),
// aby React pri hydratácii nehlásil rozdiel medzi serverom a klientom.
const TZ = 'Europe/Bratislava'
const parts = (d) => {
  if (d === null || d === undefined || d === '') return null
  const t = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d)
  if (!Number.isFinite(t.getTime())) return null
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const o = {}
  for (const p of f.formatToParts(t)) o[p.type] = p.value
  return { d: Number(o.day), m: Number(o.month), y: o.year, hh: o.hour === '24' ? '00' : o.hour, mm: o.minute }
}
/** 5. 11. 2026 */
export const fmtDate = (d, fallback = '—') => { const p = parts(d); return p ? `${p.d}. ${p.m}. ${p.y}` : fallback }
/** 5. 11. */
export const fmtDay = (d, fallback = '—') => { const p = parts(d); return p ? `${p.d}. ${p.m}.` : fallback }
/** 5. 11. 2026 14:05 */
export const fmtDateTime = (d, fallback = '—') => { const p = parts(d); return p ? `${p.d}. ${p.m}. ${p.y} ${p.hh}:${p.mm}` : fallback }
/** 5. 11. 14:05 */
export const fmtDayTime = (d, fallback = '—') => { const p = parts(d); return p ? `${p.d}. ${p.m}. ${p.hh}:${p.mm}` : fallback }
