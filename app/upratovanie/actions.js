'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { clContext, rpc, managerData, taskDetail } from '@/lib/cl-server'
import { proposeAssignments } from '@/lib/cl-assign'
import { geocode } from '@/lib/cl-geo'
import { staffPatch, eurToCents, isYmd, todayBa } from '@/lib/cl-core'

const NO = { ok: false, error: 'Táto časť je pre manažérku upratovania.' }
const DEMO = { ok: false, error: 'Upratovanie ešte nie je spustené v databáze (ukážkový režim). Zmeny sa zatiaľ neukladajú.' }

async function manager() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { err: { ok: false, error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' } }
  const c = await clContext(v)
  if (c.demo) return { err: DEMO }
  if (!c.isManager) return { err: NO }
  return { v, c }
}
const refresh = () => revalidatePath('/upratovanie')

export async function assignAction(taskId, email, reason) {
  const m = await manager(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_assign', { p_task: taskId, p_email: email || null, p_reason: reason || (email ? 'ručne manažérkou' : null), p_distance: null, p_auto: false })
  if (r.ok) refresh()
  return r
}

/** Návrh priradenia z čerstvých dát: nič nezapíše, len vráti zoznam na potvrdenie. */
export async function proposeAction({ date, from, to, options } = {}) {
  const m = await manager(); if (m.err) return m.err
  const d = await managerData(m.v.s, { date: date || todayBa() })
  const f = isYmd(from) ? from : d.from, t = isYmd(to) ? to : d.to
  const open = d.tasks.filter((x) => x.status === 'todo' && !x.cleaner_email && x.date >= f && x.date <= t)
  const assigned = d.tasks.filter((x) => x.cleaner_email && x.status !== 'cancelled')
  const opts = {}
  if (options && Number.isFinite(Number(options.rotation))) opts.rotation = Math.min(1, Math.max(0, Number(options.rotation)))
  if (options && Number.isFinite(Number(options.balance))) opts.balance = Math.min(1, Math.max(0, Number(options.balance)))
  const r = proposeAssignments({ tasks: open, staff: d.staff, flats: d.flats, assigned, history: d.history, options: opts })
  const flatName = (id) => (d.flats[id] && d.flats[id].listing_name) || id
  return {
    ok: true,
    assignments: r.assignments.map((a) => ({ ...a, flat: flatName(a.listing_id) })),
    unassigned: r.unassigned.map((u) => ({ ...u, flat: flatName(u.listing_id) })),
    total: open.length,
  }
}

export async function applyProposalAction(items) {
  const m = await manager(); if (m.err) return m.err
  const list = (Array.isArray(items) ? items : []).slice(0, 500).map((a) => ({ task_id: a.task_id, email: a.email, reason: a.reason, km: a.km }))
  if (!list.length) return { ok: false, error: 'Nie je čo priradiť.' }
  const r = await rpc(m.v.s, 'cl_assign_bulk', { p_items: list })
  if (r.ok) refresh()
  return r
}

export async function saveStaffAction(raw) {
  const m = await manager(); if (m.err) return m.err
  const p = staffPatch(raw)
  if (!p.email) return { ok: false, error: 'Chýba e-mail.' }
  const r = await rpc(m.v.s, 'cl_save_staff', { p })
  if (r.ok) refresh()
  return r
}

/** Adresa bydliska -> súradnice (OpenStreetMap) a uloženie. Manažérka vidí výsledok a môže ho opraviť ručne. */
export async function geocodeStaffAction(email, address, city) {
  const m = await manager(); if (m.err) return m.err
  const g = await geocode(address, city)
  if (!g.ok) return { ok: false, error: g.status === 'not_found' ? 'Adresu sa nepodarilo nájsť na mape. Skús ju doplniť (ulica, číslo, mesto) alebo zadaj súradnice ručne.' : g.status === 'too_short' ? 'Adresa je príliš krátka.' : 'Mapovú službu sa nepodarilo zavolať. Skús to neskôr.' }
  const r = await rpc(m.v.s, 'cl_save_staff', { p: { email, address, city, lat: g.lat, lng: g.lng, geo_source: 'geocoded' } })
  if (r.ok) refresh()
  return { ...r, lat: g.lat, lng: g.lng, label: g.label }
}

export async function decideApplicationAction(id, approve) {
  const m = await manager(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_decide_application', { p_id: id, p_approve: !!approve })
  if (r.ok) refresh()
  return r
}

/** Prihlasovací účet pre upratovačku (rovnaký postup ako v Správe appky: prvotné heslo, pri prvom prihlásení povinná zmena). Heslo sa nikde nezobrazuje. */
export async function createAccountAction(email) {
  const m = await manager(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_create_account', { p_email: email })
  if (r.ok) refresh()
  return r
}

export async function saveFlatAction(raw) {
  const m = await manager(); if (m.err) return m.err
  const r0 = raw || {}
  const p = { listing_id: String(r0.listing_id || '') }
  if (r0.access_note !== undefined) p.access_note = String(r0.access_note || '').slice(0, 2000)
  if (r0.extra_checklist !== undefined) p.extra_checklist = (Array.isArray(r0.extra_checklist) ? r0.extra_checklist : String(r0.extra_checklist || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
  if (r0.est_minutes !== undefined && r0.est_minutes !== '') p.est_minutes = Math.min(600, Math.max(10, Math.round(Number(r0.est_minutes) || 90)))
  if (r0.pay !== undefined) p.pay_cents = r0.pay === '' || r0.pay == null ? null : eurToCents(r0.pay)
  if (r0.active !== undefined) p.active = !!r0.active
  const r = await rpc(m.v.s, 'cl_save_flat', { p })
  if (r.ok) refresh()
  return r
}

export async function saveSettingAction(key, value) {
  const m = await manager(); if (m.err) return m.err
  let v = value
  if (key === 'checklist') v = (Array.isArray(value) ? value : String(value || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 60)
  else if (key === 'rules') v = { min_after_photos: Math.min(10, Math.max(0, Math.round(Number(value && value.min_after_photos) || 0))) }
  else return { ok: false, error: 'Neplatné nastavenie.' }
  const r = await rpc(m.v.s, 'cl_save_setting', { p_key: key, p_value: v })
  if (r.ok) refresh()
  return r
}

export async function postAction(text, parent, pinned) {
  const v = await getViewer()
  if (!v.user || v.blocked) return { ok: false, error: 'Prihlásenie vypršalo.' }
  const c = await clContext(v)
  if (c.demo) return DEMO
  if (!c.isManager && !c.isCleaner) return NO
  const r = await rpc(v.s, 'cl_post', { p_text: text, p_parent: parent || null, p_pinned: !!pinned })
  if (r.ok) refresh()
  return r
}
export async function removePostAction(id) {
  const m = await manager(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_remove_post', { p_id: id })
  if (r.ok) refresh()
  return r
}

export async function reopenAction(taskId, reason) {
  const m = await manager(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_reopen', { p_task: taskId, p_reason: reason || '' })
  if (r.ok) refresh()
  return r
}

export async function setTaskPayAction(taskId, eur) {
  const m = await manager(); if (m.err) return m.err
  const cents = eur === '' || eur == null ? null : eurToCents(eur)
  if (eur !== '' && eur != null && cents == null) return { ok: false, error: 'Zadaj sumu v eurách, napr. 30 alebo 12,50.' }
  const r = await rpc(m.v.s, 'cl_set_task_pay', { p_task: taskId, p_cents: cents })
  if (r.ok) refresh()
  return r
}

/** Detail úlohy do kontroly: checklist, fotky (odkazy platia hodinu) a história udalostí. */
export async function taskDetailAction(taskId) {
  const m = await manager(); if (m.err) return m.err
  return { ok: true, ...(await taskDetail(m.v.s, taskId)) }
}
