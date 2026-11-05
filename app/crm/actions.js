'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { changeStage, flushQueue } from '@/lib/crm-server'
import { cityGroup, route, normalizePhone, normalizeSource, STAGE_IDS, LOST_REASONS } from '@/lib/crm'

async function crmViewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Najprv sa prihlás.' }
  if (!(v.me.roles || []).includes('crm')) return { error: 'CRM je len pre obchodný tím.' }
  return v
}
const who = (v) => ({ email: v.user.email.toLowerCase(), name: v.me.name || v.user.email })
const isUuid = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || ''))
/** Priradiť sa dá len aktívnemu členovi s rolou CRM; vráti e-mail alebo null. */
async function crmPerson(s, email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return null
  const { data } = await s.from('app_users').select('email').eq('active', true).contains('roles', ['crm']).ilike('email', e).maybeSingle()
  return data ? data.email.toLowerCase() : null
}

/** Zmena štádia (zapíše sa do leads, histórie, HubSpotu a Asany). */
export async function setStage(leadId, stage, opts = {}) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  if (!STAGE_IDS.includes(stage)) return { ok: false, error: 'Neznáme štádium.' }
  if (stage === 'lost' && !LOST_REASONS.includes(String(opts.lost_reason || '').split(' · ')[0]) && !opts.lost_reason) return { ok: false, error: 'Vyber dôvod straty.' }
  const r = await changeStage(v.s, leadId, stage, who(v), { lost_reason: String(opts.lost_reason || '').slice(0, 300), note: String(opts.note || '').slice(0, 2000), connected: !!opts.connected, property_address: String(opts.property_address || '').slice(0, 300) })
  revalidatePath('/crm'); revalidatePath(`/crm/lead/${leadId}`)
  return r
}
/** Zavolal / napísal na WhatsApp / e-mail / SMS: len do histórie (a prvý kontakt). */
export async function logContact(leadId, type, note = '') {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  if (!['call', 'whatsapp', 'email', 'sms'].includes(type)) return { ok: false, error: 'Neznáma akcia.' }
  const { error } = await v.s.from('lead_events').insert({ lead_id: leadId, type, payload: note ? { note: String(note).slice(0, 1000) } : {}, user_email: who(v).email, user_name: who(v).name })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
export async function addNote(leadId, text) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const t = String(text || '').trim().slice(0, 2000)
  if (!t) return { ok: false, error: 'Prázdna poznámka.' }
  const { error } = await v.s.from('lead_events').insert({ lead_id: leadId, type: 'note', payload: { note: t }, user_email: who(v).email, user_name: who(v).name })
  if (error) return { ok: false, error: error.message }
  await v.s.from('leads').update({ notes: t }).eq('id', leadId)
  revalidatePath(`/crm/lead/${leadId}`)
  return { ok: true }
}
/** Ručne pridaný lead (telefón, odporúčanie…). HubSpot a Asana sa doplnia cez frontu, keď sú kľúče. */
export async function createManualLead(form) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  const name = String(form.name || '').trim().slice(0, 160), phone = normalizePhone(form.phone) || null, email = String(form.email || '').trim().toLowerCase().slice(0, 160) || null
  const city = String(form.city || '').trim().slice(0, 120) || null, group = cityGroup(city), source = normalizeSource(form.source), r = route(group)
  if (!name && !phone && !email) return { ok: false, error: 'Zadaj aspoň meno a telefón.' }
  const now = new Date().toISOString()
  const assignee = (form.assigned_to && await crmPerson(v.s, form.assigned_to)) || r.assigned_to
  const { data, error } = await v.s.from('leads').insert({ name: name || phone || email, phone, email, city, city_group: group, source, kind: 'lead', stage: 'new', priority: r.priority, received_at: now, due_at: new Date(Date.now() + r.alarm_hours * 3600e3).toISOString(), alarm_hours: r.alarm_hours, assigned_to: assignee, notes: String(form.note || '').slice(0, 2000) || null }).select('id').single()
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: data.id, type: 'system', payload: { via: 'manual', by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  await v.s.from('crm_sync_queue').insert({ lead_id: data.id, target: 'hubspot', action: 'create', payload: {} })
  if (assignee !== who(v).email) await v.s.from('notifications').insert({ user_email: assignee, lead_id: data.id, kind: 'new_lead', title: `Nový lead: ${name || phone || email}`, body: [group !== 'Iné' ? group : city || '', source].filter(Boolean).join(' · '), url: `/crm/lead/${data.id}` })
  await flushQueue(v.s, 3).catch(() => {})
  revalidatePath('/crm')
  return { ok: true, id: data.id }
}
export async function assignLead(leadId, email) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const person = email ? await crmPerson(v.s, email) : null
  if (email && !person) return { ok: false, error: 'Tento človek nemá rolu CRM.' }
  const { error } = await v.s.from('leads').update({ assigned_to: person }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { assigned_to: email }, user_email: who(v).email, user_name: who(v).name })
  revalidatePath('/crm'); return { ok: true }
}
/** Skryť z fronty (nie lead: banky, dodávatelia…) alebo vrátiť. */
export async function setKind(leadId, kind) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  if (!['lead', 'not_lead'].includes(kind)) return { ok: false, error: 'Neznámy typ.' }
  const { error } = await v.s.from('leads').update({ kind }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/crm'); return { ok: true }
}
export async function markNotificationsRead(ids) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  const list = (ids || []).map(Number).filter(Number.isFinite).slice(0, 200)
  if (!list.length) return { ok: true }
  await v.s.from('notifications').update({ read_at: new Date().toISOString() }).in('id', list).is('read_at', null)
  return { ok: true }
}
