// Upratovanie: poradie bytov na deň, trasa a čo si zobrať. Čisté funkcie (bez databázy a bez mapovej služby).
import { distanceKm, round1 } from './cl-core.js'

const has = (p) => p && p.lat != null && p.lng != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))

/** Poradie zastávok „vždy najbližšia ďalšia“ od bydliska (alebo od prvej zastávky, keď adresa chýba); zastávky bez súradníc idú na koniec v pôvodnom poradí. */
export function orderStops(home, stops) {
  const withGeo = stops.filter(has)
  const noGeo = stops.filter((s) => !has(s))
  const out = []
  let cur = has(home) ? home : withGeo[0] || null
  const left = [...withGeo]
  if (!has(home) && left.length) { out.push(left.shift()) }
  while (left.length) {
    let bi = 0, bd = Infinity
    left.forEach((s, i) => { const d = distanceKm(cur, s); if (d != null && d < bd) { bd = d; bi = i } })
    cur = left.splice(bi, 1)[0]
    out.push(cur)
  }
  return [...out, ...noGeo]
}

/** Vzdialenosť trasy: bydlisko → zastávky (→ späť domov, ak `back`). Vracia { km, legs } v km (vzdušnou čiarou, zaokrúhlené). */
export function routeStats(home, ordered, { back = false } = {}) {
  const pts = [...(has(home) ? [home] : []), ...ordered.filter(has), ...(back && has(home) ? [home] : [])]
  const legs = []
  for (let i = 1; i < pts.length; i++) legs.push(round1(distanceKm(pts[i - 1], pts[i]) || 0))
  return { km: round1(legs.reduce((a, b) => a + b, 0)), legs }
}

/** Odhad jazdy: vzdušná čiara × 1,35 (reálne cesty) pri ~25 km/h v meste, v minútach. */
export const travelMinutes = (km) => Math.round(((km || 0) * 1.35 * 60) / 25)

export function fmtDuration(min) {
  const m = Math.max(0, Math.round(min || 0))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')} min` : ''}`
}

const place = (s) => (has(s) ? `${s.lat},${s.lng}` : [s.address, s.city].filter(Boolean).join(', '))
/** Odkaz na trasu v Google Mapách (viac zastávok); max 9 medzizastávok. `mode`: driving | transit | walking. */
export function googleRouteUrl(home, ordered, mode = 'driving') {
  const stops = ordered.filter((s) => place(s))
  if (!stops.length) return null
  const dest = stops[stops.length - 1]
  const way = stops.slice(0, -1).slice(0, 9)
  const q = new URLSearchParams({ api: '1', destination: place(dest), travelmode: mode })
  if (has(home)) q.set('origin', `${home.lat},${home.lng}`)
  if (way.length) q.set('waypoints', way.map(place).join('|'))
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

/** Odkaz na jednu zastávku v Apple Mapách. */
export function appleStopUrl(s) {
  if (!place(s)) return null
  return has(s) ? `https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent(s.name || 'Byt')}` : `https://maps.apple.com/?q=${encodeURIComponent(place(s))}`
}

/** Čo si zobrať na deň: súčet kapsúl a bielizne z kariet Práčovne. */
export function daySupplies(tasks) {
  const caps = new Map(), linen = new Map()
  let people = 0
  for (const t of tasks) {
    const snap = t.snapshot || {}
    people += Number(t.people ?? snap.people ?? 0) || 0
    for (const c of Array.isArray(snap.capsules) ? snap.capsules : []) if (c && Number(c.n) > 0) caps.set(c.type, (caps.get(c.type) || 0) + Number(c.n))
    for (const l of Array.isArray(snap.linen) ? snap.linen : []) if (l && Number(l.n) > 0) linen.set(l.label || l.key, (linen.get(l.label || l.key) || 0) + Number(l.n))
  }
  const list = (m) => [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => a.label.localeCompare(b.label, 'sk'))
  return { capsules: list(caps), linen: list(linen), people }
}

/** Odhad práce na deň v minútach z odhadov bytov (predvolene 90). */
export function dayWorkMinutes(tasks, flats) {
  return tasks.reduce((a, t) => a + (Number((flats[t.listing_id] || {}).est_minutes) || 90), 0)
}
