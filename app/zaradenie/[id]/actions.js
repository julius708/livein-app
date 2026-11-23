'use server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { updateSubtask, createUnitTask } from '@/lib/onb-asana'

async function ctx() { const v = await getViewer(); if (!v.user || !v.me) throw new Error('Nie si prihlásený/á.'); return v }

/** Odklikne krok (aj v Asane) alebo ho vráti späť. */
export async function toggleStep(formData) {
  const { s, me } = await ctx()
  const id = Number(formData.get('step_id')), unitId = String(formData.get('unit_id') || ''), done = formData.get('done') === '1'
  const gid = String(formData.get('asana_gid') || ''), taskGid = String(formData.get('task_gid') || '')
  if (gid) { const r = await updateSubtask(gid, { completed: done }, done ? `Hotovo – odklikol/la ${me.name} v LIVE-IN appke (Zaradenie bytov).` : null); if (!r.ok) return { ok: false, error: r.error } }
  const { error } = await s.rpc('onb_step_set', { p_step_id: id, p: { status: done ? 'done' : 'todo' } })
  if (error) return { ok: false, error: error.message }
  if (taskGid) revalidateTag(`unit-${taskGid}`)
  revalidatePath(`/zaradenie/${unitId}`); revalidatePath('/zaradenie')
  return { ok: true }
}

/** Zmení osobu, termín alebo poznámku kroku; osoba a termín idú aj do Asany. */
export async function setStepMeta(formData) {
  const { s } = await ctx()
  const id = Number(formData.get('step_id')), unitId = String(formData.get('unit_id') || ''), gid = String(formData.get('asana_gid') || ''), taskGid = String(formData.get('task_gid') || '')
  const p = {}
  if (formData.has('assignee_gid')) { const ag = String(formData.get('assignee_gid') || ''); p.assignee_gid = ag; p.assignee = String(formData.get('assignee_name') || ''); if (gid) { const r = await updateSubtask(gid, { assignee: ag || null }); if (!r.ok) return { ok: false, error: r.error } } }
  if (formData.has('due_on')) { const d = String(formData.get('due_on') || ''); p.due_on = d; if (gid) { const r = await updateSubtask(gid, { due_on: d || null }); if (!r.ok) return { ok: false, error: r.error } } }
  if (formData.has('note')) p.note = String(formData.get('note') || '').slice(0, 500)
  const { error } = await s.rpc('onb_step_set', { p_step_id: id, p })
  if (error) return { ok: false, error: error.message }
  if (taskGid) revalidateTag(`unit-${taskGid}`)
  revalidatePath(`/zaradenie/${unitId}`)
  return { ok: true }
}

export async function updateUnit(prev, formData) {
  const { s, me } = await ctx()
  const id = String(formData.get('id') || '')
  const g = (k) => String(formData.get(k) || '').trim()
  const p = { status: g('status'), responsible: g('responsible'), planned_launch: g('planned_launch'), sqm: g('sqm'), bedrooms: g('bedrooms'), capacity: g('capacity'), floor: g('floor') }
  if (formData.has('owner_name')) p.owner_info = { name: g('owner_name'), phone: g('owner_phone'), email: g('owner_email'), note: g('owner_note') }
  const { error } = await s.rpc('onb_unit_update', { p_id: id, p })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/zaradenie/${id}`); revalidatePath('/zaradenie')
  return { ok: true, n: Date.now() }
}

export async function saveListing(prev, formData) {
  const { s } = await ctx()
  const id = String(formData.get('id') || '')
  const data = {}
  for (const [k, v] of formData.entries()) { if (k === 'id') continue; if (k.endsWith('[]')) { const kk = k.slice(0, -2); (data[kk] ||= []).push(String(v)) } else data[k] = String(v) }
  const { error } = await s.rpc('onb_listing_save', { p_id: id, p_data: data })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/zaradenie/${id}?karta=listing`)
  return { ok: true, n: Date.now() }
}

/** Dodatočne vytvorí úlohu v Asane pre byt, ktorý sa založil bez nej. */
export async function retryAsana(formData) {
  const { s, me } = await ctx()
  const id = String(formData.get('id') || '')
  const { data: u } = await s.rpc('onb_unit_get', { p_id: id })
  if (!u || u.asana_task_gid) return
  const r = await createUnitTask({ address: u.address, notes: `Byt: ${u.address}\nMesto: ${u.city || ''} ${u.zip || ''}\nZaložené v LIVE-IN appke, ${me.name}.`, steps: u.steps })
  await s.rpc('onb_unit_asana', { p_id: id, p_task_gid: r.task_gid, p_section_gid: r.section_gid, p_url: r.url, p_steps: r.steps })
  revalidatePath(`/zaradenie/${id}`); revalidatePath('/zaradenie')
}
