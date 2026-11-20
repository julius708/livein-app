// Upratovanie: čisté pomocné funkcie (dátumy, vzdialenosť, cena práce, kontrola vstupov). Bez prístupu k databáze, takže sa dajú testovať.

export const WEEKDAYS = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa']
export const WEEKDAYS_SHORT = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']

export const STATUS_LABEL = { todo: 'Čaká', in_progress: 'Prebieha', done: 'Hotovo', cancelled: 'Zrušené' }
export const PHOTO_KIND_LABEL = { before: 'Pred', after: 'Po', issue: 'Problém' }

/** Dnešný dátum v Bratislave (YYYY-MM-DD); `now` sa dá podstrčiť v testoch. */
export function todayBa(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return p
}

const D = (s) => new Date(s + 'T12:00:00Z')
export function addDays(ymd, n) {
  const d = D(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** 1 = pondelok .. 7 = nedeľa */
export function isoWeekday(ymd) {
  const w = D(ymd).getUTCDay()
  return w === 0 ? 7 : w
}
export function weekStart(ymd) {
  return addDays(ymd, 1 - isoWeekday(ymd))
}
export function weekDays(ymd) {
  const s = weekStart(ymd)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}
export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(D(s).getTime()) && D(s).toISOString().slice(0, 10) === s
}
export function dayLabel(ymd) {
  const d = D(ymd)
  return `${WEEKDAYS_SHORT[isoWeekday(ymd) - 1]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`
}
export function dayLabelLong(ymd, today) {
  if (today && ymd === today) return 'Dnes'
  if (today && ymd === addDays(today, 1)) return 'Zajtra'
  const d = D(ymd)
  return `${WEEKDAYS[isoWeekday(ymd) - 1]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`
}

// ---------------------------------------------------------------- vzdialenosť

/** Vzdušná čiara v km (haversine); null, keď chýbajú súradnice. */
export function distanceKm(a, b) {
  if (!a || !b) return null
  const la1 = Number(a.lat), lo1 = Number(a.lng), la2 = Number(b.lat), lo2 = Number(b.lng)
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1)
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
export const round1 = (n) => Math.round(n * 10) / 10
export const fmtKm = (n) => (n == null ? '—' : String(round1(n)).replace('.', ',') + ' km')

// ---------------------------------------------------------------- cena práce

/** Suma v centoch -> "12,50 €". */
export function fmtEur(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—'
  const v = Number(cents) / 100
  return v.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €'
}
/** Zadané eurá ("8,5", "12.50", "8 €") -> centy; null pri prázdnom alebo neplatnom vstupe. */
export function eurToCents(raw) {
  if (raw == null) return null
  const t = String(raw).replace(/€/g, '').replace(/\s/g, '').replace(',', '.')
  if (t === '' || !/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}
export const centsToInput = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2).replace('.', ','))

/** Odpracované minúty zo štartu a konca (0 až 12 hodín); null, keď úloha ešte nemá oboje. */
export function workedMinutes(task) {
  if (!task || !task.started_at || !task.finished_at) return null
  const ms = new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.min(720, Math.round(ms / 60000))
}

/**
 * Cena práce za jednu úlohu.
 * Poradie: ručná oprava od manažérky -> sadzba za hodinu (z odpracovaného času; kým úloha beží, z odhadu bytu) -> cena bytu -> sadzba za upratovanie.
 * Vracia { cents, source, minutes } alebo { cents: null } keď nie je podľa čoho počítať.
 */
export function payForTask(task, staff, flat) {
  if (!task) return { cents: null, source: 'none', minutes: null }
  if (task.pay_override_cents != null) return { cents: Number(task.pay_override_cents), source: 'manual', minutes: workedMinutes(task) }
  if (!staff) return { cents: null, source: 'none', minutes: null }
  if (staff.pay_type === 'hourly') {
    const rate = Number(staff.hourly_rate_cents) || 0
    if (!rate) return { cents: null, source: 'none', minutes: null }
    const worked = workedMinutes(task)
    if (worked != null) return { cents: Math.round((rate * worked) / 60), source: 'hourly', minutes: worked }
    const est = flat && Number(flat.est_minutes) > 0 ? Number(flat.est_minutes) : 90
    return { cents: Math.round((rate * est) / 60), source: 'hourly_est', minutes: est }
  }
  if (flat && flat.pay_cents != null) return { cents: Number(flat.pay_cents), source: 'flat', minutes: workedMinutes(task) }
  const rate = Number(staff.task_rate_cents) || 0
  if (!rate) return { cents: null, source: 'none', minutes: workedMinutes(task) }
  return { cents: rate, source: 'rate', minutes: workedMinutes(task) }
}

export const PAY_SOURCE_LABEL = {
  manual: 'ručne upravené',
  hourly: 'za hodinu (odpracované)',
  hourly_est: 'za hodinu (odhad bytu)',
  flat: 'cena bytu',
  rate: 'sadzba za upratovanie',
  none: 'sadzba nie je nastavená',
}

/**
 * Súhrn nákladov za obdobie po upratovačkách: len dokončené úlohy sú „na vyplatenie“, ostatné idú do odhadu.
 * Vracia [{ email, done, doneCents, estCents, minutes, missing }] a súčet.
 */
export function payrollSummary(tasks, staffList, flatsById = {}) {
  const staffBy = Object.fromEntries((staffList || []).map((s) => [s.email, s]))
  const by = {}
  for (const t of tasks || []) {
    if (!t.cleaner_email || t.status === 'cancelled') continue
    const s = staffBy[t.cleaner_email]
    const r = by[t.cleaner_email] || (by[t.cleaner_email] = { email: t.cleaner_email, name: s ? s.name : t.cleaner_email, done: 0, doneCents: 0, estCents: 0, minutes: 0, missing: 0 })
    const p = payForTask(t, s, flatsById[t.listing_id])
    if (p.cents == null) { r.missing += 1; continue }
    if (t.status === 'done') { r.done += 1; r.doneCents += p.cents; r.minutes += p.minutes || 0 } else r.estCents += p.cents
  }
  const list = Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const total = list.reduce((acc, r) => ({ doneCents: acc.doneCents + r.doneCents, estCents: acc.estCents + r.estCents, done: acc.done + r.done }), { doneCents: 0, estCents: 0, done: 0 })
  return { list, total }
}

// ---------------------------------------------------------------- kontrola vstupov od manažérky

const intIn = (v, lo, hi) => {
  if (v === '' || v == null) return undefined
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return undefined
  return Math.min(hi, Math.max(lo, n))
}
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map((x) => String(x).trim()).filter(Boolean)

/**
 * Formulár „Tím“ -> parameter pre cl_save_staff. Posiela sa len to, čo je vo formulári vyplnené, ostatné ostáva ako bolo.
 * Sadzby zadáva manažérka v eurách, do databázy idú centy.
 */
export function staffPatch(raw) {
  const r = raw || {}
  const out = { email: String(r.email || '').trim().toLowerCase() }
  if (r.name != null) out.name = String(r.name).trim()
  if (r.role === 'manager' || r.role === 'cleaner') out.role = r.role
  for (const k of ['phone', 'address', 'city', 'note', 'instructions']) if (r[k] !== undefined) out[k] = String(r[k] ?? '').trim()
  const d = intIn(r.max_per_day, 1, 12); if (d !== undefined) out.max_per_day = d
  const w = intIn(r.max_per_week, 0, 60); if (w !== undefined) out.max_per_week = w
  const km = intIn(r.max_distance_km, 0, 200); if (km !== undefined) out.max_distance_km = km
  if (r.work_days !== undefined) out.work_days = [...new Set((Array.isArray(r.work_days) ? r.work_days : []).map(Number).filter((n) => n >= 1 && n <= 7))].sort()
  if (r.days_off !== undefined) out.days_off = [...new Set(lines(r.days_off).filter(isYmd))].sort()
  if (r.preferred_localities !== undefined) out.preferred_localities = lines(r.preferred_localities).map((x) => x.slice(0, 80))
  if (r.excluded_listings !== undefined) out.excluded_listings = lines(r.excluded_listings)
  if (r.active !== undefined) out.active = !!r.active
  if (r.pay_type === 'hourly' || r.pay_type === 'per_task') out.pay_type = r.pay_type
  if (r.hourly_rate !== undefined) { const c = eurToCents(r.hourly_rate); if (c != null && c <= 100000) out.hourly_rate_cents = c }
  if (r.task_rate !== undefined) { const c = eurToCents(r.task_rate); if (c != null && c <= 1000000) out.task_rate_cents = c }
  if (r.lat !== undefined) out.lat = r.lat === '' || r.lat == null ? null : Number(r.lat)
  if (r.lng !== undefined) out.lng = r.lng === '' || r.lng == null ? null : Number(r.lng)
  if (r.geo_source !== undefined) out.geo_source = r.geo_source || null
  return out
}

/** Úloha pripravená na zobrazenie: snapshot z Práčovne zredukovaný na to, čo upratovačka potrebuje. */
export function taskView(t) {
  const snap = (t && t.snapshot) || {}
  const capsules = Array.isArray(snap.capsules) ? snap.capsules.filter((c) => c && c.n > 0) : []
  return {
    people: t.people ?? snap.people ?? null,
    capsules,
    capsuleCount: capsules.reduce((a, c) => a + Number(c.n || 0), 0),
    linen: Array.isArray(snap.linen) ? snap.linen.filter((l) => l && Number(l.n) > 0).map((l) => ({ label: l.label || l.key, n: Number(l.n) })) : [],
    checklist: Array.isArray(snap.checklist) ? snap.checklist : [],
    note: t.pack_note || '',
  }
}

/** Pomer hotových bodov checklistu. */
export function progress(items) {
  const n = (items || []).length
  const done = (items || []).filter((i) => i.done).length
  return { done, n, pct: n ? Math.round((done / n) * 100) : 0 }
}
