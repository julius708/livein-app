'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { changeStage, flushQueue } from '@/lib/crm-server'
import { cityGroup, route, normalizePhone, normalizeSource, splitName, STAGE_IDS, LOST_REASONS, CITY_GROUPS } from '@/lib/crm'

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
  const label = { call: 'Volal/a', whatsapp: 'WhatsApp', email: 'E-mail', sms: 'SMS' }[type]
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'note', payload: { comment: `${label} – ${who(v).name}${note ? ': ' + String(note).slice(0, 1000) : ''}` } })
  await flushQueue(v.s, 2).catch(() => {})
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
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'note', payload: { comment: `${who(v).name}: ${t}` } })
  await flushQueue(v.s, 2).catch(() => {})
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
  const { data, error } = await v.s.from('leads').insert({ name: name || phone || email, phone, email, city, city_group: group, source, kind: 'lead', stage: 'new', priority: r.priority, received_at: now, due_at: new Date(Date.now() + r.alarm_hours * 3600e3).toISOString(), alarm_hours: r.alarm_hours, assigned_to: assignee, notes: String(form.note || '').slice(0, 2000) || null, origin: 'manual' }).select('id').single()
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: data.id, type: 'system', payload: { via: 'manual', by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  await v.s.from('crm_sync_queue').insert([{ lead_id: data.id, target: 'hubspot', action: 'create', payload: {} }, { lead_id: data.id, target: 'asana', action: 'ensure', payload: { fields: { Zdroj: source, 'Lead prijatý': now.slice(0, 10) } } }])
  if (assignee !== who(v).email) await v.s.from('notifications').insert({ user_email: assignee, lead_id: data.id, kind: 'new_lead', title: `Nový lead: ${name || phone || email}`, body: [group !== 'Iné' ? group : city || '', source].filter(Boolean).join(' · '), url: `/crm/lead/${data.id}` })
  await flushQueue(v.s, 3).catch(() => {})
  revalidatePath('/crm')
  return { ok: true, id: data.id }
}
/** Mesto leadu (skupina Bratislava / Košice / Trnava / Iné): rozhoduje o smerovaní aj o tom, či sa lead počíta do úspešnosti. */
/** Úprava základných údajov leadu (meno, telefón, e-mail, mesto, zdroj, adresa bytu). Zapíše sa do histórie a do HubSpotu. */
export async function updateLead(leadId, form = {}) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const { data: cur } = await v.s.from('leads').select('name,phone,email,city,city_group,source,property_address,hubspot_contact_id').eq('id', leadId).maybeSingle()
  if (!cur) return { ok: false, error: 'Lead neexistuje.' }
  const name = String(form.name || '').trim().slice(0, 160)
  const phoneRaw = String(form.phone || '').trim(), phone = phoneRaw ? normalizePhone(phoneRaw) : ''
  if (phoneRaw && !phone) return { ok: false, error: 'Telefón nemá správny tvar (napr. +421 900 123 456).' }
  const email = String(form.email || '').trim().toLowerCase().slice(0, 160)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail nemá správny tvar.' }
  if (!name && !phone && !email) return { ok: false, error: 'Zadaj aspoň meno a telefón.' }
  const city = String(form.city || '').trim().slice(0, 120)
  const source = form.source ? normalizeSource(form.source) : (cur.source || null)
  const property_address = String(form.property_address || '').trim().slice(0, 300)
  const patch = { name: name || cur.name, phone: phone || null, email: email || null, city: city || null, source, property_address: property_address || null }
  if (city !== (cur.city || '')) patch.city_group = cityGroup(city)
  const changed = Object.keys(patch).filter((k) => (patch[k] || '') !== (cur[k] || ''))
  if (!changed.length) return { ok: true, patch: {} }
  const { error } = await v.s.from('leads').update(patch).eq('id', leadId)
  if (error) return { ok: false, error: error.code === '23505' ? 'Lead s týmto e-mailom alebo telefónom už existuje.' : error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { edited: changed, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  if (cur.hubspot_contact_id) {
    const props = {}
    if (changed.includes('name')) Object.assign(props, splitName(patch.name))
    if (changed.includes('phone')) props.phone = patch.phone || ''
    if (changed.includes('email') && patch.email) props.email = patch.email
    if (changed.includes('city')) props.city = patch.city || ''
    if (changed.includes('property_address')) props.address = patch.property_address || ''
    if (Object.keys(props).length) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props, note: `Údaje upravené v appke (${who(v).name}): ${changed.join(', ')}` } })
  }
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'update', payload: { comment: `Údaje upravené (${who(v).name}): ${changed.join(', ')}` } })
  await flushQueue(v.s, 3).catch(() => {})
  revalidatePath('/crm'); revalidatePath(`/crm/lead/${leadId}`)
  return { ok: true, patch }
}
export async function setCity(leadId, group) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const g = CITY_GROUPS.includes(group) ? group : null
  if (!g) return { ok: false, error: 'Neznáme mesto.' }
  const { data: cur } = await v.s.from('leads').select('city').eq('id', leadId).maybeSingle()
  const patch = { city_group: g, ...(g !== 'Iné' && (!cur || !cur.city || cityGroup(cur.city) !== g) ? { city: g } : {}) }
  const { error } = await v.s.from('leads').update(patch).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { city_group: g, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  revalidatePath('/crm'); revalidatePath(`/crm/lead/${leadId}`)
  return { ok: true, patch }
}
export async function assignLead(leadId, email) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const person = email ? await crmPerson(v.s, email) : null
  if (email && !person) return { ok: false, error: 'Tento človek nemá rolu CRM.' }
  const { error } = await v.s.from('leads').update({ assigned_to: person }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { assigned_to: email }, user_email: who(v).email, user_name: who(v).name })
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'update', payload: { comment: `Priradené: ${person || 'nikomu'} (${who(v).name})` } })
  await flushQueue(v.s, 2).catch(() => {})
  revalidatePath('/crm'); return { ok: true }
}
/** Skryť z fronty (nie lead: banky, dodávatelia…) alebo vrátiť. */
/** „Nie je lead“: zlý alebo nerelevantný kontakt. Zmizne z fronty a tabule, v HubSpote dostane stav Unqualified. Dá sa vrátiť (kind 'lead'). */
export async function setKind(leadId, kind, reason = '') {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  if (!['lead', 'not_lead'].includes(kind)) return { ok: false, error: 'Neznámy typ.' }
  const { data: lead } = await v.s.from('leads').select('id,kind,hubspot_contact_id,lost_reason').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead neexistuje.' }
  const note = String(reason || '').slice(0, 300)
  const patch = kind === 'not_lead' ? { kind, lost_reason: note || lead.lost_reason || 'Nie je lead' } : { kind }
  const { error } = await v.s.from('leads').update(patch).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { kind, note: note || undefined, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  if (kind === 'not_lead' && lead.hubspot_contact_id) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props: { hs_lead_status: 'UNQUALIFIED' }, note: `Nie je lead${note ? ': ' + note : ''} (${who(v).name})` } })
  await flushQueue(v.s, 2).catch(() => {})
  revalidatePath('/crm'); revalidatePath(`/crm/lead/${leadId}`); return { ok: true }
}
export async function markNotificationsRead(ids) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  const list = (ids || []).map(Number).filter(Number.isFinite).slice(0, 200)
  if (!list.length) return { ok: true }
  await v.s.from('notifications').update({ read_at: new Date().toISOString() }).in('id', list).is('read_at', null)
  return { ok: true }
}
