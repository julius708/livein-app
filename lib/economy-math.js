/**
 * Ekonomika bytov – výpočtové jadro (čisté funkcie, bez DOM).
 * Snímok D: { rangeFrom, historicalTo, asOf, futureTo, readAt, listings[], bank?, coverage, limitations, expertReport }
 * Každý byt má denné polia (revenueCents, nightFlags, arrivals, cancelledArrivals) od rangeFrom po futureTo
 * a channelDays { 'dayIndex|Kanál': cents }.
 */
const DAY = 86400000

// ---------- formátovanie ----------
export const nf = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 })
export const money = (n) => (n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n))
export const money2 = (n) => (n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n))
export const compact = (n) => (n == null ? '—' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' M €' : Math.abs(n) >= 1e4 ? Math.round(n / 1000) + ' tis. €' : money(n))
export const pct = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d).replace('.', ',') + ' %')
export const decimal = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('sk-SK', { maximumFractionDigits: d }).format(n))
export const signed = (s) => (s == null ? '—' : (s.startsWith('-') || s.startsWith('−') ? s : '+' + s))
export const prettyDate = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—')
export const monthLabel = (ym) => { const [y, m] = ym.split('-'); return ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'][Number(m) - 1] + ' ' + y.slice(2) }
export const monthLong = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('sk-SK', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const normalized = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const skPlural = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c)

// ---------- dni a intervaly ----------
export const dayOf = (D, s) => Math.round((Date.parse(s) - Date.parse(D.rangeFrom)) / DAY)
export const dateOf = (D, i) => new Date(Date.parse(D.rangeFrom) + i * DAY).toISOString().slice(0, 10)
export const lastDay = (D) => dayOf(D, D.futureTo)
export const todayIndex = (D) => dayOf(D, D.asOf)

/** Platný interval [a,b] v dňoch od rangeFrom, inak null. */
export function range(D, from, to) {
  const a = dayOf(D, from), b = dayOf(D, to), max = lastDay(D)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > max || a > b) return null
  return [a, b]
}
export const clampRange = (D, [a, b]) => [Math.max(0, a), Math.min(lastDay(D), b)]
export const days = ([a, b]) => b - a + 1

/** Predchádzajúce rovnako dlhé obdobie (null, keď pred začiatkom dát nie je nič). */
export function previous(D, [a, b]) {
  const len = b - a + 1
  if (a - len < 0) return a === 0 ? null : [0, a - 1]
  return [a - len, a - 1]
}

export const PRESETS = [
  { id: 'history', label: '12 mesiacov' },
  { id: '30', label: 'Posledných 30 dní' },
  { id: '90', label: 'Posledných 90 dní' },
  { id: 'month', label: 'Aktuálny mesiac' },
  { id: 'future', label: 'Ďalších 90 dní' },
]
export function preset(D, which) {
  const end = dayOf(D, D.historicalTo)
  if (which === 'future') return [todayIndex(D), lastDay(D)]
  if (which === 'month') return [Math.max(0, dayOf(D, D.historicalTo.slice(0, 7) + '-01')), end]
  if (which === '30') return [Math.max(0, end - 29), end]
  if (which === '90') return [Math.max(0, end - 89), end]
  return [0, end]
}
export function rangeNature(D, [a, b]) {
  const t = todayIndex(D)
  if (a >= t) return 'už rezervovaný výhľad'
  if (b >= t) return 'história a už rezervovaný výhľad'
  return 'historické pobyty'
}

// ---------- štatistiky bytov ----------
const cache = new WeakMap()
function prefix(p) {
  if (cache.has(p)) return cache.get(p)
  const sums = {}
  for (const key of ['revenueCents', 'nightFlags', 'arrivals', 'cancelledArrivals']) {
    const v = p[key] || [], s = new Float64Array(v.length + 1)
    for (let i = 0; i < v.length; i++) s[i + 1] = s[i] + v[i]
    sums[key] = s
  }
  cache.set(p, sums)
  return sums
}
export function stats(p, [a, b]) {
  const s = prefix(p), get = (k) => s[k][b + 1] - s[k][a]
  const cents = get('revenueCents'), nights = get('nightFlags'), arrivals = get('arrivals'), cancelled = get('cancelledArrivals'), n = b - a + 1
  return {
    p, cents, revenue: cents / 100, nights, arrivals, cancelled, days: n,
    daily: cents / 100 / n, nightDaily: nights / n, occupancy: (nights / n) * 100,
    adr: nights ? cents / 100 / nights : null,
    value: nights && p.capacity ? cents / 100 / nights / p.capacity : null,
    storno: arrivals + cancelled ? (cancelled / (arrivals + cancelled)) * 100 : null,
  }
}
export function totals(rows) {
  const t = { cents: 0, nights: 0, arrivals: 0, cancelled: 0, units: rows.length, days: rows[0] ? rows[0].days : 0 }
  for (const r of rows) { t.cents += r.cents; t.nights += r.nights; t.arrivals += r.arrivals; t.cancelled += r.cancelled }
  t.revenue = t.cents / 100
  t.adr = t.nights ? t.revenue / t.nights : null
  t.storno = t.arrivals + t.cancelled ? (t.cancelled / (t.arrivals + t.cancelled)) * 100 : null
  const available = t.units * t.days
  t.occupancy = available ? (t.nights / available) * 100 : null
  t.revpan = available ? t.revenue / available : null // výnos na dostupnú noc (kalendár výberu)
  t.daily = t.days ? t.revenue / t.days : 0
  return t
}
export const change = (a, b) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100)

/** Kanály: { názov: cents } v intervale. */
export function channels(rows, [a, b]) {
  const out = {}
  for (const { p } of rows) for (const key in p.channelDays) {
    const split = key.indexOf('|'), i = Number(key.slice(0, split))
    if (i >= a && i <= b) { const name = key.slice(split + 1); out[name] = (out[name] || 0) + p.channelDays[key] }
  }
  return out
}
export const channelLabel = (c) => ({ 'Booking.com': 'Booking.com', airbnb: 'Airbnb', airbnb2: 'Airbnb', manual: 'Priamo / ručne', direct: 'Priamo', expedia: 'Expedia', vrbo: 'Vrbo' }[c] || c)

/** Rad hodnôt po úsekoch (týždne/dni/30 dní) – { offset, days, cents, value }. */
export function series(rows, [a, b], width = 7, normalize = false) {
  const out = []
  for (let start = a; start <= b; start += width) {
    const end = Math.min(start + width - 1, b)
    let cents = 0
    for (const r of rows) { const s = prefix(r.p).revenueCents; cents += s[end + 1] - s[start] }
    out.push({ offset: start - a, days: end - start + 1, cents, value: cents / 100 / (normalize ? end - start + 1 : 1) })
  }
  return out
}
/** Mesačné súčty v intervale: [{ key:'2026-03', cents, nights, days, units }]. */
export function monthly(D, rows, [a, b]) {
  const buckets = new Map()
  for (let i = a; i <= b; i++) {
    const key = dateOf(D, i).slice(0, 7)
    let m = buckets.get(key)
    if (!m) { m = { key, cents: 0, nights: 0, days: 0 }; buckets.set(key, m) }
    m.days++
    for (const r of rows) { m.cents += r.p.revenueCents[i] || 0; m.nights += r.p.nightFlags[i] || 0 }
  }
  return [...buckets.values()].map((m) => {
    const [y, mo] = m.key.split('-').map(Number), inMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    return { ...m, partial: m.days < inMonth, revenue: m.cents / 100, occupancy: rows.length ? (m.nights / (m.days * rows.length)) * 100 : null, adr: m.nights ? m.cents / 100 / m.nights : null }
  })
}
/** Denný rad výnosu (centy) pre jeden byt alebo výber – na sparkline. */
export function dailySeries(rows, [a, b]) {
  const out = new Array(b - a + 1).fill(0)
  for (const r of rows) { const v = r.p.revenueCents; for (let i = a; i <= b; i++) out[i - a] += v[i] || 0 }
  return out
}

// ---------- filtre ----------
export const EMPTY_FILTERS = { scope: 'active', city: 'all', bedrooms: 'all', capacity: 'all', group: 'all', model: 'all', quality: 'all', q: '' }
/** Zjednotené mesto (zdroj má „Bratislava I“, „Bratislava - Old Town“ …). */
export function cityOf(p) {
  const c = String(p.city || '')
  if (/bratislava/i.test(c)) return 'Bratislava'
  if (/ko[sš]ice/i.test(c)) return 'Košice'
  return c || 'Neuvedené'
}
export function matches(p, f) {
  if (f.scope === 'active' && !p.active) return false
  if (f.scope === 'inactive' && p.active) return false
  if (f.city !== 'all' && cityOf(p) !== f.city) return false
  for (const k of ['bedrooms', 'capacity', 'group', 'model']) if (f[k] !== 'all' && String(p[k] ?? '') !== f[k]) return false
  if (f.quality === 'overlap' && !(p.overlaps > 0)) return false
  if (f.quality === 'clean' && p.overlaps > 0) return false
  if (f.q && !normalized(p.name + ' ' + p.city + ' ' + p.title).includes(normalized(f.q.trim()))) return false
  return true
}
export function filterOptions(D) {
  const uniq = (k) => [...new Set(D.listings.map((p) => String(p[k] ?? '')))].sort((a, b) => a.localeCompare(b, 'sk', { numeric: true }))
  return { cities: [...new Set(D.listings.map(cityOf))].sort((a, b) => a.localeCompare(b, 'sk')), bedrooms: uniq('bedrooms'), capacity: uniq('capacity'), group: uniq('group'), model: uniq('model') }
}
export const optionLabel = (k, v) => (v === '' ? 'Neuvedené' : k === 'bedrooms' ? (v === '0' ? 'Štúdio' : v + ' ' + skPlural(Number(v), 'spálňa', 'spálne', 'spální')) : k === 'capacity' ? v + ' hostí' : v)

// ---------- scenáre výhľadu ----------
export const EVENTS = [
  { id: 'none', label: 'Bez mimoriadnej udalosti', impact: 0 },
  { id: 'demand', label: 'Pokles dopytu: −25 % dopredaja', impact: -0.25 },
  { id: 'channel', label: 'Výpadok kanála: −15 % dopredaja', impact: -0.15 },
  { id: 'outage', label: 'Byty mimo prevádzky: −10 % dopredaja', impact: -0.1 },
  { id: 'festival', label: 'Silné podujatie: +20 % dopredaja', impact: 0.2 },
]
export const DEFAULT_FORECAST = { pickup: 50, price: 0, cancel: 5, uncertainty: 30, event: 'none', probability: 20 }
export function simulate(booked, reference, options = {}) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const pickup = clamp(Number(options.pickup) || 0, 0, 200) / 100, price = clamp(Number(options.price) || 0, -50, 50) / 100
  const cancel = clamp(Number(options.cancel) || 0, 0, 100) / 100, uncertainty = clamp(Number(options.uncertainty) || 0, 0, 100) / 100
  const impact = (EVENTS.find((e) => e.id === options.event) || EVENTS[0]).impact, prob = clamp(Number(options.probability) || 0, 0, 100) / 100
  const extra = Math.max(0, reference - booked) * pickup * (1 + price), retained = booked * (1 - cancel), base = retained + extra
  let seed = 20261012
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const values = []
  for (let i = 0; i < 2000; i++) { const factor = 1 + (random() + random() - 1) * uncertainty, hit = random() < prob; values.push(Math.max(0, retained + extra * factor * (hit ? 1 + impact : 1))) }
  values.sort((a, b) => a - b)
  return { booked, reference, retained, extra, base, eventImpact: extra * impact, stress: Math.max(0, retained + extra * (1 + impact)), p10: values[199], p50: values[999], p90: values[1799], values }
}

// ---------- banka ----------
export function bankMonths(b, { entity, account = 'all', from, to }) {
  const rows = b.rows.filter((r) => r.entity === entity && r.from.slice(0, 7) >= from && r.from.slice(0, 7) <= to && (account === 'all' || account === r.account))
  const months = new Map()
  for (const r of rows) {
    const m = r.from.slice(0, 7)
    let x = months.get(m)
    if (!x) { x = { month: m, credit: 0, debit: 0, opening: 0, closing: 0, count: 0, accounts: 0 }; months.set(m, x) }
    x.credit += r.creditCents; x.debit += r.debitCents; x.opening += r.openingCents; x.closing += r.closingCents; x.count += r.count; x.accounts++
  }
  const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  return { rows, list, credit: rows.reduce((n, r) => n + r.creditCents, 0), debit: rows.reduce((n, r) => n + r.debitCents, 0), closing: list.at(-1)?.closing ?? 0, last: list.at(-1) || null }
}

// ---------- CSV ----------
export function csv(header, lines) {
  const quote = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const safe = (v) => (/^\s*[=+\-@]/.test(String(v)) ? "'" + v : v)
  return '﻿' + [header, ...lines].map((r) => r.map((v) => quote(typeof v === 'string' ? safe(v) : v)).join(';')).join('\r\n')
}

/** Rozklad zmeny výnosu medzi obdobiami na objem (noci) a cenu (ADR). */
export function decompose(A, B) {
  if (A.adr == null || B.adr == null) return { volume: null, price: null }
  return { volume: (A.nights - B.nights) * B.adr, price: (A.adr - B.adr) * A.nights }
}
