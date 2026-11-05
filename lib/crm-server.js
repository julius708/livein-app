// CRM – serverové operácie nad Supabase (service role), HubSpotom a Asanou. Žiadne PII do logov.
import { adminClientAsync } from './supabase-admin'
import * as HS from './hubspot'
import * as AS from './crm-asana'
import { pushPending, createReminders } from './crm-push'
import { cityGroup, route, normalizePhone, normalizeSource, stageFromHubspot, hubspotPropsForStage, importKind, splitName, fullName, leadIdentity, stageOf, OPEN_STAGES, ASSIGNEES } from './crm'

const iso = (d = new Date()) => new Date(d).toISOString()
const log = (...a) => console.log('[crm]', ...a)

export async function notify(s, emails, { lead_id = null, kind, title, body = '', url = null }) {
  const rows = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))].map((user_email) => ({ user_email, lead_id, kind, title, body, url }))
  if (!rows.length) return
  const { error } = await s.from('notifications').insert(rows)
  if (error) log('notify', error.message)
}
export async function event(s, lead_id, type, payload = {}, who = {}) {
  const { error } = await s.from('lead_events').insert({ lead_id, type, payload, user_email: who.email || null, user_name: who.name || null })
  if (error) log('event', error.message)
}
async function enqueue(s, lead_id, target, action, payload) {
  const { error } = await s.from('crm_sync_queue').insert({ lead_id, target, action, payload })
  if (error) log('queue', error.message)
}

/** Nový lead (webhook zo Zapieru alebo ručne): idempotentne, s HubSpotom, smerovaním a notifikáciou. */
export async function createLead(input, { via = 'zapier' } = {}) {
  const s = await adminClientAsync()
  const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase() || null, phone = normalizePhone(input.phone) || null
  const city = String(input.city || '').trim() || null, group = cityGroup(city), source = normalizeSource(input.source)
  const asana_task_gid = /^\d+$/.test(String(input.asana_task_gid || '')) ? String(input.asana_task_gid) : null
  const received_at = input.created_at && Number.isFinite(Date.parse(input.created_at)) ? iso(input.created_at) : iso()
  if (!name && !email && !phone) return { ok: false, error: 'Lead bez mena, e-mailu aj telefónu.' }
  // kontakt, ktorý už v appke je (import z HubSpotu alebo ho založila appka), sa neduplikuje
  const givenHs = /^\d+$/.test(String(input.hubspot_contact_id || '')) ? String(input.hubspot_contact_id) : null
  if (givenHs) { const { data: dup } = await s.from('leads').select('id').eq('hubspot_contact_id', givenHs).limit(1); if (dup && dup.length) return { ok: true, lead_id: dup[0].id, existed: true } }

  // idempotencia: rovnaký lead (gid / e-mail / telefón) za posledných 30 dní sa neduplikuje
  const id = leadIdentity({ asana_task_gid, email, phone })
  if (id) {
    const q = s.from('leads').select('id,stage').eq('kind', 'lead').gte('received_at', iso(Date.now() - 30 * 864e5))
    const { data: dup } = await (id.field === 'email' ? q.ilike('email', id.value) : q.eq(id.field, id.value)).limit(1)
    if (dup && dup.length) return { ok: true, lead_id: dup[0].id, existed: true }
  }

  const r = route(group)
  const due_at = iso(Date.parse(received_at) + r.alarm_hours * 3600e3)
  // HubSpot: nájdi (e-mail, telefón) alebo založ
  let hubspot_contact_id = givenHs, hsError = null
  if (!hubspot_contact_id && HS.hubspotReady()) {
    try {
      let c = email ? await HS.findContactByEmail(email) : null
      if (!c && phone) c = await HS.findContactByPhone(phone)
      if (c) { hubspot_contact_id = String(c.id); if (c.properties && c.properties.hs_lead_status !== 'NEW' && c.properties.lifecyclestage !== 'customer') await HS.updateContact(c.id, { hs_lead_status: 'NEW' }).catch(() => {}) }
      else { const { firstname, lastname } = splitName(name); const made = await HS.createContact({ firstname, lastname, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(city ? { city } : {}), lifecyclestage: 'lead', hs_lead_status: 'NEW' }); hubspot_contact_id = String(made.id) }
    } catch (e) { hsError = e.message; log('hubspot create failed', e.status || '') }
  }
  const { data: lead, error } = await s.from('leads').insert({ hubspot_contact_id, asana_task_gid, name: name || email || phone, phone, email, city, city_group: group, source, kind: 'lead', stage: 'new', priority: r.priority, received_at, due_at, alarm_hours: r.alarm_hours, assigned_to: r.assigned_to, hubspot_lifecycle: 'lead', hubspot_lead_status: 'NEW', notes: input.note ? String(input.note).slice(0, 2000) : null }).select('id').single()
  if (error) {
    if (error.code === '23505') { const { data: dup } = await s.from('leads').select('id').or([asana_task_gid ? `asana_task_gid.eq.${asana_task_gid}` : null, hubspot_contact_id ? `hubspot_contact_id.eq.${hubspot_contact_id}` : null].filter(Boolean).join(',')).limit(1); if (dup && dup.length) return { ok: true, lead_id: dup[0].id, existed: true } }
    return { ok: false, error: 'Lead sa nepodarilo uložiť: ' + error.message }
  }
  await event(s, lead.id, 'system', { via, source, city_group: group, assigned_to: r.assigned_to, hubspot: hubspot_contact_id ? 'linked' : hsError ? 'failed' : 'off' })
  if (!hubspot_contact_id && HS.writeReady()) await enqueue(s, lead.id, 'hubspot', 'create', {})
  if (asana_task_gid && AS.asanaReady()) await enqueue(s, lead.id, 'asana', 'stage', { stage: 'new', fields: { Zdroj: source, 'Lead prijatý': received_at.slice(0, 10) } })
  await notify(s, [r.assigned_to], { lead_id: lead.id, kind: 'new_lead', title: `Nový lead: ${name || email || phone}`, body: [group !== 'Iné' ? group : city || '', source].filter(Boolean).join(' · '), url: `/crm/lead/${lead.id}` })
  await pushPending(s).catch(() => {})
  flushQueue(s, 5).catch(() => {})
  return { ok: true, lead_id: lead.id, hubspot: !!hubspot_contact_id }
}

/** Zmena štádia z appky: zapíše do leads + udalosť, HubSpot a Asanu cez frontu (okamžitý pokus). */
export async function changeStage(s, leadId, stage, who, { lost_reason = '', note = '', connected = false, property_address = '' } = {}) {
  const st = stageOf(stage)
  const { data: lead } = await s.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead neexistuje.' }
  if (stage === 'lost' && !lost_reason) return { ok: false, error: 'Pri stratenom leade je povinný dôvod.' }
  const now = iso()
  const patch = { stage, kind: stage === 'client' ? 'client' : lead.kind === 'not_lead' ? 'lead' : lead.kind }
  if (lead.stage === 'new' && stage !== 'new' && !lead.first_contact_at) { patch.first_contact_at = now; patch.contacted_by = who.email || null }
  if (stage === 'lost') patch.lost_reason = lost_reason
  if (property_address) patch.property_address = property_address
  if (stage === 'client') { patch.hubspot_lifecycle = 'customer' } else { patch.hubspot_lead_status = hubspotPropsForStage(stage, { connected }).hs_lead_status || lead.hubspot_lead_status }
  const { error } = await s.from('leads').update(patch).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  await event(s, leadId, 'stage_change', { from: lead.stage, to: stage, lost_reason: lost_reason || undefined, note: note || undefined }, who)
  const hsProps = { ...hubspotPropsForStage(stage, { connected }), ...(property_address ? { address: property_address } : {}) }
  if (lead.hubspot_contact_id) await enqueue(s, leadId, 'hubspot', 'update', { props: hsProps, note: stage === 'lost' ? `Stratený lead – dôvod: ${lost_reason}${note ? ' · ' + note : ''} (${who.name || 'LIVE-IN appka'})` : note ? `${st.label}: ${note} (${who.name || 'LIVE-IN appka'})` : '' })
  if (lead.asana_task_gid) await enqueue(s, leadId, 'asana', 'stage', { stage, fields: { ...(patch.first_contact_at ? { 'Prvý kontakt': patch.first_contact_at.slice(0, 10) } : {}), ...(stage === 'lost' ? { 'Dôvod straty': lost_reason } : {}) }, comment: `${st.label} – ${who.name || 'LIVE-IN appka'}${note ? ': ' + note : ''}`, complete: stage === 'lost' || stage === 'client' })
  // zmena štádia ruší nevybavené pripomienky
  if (stage !== 'new') await s.from('leads').update({ reminders: { ...(lead.reminders || {}), closed: true } }).eq('id', leadId)
  await flushQueue(s, 6).catch(() => {})
  return { ok: true }
}

/** Spracuje frontu zápisov do HubSpotu a Asany (s opakovaním). */
export async function flushQueue(s, limit = 20) {
  const { data: items } = await s.from('crm_sync_queue').select('*').is('done_at', null).lte('next_at', iso()).order('id').limit(limit)
  let ok = 0, failed = 0
  for (const it of items || []) {
    try {
      const { data: lead } = await s.from('leads').select('*').eq('id', it.lead_id).maybeSingle()
      if (!lead) throw new Error('lead chýba')
      if (it.target === 'hubspot' && !HS.hubspotReady() && HS.zapierReady()) {
        // bez tokenu: jedna správa cez Zapier (nájdi/založ kontakt, zapíš vlastnosti, poznámku, odhlásenie); ID kontaktu príde cez callback
        const { firstname, lastname } = splitName(lead.name)
        const props = it.action === 'create' ? { firstname, lastname, ...(lead.city ? { city: lead.city } : {}), lifecyclestage: 'lead', hs_lead_status: 'NEW' } : it.action === 'update' ? (it.payload.props || {}) : {}
        await HS.viaZapier({ ref: `${lead.id}:${it.id}`, contactId: lead.hubspot_contact_id || null, email: lead.email || null, phone: lead.phone || null, properties: props, note: it.payload.note || null, unsubscribe: it.action === 'unsubscribe' })
      } else if (it.target === 'hubspot') {
        if (!HS.hubspotReady()) throw new Error('HubSpot nie je pripojený')
        if (it.action === 'create') {
          let c = lead.email ? await HS.findContactByEmail(lead.email) : null
          if (!c && lead.phone) c = await HS.findContactByPhone(lead.phone)
          if (!c) { const { firstname, lastname } = splitName(lead.name); c = await HS.createContact({ firstname, lastname, ...(lead.email ? { email: lead.email } : {}), ...(lead.phone ? { phone: lead.phone } : {}), ...(lead.city ? { city: lead.city } : {}), lifecyclestage: 'lead', hs_lead_status: 'NEW' }) }
          await s.from('leads').update({ hubspot_contact_id: String(c.id) }).eq('id', lead.id)
        } else if (it.action === 'unsubscribe') {
          if (lead.email) await HS.unsubscribeAll(lead.email).catch((e) => { if (e.status !== 400 && e.status !== 404) throw e })
        } else if (it.action === 'update' && lead.hubspot_contact_id) {
          await HS.updateContact(lead.hubspot_contact_id, it.payload.props || {})
          if (it.payload.note) await HS.addNote(lead.hubspot_contact_id, it.payload.note).catch(() => {})
        }
      } else if (it.target === 'asana') {
        if (!AS.asanaReady()) throw new Error('Asana nie je pripojená')
        if (!lead.asana_task_gid) throw new Error('bez úlohy v Asane')
        if (it.action === 'stage') {
          await AS.moveTask(lead.asana_task_gid, it.payload.stage)
          if (it.payload.fields) await AS.setFields(lead.asana_task_gid, it.payload.fields).catch(() => {})
          if (it.payload.comment) await AS.commentTask(lead.asana_task_gid, it.payload.comment).catch(() => {})
          if (it.payload.complete != null) await AS.completeTask(lead.asana_task_gid, !!it.payload.complete).catch(() => {})
        }
      }
      await s.from('crm_sync_queue').update({ done_at: iso(), last_error: null }).eq('id', it.id); ok++
    } catch (e) {
      failed++
      const attempts = (it.attempts || 0) + 1, wait = Math.min(6 * 3600e3, 60e3 * 2 ** attempts)
      await s.from('crm_sync_queue').update({ attempts, next_at: iso(Date.now() + wait), last_error: String(e.message).slice(0, 300), ...(attempts >= 12 ? { done_at: iso() } : {}) }).eq('id', it.id)
    }
  }
  return { ok, failed, total: (items || []).length }
}

function leadFromContact(c) {
  const p = c.properties || {}
  const phone = normalizePhone(p.phone || p.mobilephone) || null, email = (p.email || '').toLowerCase() || null
  return { hubspot_contact_id: String(c.id), name: fullName(p) || email || phone || 'bez mena', phone, email, city: p.city || null, city_group: cityGroup(p.city), hubspot_lifecycle: p.lifecyclestage || null, hubspot_lead_status: p.hs_lead_status || null, hubspot_updated_at: p.lastmodifieddate || null, email_optout: HS.optedOut(p), marketing_ok: HS.marketable(p), property_address: p.address || null }
}

/** Jednorazový import všetkých kontaktov z HubSpotu (bez alarmov pre staré leady). Idempotentný (upsert podľa hubspot_contact_id). */
export async function importAll() {
  if (!HS.hubspotReady()) return { ok: false, error: 'Chýba HUBSPOT_TOKEN' }
  const s = await adminClientAsync()
  let total = 0, clients = 0, leads = 0, hidden = 0, batch = []
  const flush = async () => { if (!batch.length) return; const { error } = await s.from('leads').upsert(batch, { onConflict: 'hubspot_contact_id', ignoreDuplicates: false }); if (error) throw new Error(error.message); batch = [] }
  const { data: existing } = await s.from('leads').select('hubspot_contact_id,stage,kind,asana_task_gid').not('hubspot_contact_id', 'is', null)
  const known = new Map((existing || []).map((x) => [x.hubspot_contact_id, x]))
  for await (const c of HS.allContacts()) {
    total++
    const p = c.properties || {}, base = leadFromContact(c), ik = importKind(p), old = known.get(base.hubspot_contact_id)
    const row = { ...base, kind: old ? old.kind : ik.kind, stage: old ? old.stage : ik.stage, source: normalizeSource(p.hs_analytics_source === 'OFFLINE' ? '' : p.hs_analytics_source), received_at: p.createdate || iso(), due_at: null, alarm_hours: 24, priority: route(base.city_group).priority, assigned_to: route(base.city_group).assigned_to }
    if (old) { delete row.source; delete row.received_at; delete row.assigned_to; delete row.priority; delete row.due_at; delete row.alarm_hours }
    if (row.kind === 'client') clients++; else if (row.kind === 'not_lead') hidden++; else leads++
    batch.push(row)
    if (batch.length >= 100) await flush()
  }
  await flush()
  await s.from('config').upsert({ key: 'crm_sync', value: { hubspot_since: iso(), imported_at: iso(), total } })
  return { ok: true, total, clients, leads, hidden }
}

/** Pravidelný sync: zmeny z HubSpotu (štádium, kontaktné údaje, odhlásenie) a z Asany (presun medzi LEAD sekciami). */
export async function syncExternal() {
  const s = await adminClientAsync()
  const { data: cfgRow } = await s.from('config').select('value').eq('key', 'crm_sync').maybeSingle()
  const cfg = (cfgRow && cfgRow.value) || {}
  const out = { hubspot: 0, asana: 0, created: 0, queue: null }
  out.queue = await flushQueue(s, 25).catch((e) => ({ error: e.message }))
  if (HS.hubspotReady()) {
    const since = cfg.hubspot_since || iso(Date.now() - 864e5)
    const changed = await HS.contactsModifiedSince(since).catch((e) => { log('hs since', e.status || ''); return [] })
    for (const c of changed) {
      const base = leadFromContact(c), p = c.properties || {}
      const { data: lead } = await s.from('leads').select('id,stage,kind,hubspot_lead_status,hubspot_lifecycle,updated_at').eq('hubspot_contact_id', base.hubspot_contact_id).maybeSingle()
      if (lead) {
        const patch = { ...base }
        const extStage = stageFromHubspot(p)
        // štádium preberieme len keď sa v HubSpote zmenil stav (nie keď je zmena z našej appky už zapísaná)
        if ((p.hs_lead_status || null) !== (lead.hubspot_lead_status || null) || (p.lifecyclestage || null) !== (lead.hubspot_lifecycle || null)) {
          if (extStage !== lead.stage) { patch.stage = extStage; if (extStage === 'client') patch.kind = 'client'; await event(s, lead.id, 'stage_change', { from: lead.stage, to: extStage, via: 'hubspot' }) }
        }
        delete patch.hubspot_contact_id
        await s.from('leads').update(patch).eq('id', lead.id); out.hubspot++
      } else if (p.lifecyclestage === 'customer' || p.hs_lead_status) {
        // kontakt vznikol priamo v HubSpote: zaradíme ho bez 24 h alarmu (ten platí len pre leady zo Zapieru)
        const ik = importKind(p)
        await s.from('leads').insert({ ...base, kind: ik.kind, stage: ik.stage, source: 'Iné / neznáme', received_at: p.createdate || iso(), due_at: null, assigned_to: route(base.city_group).assigned_to, priority: route(base.city_group).priority }).then(({ error }) => { if (!error) out.created++ })
      }
    }
    const newest = changed.reduce((m, c) => (c.properties && c.properties.lastmodifieddate > m ? c.properties.lastmodifieddate : m), since)
    cfg.hubspot_since = newest
  }
  if (AS.asanaReady()) {
    try {
      const tasks = await AS.leadTasks()
      const gids = Object.keys(tasks)
      if (gids.length) {
        const { data: linked } = await s.from('leads').select('id,asana_task_gid,stage,updated_at').in('asana_task_gid', gids.slice(0, 1000))
        for (const l of linked || []) {
          const t = tasks[l.asana_task_gid]
          if (t && t.stage !== l.stage && Date.parse(t.modified_at) > Date.parse(l.updated_at) + 5000) {
            await changeStage(s, l.id, t.stage, { name: 'Asana' }, { lost_reason: t.stage === 'lost' ? 'Iné' : '' }); out.asana++
          }
        }
      }
    } catch (e) { log('asana sync', e.message) }
  }
  out.reminders = await createReminders(s).catch((e) => ({ error: e.message }))
  out.push = await pushPending(s).catch((e) => ({ error: e.message }))
  cfg.last_run = iso()
  await s.from('config').upsert({ key: 'crm_sync', value: cfg })
  return out
}

export { OPEN_STAGES, ASSIGNEES }
