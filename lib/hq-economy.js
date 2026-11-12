// Ústredňa – stručný finančný prehľad z podkladu modulu Ekonomika (ten istý výpočet ako /ekonomika, predvolený výber „aktívne byty“).
// Čistá funkcia nad snímkom D; nič nesťahuje. Výnos = rezervované výnosy z pobytov podľa Ekonomiky (história aj už rezervovaný výhľad).
import * as M from './economy-math.js'

const addMonths = (ym, k) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7) }

export function economySummary(D) {
  if (!D || !Array.isArray(D.listings) || !D.asOf || !D.rangeFrom || !D.futureTo) return null
  const units = D.listings.filter((p) => M.matches(p, M.EMPTY_FILTERS))
  if (!units.length) return null
  const last = M.lastDay(D), t = Math.max(0, Math.min(last, M.todayIndex(D)))
  const monthRange = (ym) => {
    const [y, m] = ym.split('-').map(Number)
    const a = M.dayOf(D, ym + '-01'), b = M.dayOf(D, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10))
    if (b < 0 || a > last) return null
    return { r: [Math.max(0, a), Math.min(last, b)], whole: a >= 0 && b <= last }
  }
  const tot = (r) => M.totals(units.map((p) => M.stats(p, r)))
  const pack = (ym) => {
    const mr = monthRange(ym)
    if (!mr) return null
    const x = tot(mr.r)
    return { key: ym, revenue: Math.round(x.revenue), nights: x.nights, occupancy: x.occupancy == null ? null : Math.round(x.occupancy * 10) / 10, adr: x.adr == null ? null : Math.round(x.adr), revpan: x.revpan == null ? null : Math.round(x.revpan), whole: mr.whole }
  }
  const ym = D.asOf.slice(0, 7), cur = pack(ym)
  if (!cur) return null
  const curRange = monthRange(ym).r, mtd = tot([curRange[0], Math.min(t, curRange[1])])
  const prev = pack(addMonths(ym, -1)), lastYear = pack(addMonths(ym, -12)), next = pack(addMonths(ym, 1))
  const months = []
  for (let k = -5; k <= 1; k++) { const x = pack(addMonths(ym, k)); if (x) months.push({ ...x, kind: k < 0 ? 'past' : k === 0 ? 'current' : 'booked' }) }
  const pct = (a, b) => { const c = M.change(a, b); return c == null ? null : Math.round(c) }
  return {
    asOf: D.asOf, units: units.length, month: cur, toDate: Math.round(mtd.revenue), prev, lastYear, next,
    vsPrev: prev && prev.whole ? pct(cur.revenue, prev.revenue) : null, vsLastYear: lastYear && lastYear.whole ? pct(cur.revenue, lastYear.revenue) : null, months,
  }
}
