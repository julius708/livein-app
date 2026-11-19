// Upratovanie: návrh priradenia bytov upratovačkám. Čistá funkcia: nič nezapisuje, len navrhne; manažérka návrh pozrie, upraví a potvrdí.
//
// Pravidlá (každá upratovačka má vlastné v správe tímu):
//  - pracuje len v svojich dňoch (work_days) a nie v dňoch voľna (days_off),
//  - za deň nedostane viac bytov než max_per_day, za týždeň viac než max_per_week (0 = bez týždenného limitu),
//  - byt zo zoznamu excluded_listings jej appka nikdy automaticky nepriradí,
//  - ďalej než max_distance_km od bydliska nejde (0 = bez limitu),
//  - kto je bližšie, má prednosť; ak už v ten deň v okolí upratuje, ďalší byt pri nej sa jej hodí viac (zhluk),
//  - uprednostnená lokalita dostane bonus, rotácia: kto byt nedávno upratoval, dostane malú penalizáciu, aby sa striedali,
//  - záťaž sa vyrovnáva medzi upratovačkami.
import { distanceKm, isoWeekday, weekStart, round1, fmtKm } from './cl-core.js'

export const DEFAULTS = {
  rotation: 0.5, // 0 = bez rotácie, 1 = silná rotácia
  balance: 0.5, // 0 = bez vyrovnávania, 1 = silné vyrovnávanie
  unknownKm: 20, // „vzdialenosť“, keď chýbajú súradnice (neutrálne, ale horšie než blízko)
  localityBonusKm: 6,
  rotationDays: 21,
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function localityMatch(flat, list) {
  if (!flat || !list || !list.length) return null
  const hay = norm([flat.city, flat.address, flat.listing_name].filter(Boolean).join(' '))
  return list.find((l) => norm(l) && hay.includes(norm(l))) || null
}

/**
 * @param {object} p
 * @param {Array} p.tasks    nepriradené úlohy na navrhnutie [{ id, listing_id, date }]
 * @param {Array} p.staff    upratovačky [{ email, name, active, role, lat, lng, max_per_day, max_per_week, max_distance_km, work_days, days_off, preferred_localities, excluded_listings }]
 * @param {Object} p.flats   byty podľa listing_id { lat, lng, city, address, listing_name }
 * @param {Array} p.assigned už priradené úlohy v období (započítajú sa do záťaže) [{ listing_id, date, cleaner_email, status }]
 * @param {Array} p.history  nedávna história pre rotáciu [{ listing_id, date, cleaner_email }]
 * @param {object} p.options rotation, balance, ...
 */
export function proposeAssignments({ tasks, staff, flats = {}, assigned = [], history = [], options = {} }) {
  const o = { ...DEFAULTS, ...options }
  const cleaners = (staff || []).filter((s) => s.active !== false && (s.role || 'cleaner') === 'cleaner')
  // záťaž: deň -> email -> [listing_id], týždeň -> email -> počet
  const day = new Map()
  const week = new Map()
  const bump = (email, date, listing) => {
    const dk = date + '|' + email
    if (!day.has(dk)) day.set(dk, [])
    day.get(dk).push(listing)
    const wk = weekStart(date) + '|' + email
    week.set(wk, (week.get(wk) || 0) + 1)
  }
  for (const a of assigned || []) if (a.cleaner_email && a.status !== 'cancelled') bump(a.cleaner_email, a.date, a.listing_id)

  const recent = new Map() // listing -> email -> posledný dátum
  for (const h of history || []) {
    if (!h.cleaner_email) continue
    const k = h.listing_id + '|' + h.cleaner_email
    if (!recent.has(k) || recent.get(k) < h.date) recent.set(k, h.date)
  }
  const daysBetween = (a, b) => Math.abs((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86400000)

  const eligibleFor = (t) => {
    const flat = flats[t.listing_id] || {}
    const wd = isoWeekday(t.date)
    const out = []
    for (const s of cleaners) {
      if (Array.isArray(s.work_days) && s.work_days.length && !s.work_days.includes(wd)) continue
      if ((s.days_off || []).includes(t.date)) continue
      if ((s.excluded_listings || []).includes(t.listing_id)) continue
      const dn = (day.get(t.date + '|' + s.email) || []).length
      if (dn >= (s.max_per_day || 4)) continue
      const wn = week.get(weekStart(t.date) + '|' + s.email) || 0
      if (s.max_per_week > 0 && wn >= s.max_per_week) continue
      const home = distanceKm(s, flat)
      if (s.max_distance_km > 0 && home != null && home > s.max_distance_km) continue
      out.push({ s, flat, dn, wn, home })
    }
    return out
  }

  // najprv najviac obmedzené úlohy (najmenej možných upratovačiek), v rámci toho podľa dňa
  const order = [...(tasks || [])].map((t) => ({ t, n: eligibleFor(t).length })).sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.n - b.n || String(a.t.listing_id).localeCompare(String(b.t.listing_id))))

  const assignments = []
  const unassigned = []
  for (const { t } of order) {
    const el = eligibleFor(t) // prepočíta sa po každom priradení (kapacity sa menia)
    if (!el.length) {
      unassigned.push({ task_id: t.id, listing_id: t.listing_id, date: t.date, reason: whyNone(t, cleaners, flats, day, week) })
      continue
    }
    let best = null
    for (const c of el) {
      const today = day.get(t.date + '|' + c.s.email) || []
      // zhluk: ak už v ten deň upratuje, počíta sa bližšia z dvoch vzdialeností (bydlisko / iný byt toho dňa)
      let km = c.home
      let cluster = false
      for (const lid of today) {
        const d = distanceKm(flats[lid], c.flat)
        if (d != null && (km == null || d < km)) { km = d; cluster = true }
      }
      const base = km == null ? o.unknownKm : km
      const loc = localityMatch(c.flat, c.s.preferred_localities)
      const last = recent.get(t.listing_id + '|' + c.s.email)
      const rotPenalty = last && daysBetween(t.date, last) <= o.rotationDays ? o.rotation * 6 : 0
      const balPenalty = o.balance * 2 * (c.wn + c.dn)
      const score = base - (loc ? o.localityBonusKm : 0) + rotPenalty + balPenalty
      const cand = { c, km, home: c.home, cluster, loc, rotPenalty, score }
      if (!best || cand.score < best.score - 1e-9 || (Math.abs(cand.score - best.score) < 1e-9 && String(c.s.email) < String(best.c.s.email))) best = cand
    }
    const s = best.c.s
    bump(s.email, t.date, t.listing_id)
    assignments.push({ task_id: t.id, email: s.email, name: s.name, listing_id: t.listing_id, date: t.date, km: best.home != null ? round1(best.home) : null, reason: reasonText(best, s) })
  }
  return { assignments, unassigned }
}

function reasonText(b, s) {
  const parts = []
  if (b.cluster && b.km != null) parts.push(`v ten deň už upratuje neďaleko (${fmtKm(b.km)})`)
  else if (b.home != null) parts.push(`najbližšie, ${fmtKm(b.home)} od bydliska`)
  else parts.push('bez adresy, priradené podľa záťaže')
  if (b.loc) parts.push(`uprednostnená lokalita ${b.loc}`)
  if (b.rotPenalty > 0) parts.push('nedávno tu robila')
  return parts.join('; ')
}

function whyNone(t, cleaners, flats, day, week) {
  if (!cleaners.length) return 'nie je žiadna aktívna upratovačka'
  const wd = isoWeekday(t.date)
  const free = cleaners.filter((s) => !(Array.isArray(s.work_days) && s.work_days.length && !s.work_days.includes(wd)) && !(s.days_off || []).includes(t.date))
  if (!free.length) return 'v tento deň nikto nepracuje (voľno alebo mimo pracovných dní)'
  const ok = free.filter((s) => !(s.excluded_listings || []).includes(t.listing_id))
  if (!ok.length) return 'tento byt nemá žiadna upratovačka povolený'
  const withRoom = ok.filter((s) => (day.get(t.date + '|' + s.email) || []).length < (s.max_per_day || 4) && !(s.max_per_week > 0 && (week.get(weekStart(t.date) + '|' + s.email) || 0) >= s.max_per_week))
  if (!withRoom.length) return 'všetky upratovačky majú v tento deň alebo týždeň plno'
  return 'byt je ďalej, než koľko má kto povolené'
}
