'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { clContext, rpc } from '@/lib/cl-server'
import { geocode } from '@/lib/cl-geo'
import { isYmd } from '@/lib/cl-core'

const NO = { ok: false, error: 'Táto časť je pre upratovačky.' }
const DEMO = { ok: false, error: 'Upratovanie ešte nie je spustené v databáze (ukážkový režim).' }

async function cleaner() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { err: { ok: false, error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' } }
  const c = await clContext(v)
  if (c.demo) return { err: DEMO }
  if (!c.isCleaner && !c.isManager) return { err: NO }
  return { v, c }
}
const refresh = () => { revalidatePath('/uprat'); revalidatePath('/upratovanie') }

export async function startTaskAction(id) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_start_task', { p_task: id })
  if (r.ok) refresh()
  return r
}
export async function toggleItemAction(id, done) {
  const m = await cleaner(); if (m.err) return m.err
  return rpc(m.v.s, 'cl_toggle_item', { p_item: id, p_done: !!done })
}
export async function addPhotoAction(taskId, kind, path, note) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_add_photo', { p_task: taskId, p_kind: kind, p_path: path, p_note: note || null })
  if (r.ok) refresh()
  return r
}
export async function removePhotoAction(id) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_remove_photo', { p_photo: id })
  if (r.ok) refresh()
  return r
}
export async function reportProblemAction(taskId, text) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_report_problem', { p_task: taskId, p_text: text })
  if (r.ok) refresh()
  return r
}
export async function finishTaskAction(taskId, note) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_finish_task', { p_task: taskId, p_note: note || '' })
  if (r.ok) refresh()
  return r
}

/** Vlastný profil: adresa, telefón, pracovné a voľné dni. Limity, inštrukcie a cenu mení len manažérka. */
export async function saveMyProfileAction(p) {
  const m = await cleaner(); if (m.err) return m.err
  const out = {}
  for (const k of ['phone', 'address', 'city']) if (p && p[k] !== undefined) out[k] = String(p[k] || '').trim()
  if (p && Array.isArray(p.work_days)) out.work_days = p.work_days.map(Number).filter((n) => n >= 1 && n <= 7)
  if (p && p.days_off !== undefined) out.days_off = String(p.days_off || '').split(/[\n,;]+/).map((x) => x.trim()).filter(isYmd)
  const r = await rpc(m.v.s, 'cl_save_my_profile', { p: out })
  if (r.ok) refresh()
  return r
}
export async function geocodeMyAddressAction(address, city) {
  const m = await cleaner(); if (m.err) return m.err
  const g = await geocode(address, city)
  if (!g.ok) return { ok: false, error: g.status === 'not_found' ? 'Adresu sa nepodarilo nájsť na mape. Doplň ulicu, číslo a mesto.' : g.status === 'too_short' ? 'Adresa je príliš krátka.' : 'Mapovú službu sa nepodarilo zavolať. Skús to neskôr.' }
  const r = await rpc(m.v.s, 'cl_save_my_profile', { p: { address, city, lat: g.lat, lng: g.lng, geo_source: 'geocoded' } })
  if (r.ok) refresh()
  return { ...r, lat: g.lat, lng: g.lng }
}
