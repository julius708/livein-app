'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { changeStage, flushQueue } from '@/lib/crm-server'
import { cityGroup, route, normalizePhone, normalizeSource, splitName, STAGE_IDS, LOST_REASONS, CITY_GROUPS } from '@/lib/crm'
import { draftIntroEmail, sendCrmMail, viewingEmail, mapsLink, fmtWhen, SERVICES, TASK_KINDS } from '@/lib/crm-tasks'
import { createSubtask, completeSubtask, ensureLeadTask, commentTask, asanaReady } from '@/lib/crm-asana'
import { notify } from '@/lib/crm-server'
import { pushPending } from '@/lib/crm-push'

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
  const r = await changeStage(v.s, leadId, stage, who(v), { viewing_at: stage === 'viewing' && opts.viewing_at ? String(opts.viewing_at).slice(0, 40) : '', lost_reason: String(opts.lost_reason || '').slice(0, 300), note: String(opts.note || '').slice(0, 2000), connected: !!opts.connected, property_address: String(opts.property_address || '').slice(0, 300) })
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
/** Úprava už napísanej poznámky (Július, 10. 11. 2026): prepíše text v histórii, zapamätá si, kto a kedy upravil; do Asany ide komentár s novým znením. */
export async function editNote(eventId, text) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  const id = Number(eventId); if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Neplatná poznámka.' }
  const t = String(text || '').trim().slice(0, 2000)
  if (!t) return { ok: false, error: 'Poznámka nemôže byť prázdna.' }
  const { data: ev } = await v.s.from('lead_events').select('id,lead_id,type,payload').eq('id', id).maybeSingle()
  if (!ev || ev.type !== 'note') return { ok: false, error: 'Poznámka sa nenašla.' }
  const old = (ev.payload && ev.payload.note) || ''
  if (old === t) return { ok: true, payload: ev.payload }
  const payload = { ...(ev.payload || {}), note: t, edited_at: new Date().toISOString(), edited_by: who(v).name, previous: String(old).slice(0, 2000) }
  const { error } = await v.s.from('lead_events').update({ payload }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  const { data: lead } = await v.s.from('leads').select('notes').eq('id', ev.lead_id).maybeSingle()
  if (lead && lead.notes === old) await v.s.from('leads').update({ notes: t }).eq('id', ev.lead_id)
  await v.s.from('crm_sync_queue').insert({ lead_id: ev.lead_id, target: 'asana', action: 'note', payload: { comment: `${who(v).name} (upravená poznámka): ${t}` } })
  await flushQueue(v.s, 2).catch(() => {})
  revalidatePath(`/crm/lead/${ev.lead_id}`)
  return { ok: true, payload }
}
/** Dátum absolvovanej obhliadky (dá sa doplniť alebo opraviť aj neskôr). */
export async function setViewingDate(leadId, at) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const ms = Date.parse(at); if (!Number.isFinite(ms)) return { ok: false, error: 'Zadaj dátum a čas obhliadky.' }
  const iso = new Date(ms).toISOString()
  const { error } = await v.s.from('leads').update({ viewing_at: iso }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { viewing_at: iso, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'note', payload: { comment: `${who(v).name}: obhliadka absolvovaná ${fmtWhen(iso)}` } })
  await flushQueue(v.s, 2).catch(() => {})
  revalidatePath(`/crm/lead/${leadId}`); revalidatePath('/crm')
  return { ok: true, viewing_at: iso }
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
/** Mesto leadu: skupina (Bratislava / Košice / Trnava / Iné) a pri „Iné“ aj konkrétne mesto napísané rukou alebo vybrané zo zoznamu. Ak napísané mesto patrí do našej skupiny (napr. „Petržalka“), skupina sa opraví sama. */
export async function setCity(leadId, group, cityText = '') {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const txt = String(cityText || '').trim().slice(0, 120)
  let g = CITY_GROUPS.includes(group) ? group : null
  if (!g) return { ok: false, error: 'Neznáme mesto.' }
  if (g === 'Iné' && txt) g = cityGroup(txt)
  const { data: cur } = await v.s.from('leads').select('city,hubspot_contact_id').eq('id', leadId).maybeSingle()
  const patch = g !== 'Iné'
    ? { city_group: g, ...(txt ? { city: txt } : (!cur || !cur.city || cityGroup(cur.city) !== g) ? { city: g } : {}) }
    : { city_group: g, ...(txt ? { city: txt } : {}) }
  const { error } = await v.s.from('leads').update(patch).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { city_group: g, city: patch.city, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  if (patch.city && cur && cur.hubspot_contact_id && patch.city !== cur.city) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props: { city: patch.city }, note: `Mesto upravené v appke (${who(v).name}): ${patch.city}` } }).then(() => flushQueue(v.s, 2)).catch(() => {})
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

// ——— Úlohy k leadu ———
const meOf = (v) => ({ email: v.user.email.toLowerCase(), name: v.me.name || v.user.email, phone: v.me.phone || '' })
async function leadNotes(s, leadId) { const { data: ev } = await s.from('lead_events').select('at,payload,user_name').eq('lead_id', leadId).in('type', ['note', 'call', 'whatsapp', 'email', 'sms']).order('at', { ascending: false }).limit(20); return (ev || []).filter((e) => e.payload && e.payload.note).map((e) => ({ at: e.at, by: e.user_name, text: e.payload.note })).reverse() }
/** Úloha v Asane ako podúloha úlohy leadu (ak lead úlohu nemá, najprv ju založí). Chyba Asany úlohu v appke nezastaví. */
async function asanaSubtask(s, lead, { name, notes, dueAt, assigneeEmail }) {
  if (!asanaReady()) return null
  try {
    let gid = lead.asana_task_gid
    if (!gid) { const r = await ensureLeadTask(lead, { notes: await leadNotes(s, lead.id) }); gid = r.gid; await s.from('leads').update({ asana_task_gid: gid }).eq('id', lead.id) }
    return await createSubtask(gid, { name, notes, dueAt, assigneeEmail })
  } catch (e) { console.error('[crm] asana subtask', e && e.message); return null }
}
export async function setService(leadId, service) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId) || !(service in SERVICES)) return { ok: false, error: 'Neznáma služba.' }
  const { error } = await v.s.from('leads').update({ service }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { service, by: who(v).name }, user_email: who(v).email, user_name: who(v).name })
  await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'asana', action: 'update', payload: { comment: `Služba: ${SERVICES[service]} (${who(v).name})` } })
  await flushQueue(v.s, 2).catch(() => {})
  revalidatePath(`/crm/lead/${leadId}`); return { ok: true }
}
/** Náhľad úvodného e-mailu: šablóna podľa služby, osobný odsek z poznámok (AI). Nič neposiela. */
export async function draftIntroEmailAction(leadId, service) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const { data: lead } = await v.s.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead neexistuje.' }
  if (!lead.email) return { ok: false, error: 'Lead nemá e-mail. Doplň ho v údajoch.' }
  const svc = service in SERVICES ? service : lead.service || 'other'
  const d = await draftIntroEmail({ lead, me: meOf(v), notes: await leadNotes(v.s, leadId), service: svc })
  return { ok: true, ...d, to: lead.email }
}
/** Odoslanie úvodného e-mailu (po úprave náhľadu): Resend, história, HubSpot poznámka, Asana podúloha hotová. */
export async function sendIntroEmailAction(leadId, { subject, body, service }) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const { data: lead } = await v.s.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead || !lead.email) return { ok: false, error: 'Lead nemá e-mail.' }
  const subj = String(subject || '').trim().slice(0, 200), text = String(body || '').trim().slice(0, 8000)
  if (!subj || text.length < 20) return { ok: false, error: 'Doplň predmet a text e-mailu.' }
  const me = meOf(v)
  const r = await sendCrmMail({ to: lead.email, subject: subj, text, me })
  if (!r.ok) return r
  const svc = service in SERVICES ? service : lead.service || null
  if (svc && svc !== lead.service) await v.s.from('leads').update({ service: svc }).eq('id', leadId)
  const gid = await asanaSubtask(v.s, lead, { name: `Úvodný e-mail: ${lead.name}`, notes: `Odoslané ${new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })} na ${lead.email}\nPredmet: ${subj}\n\n${text}`, dueAt: null, assigneeEmail: me.email })
  if (gid) await completeSubtask(gid).catch(() => {})
  await v.s.from('lead_tasks').insert({ lead_id: leadId, kind: 'intro_email', title: `Úvodný e-mail (${SERVICES[svc] || 'všeobecný'})`, status: 'done', asana_gid: gid, payload: { subject: subj, body: text, to: lead.email, resend_id: r.id, service: svc }, created_by: me.email, created_by_name: me.name, done_at: new Date().toISOString(), done_by: me.email })
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'email', payload: { note: `Úvodný e-mail odoslaný: „${subj}“` }, user_email: me.email, user_name: me.name })
  if (lead.hubspot_contact_id) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props: {}, note: `Úvodný e-mail odoslaný (${me.name}): ${subj}` } })
  if (lead.stage === 'new') await changeStage(v.s, leadId, 'contacted', who(v), { note: 'úvodný e-mail' }).catch(() => {})
  await flushQueue(v.s, 3).catch(() => {})
  revalidatePath(`/crm/lead/${leadId}`); revalidatePath('/crm')
  return { ok: true }
}
/** Obhliadka: termín (dátum a čas), adresa, kto ide; podúloha v Asane s presným časom, notifikácia priradenému, e-mail klientovi. */
export async function createViewingAction(leadId, form = {}) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const { data: lead } = await v.s.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead neexistuje.' }
  const at = Date.parse(form.at); if (!Number.isFinite(at)) return { ok: false, error: 'Zadaj dátum a čas obhliadky.' }
  if (at < Date.now() - 3600e3) return { ok: false, error: 'Termín je v minulosti.' }
  const address = String(form.address || lead.property_address || '').trim().slice(0, 300)
  const withEmail = form.with ? await crmPerson(v.s, form.with) : lead.assigned_to || who(v).email
  const { data: withRow } = await v.s.from('app_users').select('name').ilike('email', withEmail || who(v).email).maybeSingle()
  const withName = (withRow && withRow.name) || who(v).name
  const note = String(form.note || '').trim().slice(0, 500)
  const me = meOf(v); const iso = new Date(at).toISOString()
  if (address && address !== lead.property_address) await v.s.from('leads').update({ property_address: address }).eq('id', leadId)
  const gid = await asanaSubtask(v.s, lead, { name: `Obhliadka: ${lead.name}${address ? ' – ' + address : ''}`, notes: `Kedy: ${fmtWhen(iso)}\nKde: ${address || 'podľa dohody'}\nKto: ${withName}\nTelefón: ${lead.phone || '—'}\nNavigácia: ${mapsLink(address)}${note ? '\n\n' + note : ''}`, dueAt: iso, assigneeEmail: withEmail })
  const { data: task, error } = await v.s.from('lead_tasks').insert({ lead_id: leadId, kind: 'viewing', title: `Obhliadka ${fmtWhen(iso)}`, due_at: iso, asana_gid: gid, payload: { address, with: withEmail, with_name: withName, note, maps: mapsLink(address) }, created_by: me.email, created_by_name: me.name }).select('id').single()
  if (error) return { ok: false, error: error.message }
  await v.s.from('lead_events').insert({ lead_id: leadId, type: 'note', payload: { note: `Obhliadka dohodnutá: ${fmtWhen(iso)}${address ? ', ' + address : ''} (${withName})` }, user_email: me.email, user_name: me.name })
  await notify(v.s, [withEmail, lead.assigned_to], { lead_id: leadId, kind: 'viewing', title: `Obhliadka: ${lead.name}`, body: `${fmtWhen(iso)}${address ? ' · ' + address : ''}`, url: `/crm/lead/${leadId}` })
  await pushPending(v.s).catch(() => {})
  let mailed = false
  if (form.email_client !== false && lead.email) { const m = viewingEmail({ lead, at: iso, address, withName, me, note: form.client_note ? String(form.client_note).slice(0, 500) : '' }); const r = await sendCrmMail({ to: lead.email, subject: m.subject, text: m.text, me }); mailed = r.ok; if (r.ok) await v.s.from('lead_events').insert({ lead_id: leadId, type: 'email', payload: { note: `Klientovi poslané potvrdenie obhliadky (${fmtWhen(iso)})` }, user_email: me.email, user_name: me.name }) }
  if (lead.hubspot_contact_id) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props: { hs_lead_status: 'IN_PROGRESS' }, note: `Obhliadka ${fmtWhen(iso)}${address ? ', ' + address : ''} (${withName})` } })
  if (['new', 'contacted'].includes(lead.stage)) await changeStage(v.s, leadId, 'viewing', who(v), { note: `obhliadka ${fmtWhen(iso)}` }).catch(() => {})
  await flushQueue(v.s, 3).catch(() => {})
  revalidatePath(`/crm/lead/${leadId}`); revalidatePath('/crm')
  return { ok: true, id: task.id, mailed, asana: !!gid }
}
export async function createCustomTaskAction(leadId, form = {}) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(leadId)) return { ok: false, error: 'Neplatný lead.' }
  const title = String(form.title || '').trim().slice(0, 200); if (title.length < 2) return { ok: false, error: 'Napíš, čo treba urobiť.' }
  const due = form.due_at && Number.isFinite(Date.parse(form.due_at)) ? new Date(form.due_at).toISOString() : null
  const { data: lead } = await v.s.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead neexistuje.' }
  const me = meOf(v)
  const gid = await asanaSubtask(v.s, lead, { name: title, notes: `Z appky LIVE-IN (${me.name})`, dueAt: due, assigneeEmail: lead.assigned_to || me.email })
  const { error } = await v.s.from('lead_tasks').insert({ lead_id: leadId, kind: 'custom', title, due_at: due, asana_gid: gid, created_by: me.email, created_by_name: me.name })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/crm/lead/${leadId}`); return { ok: true }
}
export async function toggleTaskAction(taskId, done) {
  const v = await crmViewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(taskId)) return { ok: false, error: 'Neplatná úloha.' }
  const { data: t } = await v.s.from('lead_tasks').select('id,lead_id,asana_gid,title,kind,due_at').eq('id', taskId).maybeSingle()
  if (!t) return { ok: false, error: 'Úloha neexistuje.' }
  const { error } = await v.s.from('lead_tasks').update(done ? { status: 'done', done_at: new Date().toISOString(), done_by: who(v).email } : { status: 'open', done_at: null, done_by: null }).eq('id', taskId)
  if (error) return { ok: false, error: error.message }
  if (t.asana_gid) await completeSubtask(t.asana_gid, !!done).catch(() => {})
  if (done) await v.s.from('lead_events').insert({ lead_id: t.lead_id, type: 'note', payload: { note: `Hotovo: ${t.title}` }, user_email: who(v).email, user_name: who(v).name })
  // odškrtnutá obhliadka doplní dátum absolvovania, ak ešte nie je zapísaný (termín úlohy; dá sa upraviť v hlavičke leadu)
  if (done && t.kind === 'viewing' && t.due_at) { const { data: l } = await v.s.from('leads').select('viewing_at').eq('id', t.lead_id).maybeSingle(); if (l && !l.viewing_at) await v.s.from('leads').update({ viewing_at: t.due_at }).eq('id', t.lead_id) }
  revalidatePath(`/crm/lead/${t.lead_id}`); return { ok: true }
}
