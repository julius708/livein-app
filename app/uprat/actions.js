'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { clContext, rpc } from '@/lib/cl-server'
import { geocode } from '@/lib/cl-geo'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { siteOrigin } from '@/lib/cl-invite'
import { notifyPeople } from '@/lib/cl-notify-server'
import { alertMessage } from '@/lib/cl-notify'
import { todayBa } from '@/lib/cl-core'

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

/** Vlastný profil: osobné údaje (telefón, adresa) a vlastný rozvrh (pracovné a voľné dni). Limity, lokality, inštrukcie a ceny nastavuje manažér; databáza ich cez profil nezmení. */
export async function saveMyProfileAction(p) {
  const m = await cleaner(); if (m.err) return m.err
  const out = {}
  for (const k of ['phone', 'address', 'city']) if (p && p[k] !== undefined) out[k] = String(p[k] || '').trim()
  if (p && Array.isArray(p.work_days)) out.work_days = p.work_days.map(Number).filter((n) => n >= 1 && n <= 7)
  if (p && Array.isArray(p.days_off)) out.days_off = p.days_off.map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 120)
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

/** Upratovačka pošle manažérom upozornenie k svojej úlohe (meškám, potrebujem pomoc, chýba tovar, nemôžem prísť); manažéri dostanú push alebo e-mail. */
export async function alertAction(taskId, kind, text) {
  const m = await cleaner(); if (m.err) return m.err
  const r = await rpc(m.v.s, 'cl_task_alert', { p_task: taskId, p_kind: kind, p_text: text || '' })
  if (!r.ok) return r
  refresh()
  try {
    const { data: t } = await m.v.s.from('cl_tasks').select('listing_name, date').eq('id', taskId).maybeSingle()
    const who = (m.c.staff && m.c.staff.name) || 'Upratovačka'
    const msg = alertMessage({ kind, cleaner: who, flat: t ? t.listing_name : 'byt', date: t ? t.date : null, text })
    // adresy manažérov: cez servisný prístup (upratovačka ich e-maily nevidí)
    const { adminClientAsync } = await import('@/lib/supabase-admin')
    const admin = await adminClientAsync()
    const day = t ? t.date : todayBa()
    const plan = await rpc(admin, 'cl_plan_data', { p_from: day, p_to: day })
    const origin = siteOrigin(await headers(), process.env)
    const items = ((plan.ok && plan.staff) || []).filter((x) => x.role === 'manager').map((x) => ({ email: x.email, ...msg }))
    after(() => notifyPeople(items, origin))
  } catch (e) { console.error('[upratovanie] upozornenie manažérom', String(e && e.message).slice(0, 100)) }
  return r
}
