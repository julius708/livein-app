// Upratovanie: výpočty pre týždenný kalendár (zaťaženie upratovačiek, upozornenia pri presune úlohy). Čisté funkcie, bez databázy.
import { distanceKm, isoWeekday, fmtKm, weekStart } from './cl-core.js'

const live = (t) => t.status !== 'cancelled'

/** Stav dňa pre upratovačku: 'off' = voľno (dovolenka), 'rest' = nepracuje v tento deň týždňa, 'ok' = pracuje. */
export function dayState(staff, day) {
  if (!staff) return 'ok'
  if ((staff.days_off || []).includes(day)) return 'off'
  if (Array.isArray(staff.work_days) && staff.work_days.length && !staff.work_days.includes(isoWeekday(day))) return 'rest'
  return 'ok'
}

/** Koľko úloh má upratovačka v daný deň (zrušené sa nepočítajú); `except` = úloha, ktorú práve presúvame. */
export function dayLoad(tasks, email, day, except) {
  return tasks.filter((t) => live(t) && t.cleaner_email === email && t.date === day && t.id !== except).length
}
export function weekLoad(tasks, email, day, except) {
  const ws = weekStart(day)
  return tasks.filter((t) => live(t) && t.cleaner_email === email && weekStart(t.date) === ws && t.id !== except).length
}

/** Zaťaženie pre bunku a týždeň: { n, max, level } kde level = 'ok' | 'full' | 'over'. */
export function cellLoad(tasks, staff, day) {
  const n = dayLoad(tasks, staff.email, day)
  const max = staff.max_per_day || 4
  return { n, max, level: n > max ? 'over' : n === max ? 'full' : 'ok' }
}

/** Upozornenia pred priradením úlohy upratovačke (manažér ich môže obísť, ale má ich vidieť). */
export function assignWarnings({ task, staff, flat, tasks }) {
  if (!staff || !task) return []
  const w = []
  const st = dayState(staff, task.date)
  if (st === 'off') w.push(`${staff.name} má v tento deň voľno.`)
  else if (st === 'rest') w.push(`${staff.name} v tento deň týždňa nepracuje.`)
  if ((staff.excluded_listings || []).includes(task.listing_id)) w.push('Tento byt má upratovačka vylúčený.')
  const dn = dayLoad(tasks, staff.email, task.date, task.id)
  if (dn + 1 > (staff.max_per_day || 4)) w.push(`Mala by mať najviac ${staff.max_per_day || 4} bytov za deň, už má ${dn}.`)
  const wn = weekLoad(tasks, staff.email, task.date, task.id)
  if (staff.max_per_week > 0 && wn + 1 > staff.max_per_week) w.push(`Mala by mať najviac ${staff.max_per_week} bytov za týždeň, už má ${wn}.`)
  const km = distanceKm(staff, flat)
  if (staff.max_distance_km > 0 && km != null && km > staff.max_distance_km) w.push(`Byt je ${fmtKm(km)} od jej bydliska (limit ${staff.max_distance_km} km).`)
  return w
}

/** Odporúčané upratovačky pre úlohu: tie bez upozornení, najbližšie prvé; max `n`. */
export function recommend({ task, staffList, flat, tasks }, n = 3) {
  return staffList
    .map((s) => ({ s, km: distanceKm(s, flat), warn: assignWarnings({ task, staff: s, flat, tasks }) }))
    .filter((x) => x.warn.length === 0)
    .sort((a, b) => (a.km == null) - (b.km == null) || a.km - b.km || dayLoad(tasks, a.s.email, task.date) - dayLoad(tasks, b.s.email, task.date))
    .slice(0, n)
}

/** Dá sa úloha presunúť? Hotovú, zrušenú ani rozbehnutú (inej upratovačke) nie. */
export function canMove(task, toEmail) {
  if (!task) return { ok: false, why: 'Úloha neexistuje.' }
  if (task.status === 'done') return { ok: false, why: 'Hotovú úlohu nemožno presunúť. Najprv ju vráť do práce v Kontrole.' }
  if (task.status === 'cancelled') return { ok: false, why: 'Zrušená úloha sa nedá presunúť.' }
  if (task.status === 'in_progress' && (task.cleaner_email || null) !== (toEmail || null)) return { ok: false, why: 'Upratovanie už prebieha, nedá sa presunúť.' }
  return { ok: true }
}

/** Farba avatara upratovačky (stabilná podľa e-mailu). */
const PALETTE = ['#2E9E5B', '#3B7DD8', '#B0602F', '#7A4FB0', '#C2487A', '#1F8A94', '#8A6D1F', '#5B6B2E']
export function avatarColor(email) {
  let h = 0
  for (const c of String(email || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
