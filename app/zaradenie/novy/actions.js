'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { geocode } from '@/lib/onb-geo'
import { createUnitTask } from '@/lib/onb-asana'

/** Nájde adresu na mape (OpenStreetMap) a vráti mesto, PSČ, súradnice a zónu city tax. */
export async function lookupAddress(prev, formData) {
  const { user } = await getViewer()
  if (!user) return { ok: false, error: 'Nie si prihlásený/á.' }
  const address = String(formData.get('address') || '').trim()
  if (address.length < 5) return { ok: false, error: 'Zadaj ulicu, číslo a mesto.' }
  try {
    const hit = await geocode(address)
    if (!hit) return { ok: false, error: 'Adresa sa na mape nenašla. Skús pridať mesto alebo PSČ.', address }
    return { ok: true, address, hit }
  } catch (e) { return { ok: false, error: e.message, address } }
}

/** Uloží byt, vytvorí mu v Asane čistú kópiu šablóny a presmeruje na detail. */
export async function createUnit(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const g = (k) => String(formData.get(k) || '').trim()
  const p = { address: g('address'), street: g('street'), city: g('city'), zip: g('zip'), lat: g('lat'), lng: g('lng'), city_tax_zone: g('city_tax_zone') || 'ine',
    sqm: g('sqm'), bedrooms: g('bedrooms'), capacity: g('capacity'), floor: g('floor'), unit_type: g('unit_type') || 'vlastne', responsible: g('responsible'), planned_launch: g('planned_launch'),
    owner_info: { name: g('owner_name'), phone: g('owner_phone'), email: g('owner_email'), note: g('owner_note') } }
  if (p.address.length < 5) return { ok: false, error: 'Chýba adresa.' }
  const { data: id, error } = await s.rpc('onb_unit_create', { p })
  if (error) return { ok: false, error: error.message }
  const { data: unit } = await s.rpc('onb_unit_get', { p_id: id })
  let warn = ''
  try {
    const notes = `Byt: ${p.address}\nMesto: ${p.city} ${p.zip}\nTyp: ${p.unit_type}\nSpálne: ${p.bedrooms || '?'} · Kapacita: ${p.capacity || '?'} · m²: ${p.sqm || '?'} · Poschodie: ${p.floor || '?'}\nZónu city tax: ${p.city_tax_zone}\nZaložené v LIVE-IN appke (Zaradenie bytov), ${me.name}.`
    const r = await createUnitTask({ address: p.address, notes, steps: (unit && unit.steps) || [] })
    await s.rpc('onb_unit_asana', { p_id: id, p_task_gid: r.task_gid, p_section_gid: r.section_gid, p_url: r.url, p_steps: r.steps })
  } catch (e) { warn = e.message }
  revalidatePath('/zaradenie')
  redirect(`/zaradenie/${id}${warn ? `?asana=${encodeURIComponent(warn)}` : ''}`)
}
