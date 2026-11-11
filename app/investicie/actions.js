'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { adminClientAsync } from '@/lib/supabase-admin'
import { canInv, normalizeListing, validateListing, toNum, ACTIVE_INQ } from '@/lib/inv-core'
import { cleanInquiry } from '@/lib/inv-inquiry'
import { ingestListing, matchInquiry, matchProperty, updateProperty, setPropertyStatus, confirmAvailability, mergeProperties, dismissMerge, decideMatch, createTask, notifyDigest, loadSettings, cleanPropertyPatch } from '@/lib/inv-store'
import { buildOffer } from '@/lib/inv-offer'
import { checkUrl } from '@/lib/inv-sources'
import { runAgent } from '@/lib/inv-agent'
import { mergeSettings } from '@/lib/inv-calc'
import { normalizePhone } from '@/lib/crm'
import { callClaude } from '@/lib/anthropic'

async function viewer({ admin = false } = {}) {
  const v = await getViewer()
  if (!v.user || v.blocked) { console.error('invest action: no session'); return { error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' } }
  if (!canInv(v.me)) { console.error('invest action: no role'); return { error: 'Investície sú pre obchodný tím (rola CRM).' } }
  if (admin && !v.isAdmin) return { error: 'Túto zmenu môže urobiť len admin.' }
  return v
}
const who = (v) => v.user.email.toLowerCase()
const uuid = (x) => /^[0-9a-f-]{36}$/i.test(String(x || ''))
const refresh = () => { revalidatePath('/investicie'); revalidatePath('/investicie/prehlad'); revalidatePath('/crm') }
const fail = (e) => ({ ok: false, error: typeof e === 'string' ? e : (e && e.message) || 'Nepodarilo sa.' })
const guard = (fn) => async (...a) => { try { return await fn(...a) } catch (e) { console.error('[invest] action', String(e && e.message).slice(0, 160)); return fail('Nepodarilo sa. Skús znova.') } }

/* ---------- dopyty (pri kontakte v CRM) ---------- */
export const createInquiryAction = guard(async (leadId, form = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  if (!uuid(leadId)) return fail('Neplatný kontakt.')
  const { data: lead } = await v.s.from('leads').select('id,name,assigned_to,hubspot_contact_id').eq('id', leadId).maybeSingle()
  if (!lead) return fail('Kontakt neexistuje. Investičný dopyt sa vytvára len pri existujúcom kontakte v CRM.')
  const c = cleanInquiry(form); if (c.error) return fail(c.error)
  const row = { ...c.patch, lead_id: leadId, owner_email: c.patch.owner_email || (lead.assigned_to || who(v)).toLowerCase(), source: c.patch.source || 'CRM kontakt', status: c.patch.status || 'new', created_by: who(v) }
  const { data, error } = await v.s.from('inv_inquiries').insert(row).select('*').single()
  if (error) return fail(error.message)
  // poznámka do HubSpotu (len poznámka k existujúcemu kontaktu; marketingový súhlas ani odber newslettra sa nemení)
  if (lead.hubspot_contact_id) await v.s.from('crm_sync_queue').insert({ lead_id: leadId, target: 'hubspot', action: 'update', payload: { props: {}, note: `Investičný dopyt vytvorený v LIVE-IN appke (${c.patch.label || 'bez názvu'}). Nejde o súhlas s marketingom. (${v.me.name || 'LIVE-IN appka'})` } })
  await v.s.from('inv_events').insert({ inquiry_id: data.id, type: 'inquiry_created', payload: { lead_id: leadId }, user_email: who(v) })
  const m = await matchInquiry(v.s, data.id)
  refresh()
  return { ok: true, id: data.id, matches: m.stats }
})
export const updateInquiryAction = guard(async (id, form = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  if (!uuid(id)) return fail('Neplatný dopyt.')
  const c = cleanInquiry(form, { partial: true }); if (c.error) return fail(c.error)
  const { error } = await v.s.from('inv_inquiries').update(c.patch).eq('id', id)
  if (error) return fail(error.message)
  await v.s.from('inv_events').insert({ inquiry_id: id, type: 'inquiry_edited', payload: { fields: Object.keys(c.patch) }, user_email: who(v) })
  const m = await matchInquiry(v.s, id)   // zmena dopytu spustí nové párovanie
  refresh()
  return { ok: true, matches: m.stats }
})
export const confirmInquiryAction = guard(async (id) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const { error } = await v.s.from('inv_inquiries').update({ last_confirmed_at: new Date().toISOString() }).eq('id', id)
  if (error) return fail(error.message)
  await v.s.from('inv_events').insert({ inquiry_id: id, type: 'inquiry_confirmed', payload: {}, user_email: who(v) })
  refresh(); return { ok: true }
})

/* ---------- nehnuteľnosti ---------- */
export const addPropertyByUrlAction = guard(async (url) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await checkUrl(String(url || '').trim())
  if (r.state === 'blocked') return fail(`Zdroj nedovoľuje automatické čítanie (${r.error}). Pridaj nehnuteľnosť ručným formulárom a vlož odkaz.`)
  if (r.state === 'error' || !r.listing) return fail(`Odkaz sa nepodarilo prečítať (${r.error || 'chyba'}). Skús formulár.`)
  if (r.state === 'gone') return fail('Inzerát už neexistuje (404/410).')
  if (r.partial && (r.listing.price == null || !r.listing.city)) return { ok: false, partial: true, draft: r.listing, error: 'Zo stránky sa nepodarilo prečítať cenu alebo mesto. Doplň ich vo formulári; odkaz sa uloží.' }
  const x = await ingestListing(v.s, r.listing, { via: 'manual-url', actor: who(v) })
  if (!x.ok) return fail(x.error)
  await matchProperty(v.s, x.property_id)
  refresh(); return { ok: true, id: x.property_id, created: x.created, merged: x.merged, suggested: x.suggested }
})
export const addPropertyManualAction = guard(async (form = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const c = cleanPropertyPatch({ ...form, title: form.title })
  if (c.error) return fail(c.error)
  const raw = { ...form, ...c.patch, source_key: form.url ? undefined : 'manual', external_id: form.url ? undefined : `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, checked_at: new Date().toISOString(), prov: Object.fromEntries(Object.keys(c.patch).filter((k) => c.patch[k] != null).map((k) => [k, { kind: 'source', ref: 'ručne zadané ' + who(v) }])) }
  const n = normalizeListing(raw), errs = validateListing(n)
  if (errs.length) return fail(errs.join(' '))
  const x = await ingestListing(v.s, raw, { via: 'manual-form', actor: who(v) })
  if (!x.ok) return fail(x.error)
  const extra = {}
  for (const k of ['legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed', 'commission_amount', 'standard', 'zone', 'notes_internal']) if (k in c.patch) extra[k] = c.patch[k]
  if (Object.keys(extra).length) await updateProperty(v.s, x.property_id, extra, who(v))
  await matchProperty(v.s, x.property_id)
  refresh(); return { ok: true, id: x.property_id, created: x.created, merged: x.merged, suggested: x.suggested }
})
export const updatePropertyAction = guard(async (id, patch = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  if (!uuid(id)) return fail('Neplatná nehnuteľnosť.')
  const r = await updateProperty(v.s, id, patch, who(v)); if (r.ok) refresh(); return r
})
export const setPropertyStatusAction = guard(async (id, status, note = '') => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await setPropertyStatus(v.s, id, status, who(v), { note }); if (r.ok) refresh(); return r
})
export const confirmAvailabilityAction = guard(async (id, { viewingPossible = null, note = '' } = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await confirmAvailability(v.s, id, who(v), { viewingPossible, note }); if (r.ok) refresh(); return r
})
export const mergePropertiesAction = guard(async (keepId, dropId) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await mergeProperties(v.s, keepId, dropId, who(v)); if (r.ok) refresh(); return r
})
export const dismissMergeAction = guard(async (id) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await dismissMerge(v.s, id, who(v)); if (r.ok) refresh(); return r
})
export const addTaskAction = guard(async (t = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await createTask(v.s, t, who(v)); if (r.ok) refresh(); return r
})
export const completeTaskAction = guard(async (id) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const { error } = await v.s.from('inv_tasks').update({ status: 'done', done_at: new Date().toISOString(), done_by: who(v) }).eq('id', id)
  if (error) return fail(error.message); refresh(); return { ok: true }
})

/* ---------- zhody: rozhodnutia Zuzky ---------- */
export const decideMatchAction = guard(async (matchId, decision, opts = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const r = await decideMatch(v.s, matchId, decision, who(v), opts)
  if (r.ok && decision === 'viewing' && opts.verify) {   // úloha na overenie dostupnosti a obhliadky
    const { data: m } = await v.s.from('inv_matches').select('inquiry_id,property_id').eq('id', matchId).maybeSingle()
    if (m) await createTask(v.s, { property_id: m.property_id, inquiry_id: m.inquiry_id, match_id: matchId, title: 'Overiť dostupnosť a možnosť obhliadky u predajcu', due: opts.due || null }, who(v))
  }
  if (r.ok) refresh(); return r
})
export const recordViewingAction = guard(async (matchId, { at, note = '', result = '' } = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const text = [note, result].filter(Boolean).join(' · ')
  const r = await decideMatch(v.s, matchId, 'viewing', who(v), { viewing_at: at || null, note: text })
  if (r.ok) refresh(); return r
})

/* ---------- klientska ponuka (druhý agent; človek kontroluje a odosiela sám) ---------- */
async function aiWriter() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  return async (prompt) => { const r = await callClaude(key, { max_tokens: 300, messages: [{ role: 'user', content: prompt }] }, { timeoutMs: 20000 }); return r.ok ? ((r.json.content || []).map((c) => c.text || '').join(' ')) : '' }
}
export const prepareOfferAction = guard(async (inquiryId, matchIds = [], { ai = true } = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  if (!uuid(inquiryId) || !matchIds.length || matchIds.length > 6) return fail('Vyber 1 až 6 nehnuteľností.')
  const [{ data: inq }, { data: ms }] = await Promise.all([v.s.from('inv_inquiries').select('*').eq('id', inquiryId).maybeSingle(), v.s.from('inv_matches').select('*').in('id', matchIds).eq('inquiry_id', inquiryId)])
  if (!inq || (ms || []).length !== matchIds.length) return fail('Dopyt alebo zhody sa nenašli.')
  const { data: props } = await v.s.from('inv_properties').select('*').in('id', ms.map((m) => m.property_id))
  const { data: calcs } = await v.s.from('inv_calcs').select('id,result').in('id', (props || []).map((p) => p.calc_id).filter(Boolean))
  const calcBy = Object.fromEntries((calcs || []).map((c) => [c.id, c.result]))
  const picks = ms.map((m) => { const p = (props || []).find((x) => x.id === m.property_id); return { match: m, property: p, calc: p && calcBy[p.calc_id] } })
  if (picks.some((x) => !x.property || !x.calc)) return fail('Nehnuteľnosť nemá výpočet. Doplň údaje a skús znova.')
  const b = await buildOffer({ inquiry: inq, picks, ai: ai ? await aiWriter() : null })
  if (!b.ok) return fail(b.error)
  const { data, error } = await v.s.from('inv_offers').insert({ inquiry_id: inquiryId, match_ids: matchIds, content: b.content, internal: b.internal, calc_snapshot: b.calc_snapshot, created_by: who(v) }).select('id').single()
  if (error) return fail(error.message)
  await v.s.from('inv_events').insert({ inquiry_id: inquiryId, type: 'offer_drafted', payload: { offer_id: data.id, properties: matchIds.length }, user_email: who(v) })
  for (const m of ms) await v.s.from('inv_matches').update({ decision: 'offer', decided_by: who(v), decided_at: new Date().toISOString() }).eq('id', m.id).neq('decision', 'rejected')
  refresh(); return { ok: true, id: data.id }
})
export const saveOfferAction = guard(async (offerId, { intro, internal_notes } = {}) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const { data: o } = await v.s.from('inv_offers').select('*').eq('id', offerId).maybeSingle()
  if (!o) return fail('Ponuka neexistuje.')
  if (o.status === 'sent') return fail('Ponuka je už označená ako odoslaná.')
  const content = { ...o.content, ...(intro != null ? { intro: String(intro).slice(0, 1200) } : {}), reviewed: false }
  const internal = { ...o.internal, ...(internal_notes != null ? { notes: String(internal_notes).slice(0, 3000) } : {}) }
  const { error } = await v.s.from('inv_offers').update({ content, internal, status: 'draft', reviewed_by: null, reviewed_at: null }).eq('id', offerId)
  if (error) return fail(error.message); refresh(); return { ok: true }
})
export const reviewOfferAction = guard(async (offerId) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const { error } = await v.s.from('inv_offers').update({ status: 'reviewed', reviewed_by: who(v), reviewed_at: new Date().toISOString() }).eq('id', offerId).eq('status', 'draft')
  if (error) return fail(error.message); refresh(); return { ok: true }
})
/** Aplikácia ponuku NEODOSIELA. Toto len zaznamená, že ju používateľ po kontrole odoslal sám (mimo appky). */
export const markOfferSentAction = guard(async (offerId) => {
  const v = await viewer(); if (v.error) return fail(v.error)
  const { data: o } = await v.s.from('inv_offers').select('status').eq('id', offerId).maybeSingle()
  if (!o || o.status !== 'reviewed') return fail('Ponuku musí najprv skontrolovať človek.')
  const { error } = await v.s.from('inv_offers').update({ status: 'sent' }).eq('id', offerId)
  if (error) return fail(error.message); refresh(); return { ok: true }
})

/* ---------- admin: agent, zdroje, nastavenia, import pilotu ---------- */
export const runNowAction = guard(async (mode = 'both') => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  const s = await adminClientAsync()
  const r = await runAgent(s, { trigger: 'manual', mode: ['general', 'targeted', 'both'].includes(mode) ? mode : 'both', maxMs: 100000 })
  revalidatePath('/investicie/agent')
  return r.locked ? { ok: false, error: r.message } : r.ok ? { ok: true, status: r.status, stats: r.stats } : fail(r.error)
})
export const saveSettingsAction = guard(async (key, value) => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  if (!['calc', 'agent', 'freshness'].includes(key)) return fail('Neznáme nastavenie.')
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Neplatná hodnota.')
  if (key === 'calc') {
    const num = (x) => (x === null || x === '' || x === undefined ? null : toNum(x))
    const t = value.thresholds || {}
    for (const k of Object.keys(t)) { if (num(t[k]) === null && t[k] !== null && t[k] !== '') return fail(`Prah „${k}“ nie je číslo.`); t[k] = num(t[k]) }
    value.thresholds = t
    const m = value.mortgage || {}
    for (const k of ['rate_pct', 'years']) { m[k] = num(m[k]); if (m[k] != null && m[k] < 0) return fail('Úrok a splatnosť nesmú byť záporné.') }
    if (m.rate_pct != null && (!m.rate_source || !m.rate_date)) return fail('K úrokovej sadzbe patrí zdroj a dátum.')
    value.mortgage = m
    value.costs = Object.fromEntries(Object.entries(value.costs || {}).map(([k, x]) => [k, num(x)]))
    value.ltr = Object.fromEntries(Object.entries(value.ltr || {}).map(([k, x]) => [k, num(x)]))
    mergeSettings(value)   // overí tvar
  }
  if (key === 'agent') {
    const iv = Number(value.interval_hours); if (!(iv >= 1 && iv <= 168)) return fail('Interval musí byť 1 až 168 hodín.')
    if (!/^\d{2}:\d{2}$/.test(String(value.run_at_local || '07:00'))) return fail('Čas behu musí byť HH:MM.')
    value.interval_hours = iv
  }
  const { error } = await v.s.from('inv_settings').upsert({ key, value, updated_by: who(v), updated_at: new Date().toISOString() })
  if (error) return fail(error.message)
  revalidatePath('/investicie/agent'); return { ok: true }
})
export const saveSourceAction = guard(async (src = {}) => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  const key = String(src.key || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 60)
  if (!key) return fail('Zdroj potrebuje kľúč (písmená, čísla, pomlčky).')
  if (!['feed', 'url', 'ingest'].includes(src.kind)) return fail('Neplatný typ zdroja.')
  let config = {}
  try { config = src.config ? (typeof src.config === 'string' ? JSON.parse(src.config) : src.config) : {} } catch { return fail('Konfigurácia nie je platný JSON.') }
  if (src.kind === 'feed' && !/^https:\/\//i.test(String(src.url || ''))) return fail('Feed musí mať adresu https://…')
  if (src.kind === 'url') { const urls = (config.urls || []).map(String); if (!urls.length || urls.some((u) => !/^https:\/\//i.test(u))) return fail('Zdroj typu „odkazy“ potrebuje config.urls so zoznamom https odkazov.') }
  const row = { key, name: String(src.name || key).slice(0, 80), kind: src.kind, url: src.url ? String(src.url).slice(0, 500) : null, config, mode: ['general', 'targeted', 'both'].includes(src.mode) ? src.mode : 'both', enabled: src.enabled !== false }
  const { error } = await v.s.from('inv_sources').upsert(row)
  if (error) return fail(error.message)
  revalidatePath('/investicie/agent'); return { ok: true }
})
export const resetSourceAction = guard(async (key) => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  const { error } = await v.s.from('inv_sources').update({ blocked: false, blocked_reason: null, consecutive_failures: 0, last_error: null }).eq('key', key)
  if (error) return fail(error.message); revalidatePath('/investicie/agent'); return { ok: true }
})

/* ---------- import starého pilotu (kontrolný náhľad, potom zápis) ---------- */
const PILOT_FIELDS = { property: ['id', 'url', 'title', 'city', 'district', 'address', 'type', 'rooms', 'disposition', 'area_interior', 'area', 'area_exterior', 'floor', 'price', 'condition', 'parking', 'seller'], }
function parsePilot(text) {
  let j; try { j = JSON.parse(text) } catch { return { error: 'Súbor nie je platný JSON.' } }
  const props = Array.isArray(j) ? j : Array.isArray(j.properties) ? j.properties : Array.isArray(j.nehnutelnosti) ? j.nehnutelnosti : []
  const inqs = Array.isArray(j.inquiries) ? j.inquiries : Array.isArray(j.dopyty) ? j.dopyty : []
  return { props, inqs }
}
export const pilotPreviewAction = guard(async (text) => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  const p = parsePilot(String(text || '')); if (p.error) return fail(p.error)
  const rows = p.props.slice(0, 500).map((r, i) => { const n = normalizeListing({ ...r, source_key: 'pilot', external_id: String(r.id || r.url || `p${i}`) }); return { n, errors: validateListing(n) } })
  return { ok: true, properties: rows.length, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).map((r, i) => ({ row: i + 1, errors: r.errors })).slice(0, 20), inquiries: p.inqs.length, sample: rows.slice(0, 5).map((r) => ({ city: r.n.city, address: r.n.address, price: r.n.price, area: r.n.area_interior, rooms: r.n.rooms })) }
})
export const pilotCommitAction = guard(async (text, dataDate) => {
  const v = await viewer({ admin: true }); if (v.error) return fail(v.error)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataDate || ''))) return fail('Zadaj dátum, ku ktorému údaje z pilotu platili (RRRR-MM-DD).')
  const p = parsePilot(String(text || '')); if (p.error) return fail(p.error)
  const at = `${dataDate}T12:00:00.000Z`
  const settings = await loadSettings(v.s)
  const out = { created: 0, updated: 0, merged: 0, invalid: 0, inquiries: 0, unmatched: 0 }
  for (const [i, r] of p.props.slice(0, 500).entries()) {
    const prov = Object.fromEntries(PILOT_FIELDS.property.filter((k) => r[k] != null && r[k] !== '').map((k) => [k === 'area' ? 'area_interior' : k, { kind: 'assumption', ref: `starý pilot k ${dataDate} (historický údaj, overiť)`, at }]))
    const x = await ingestListing(v.s, { ...r, source_key: 'pilot', external_id: String(r.id || r.url || `p${i}`), checked_at: at, prov }, { settings, via: 'pilot-import', actor: who(v) })
    if (!x.ok) { out.invalid++; continue }
    if (x.created) { out.created++; await v.s.from('inv_properties').update({ status: 'unknown', availability_note: `Historický údaj z pilotu k ${dataDate}. Overiť dostupnosť a cenu.` }).eq('id', x.property_id) } else if (x.merged) out.merged++; else out.updated++
    await matchProperty(v.s, x.property_id, { settings })
  }
  for (const q of p.inqs.slice(0, 200)) {   // dopyty len k existujúcim kontaktom; nový kontakt sa nevytvára
    const email = String(q.email || q.contact_email || '').trim().toLowerCase(), phone = normalizePhone(q.phone || q.contact_phone)
    let lead = null
    if (email) lead = (await v.s.from('leads').select('id,assigned_to').ilike('email', email).limit(1)).data?.[0]
    if (!lead && phone) lead = (await v.s.from('leads').select('id,assigned_to').eq('phone', phone).limit(1)).data?.[0]
    if (!lead) { out.unmatched++; continue }
    const c = cleanInquiry({ ...q, status: 'new', source: 'Starý pilot (na potvrdenie)' }); if (c.error) { out.invalid++; continue }
    const { error } = await v.s.from('inv_inquiries').insert({ ...c.patch, lead_id: lead.id, owner_email: (lead.assigned_to || who(v)).toLowerCase(), last_confirmed_at: null, created_by: who(v), notes: [c.patch.notes, `Historický dopyt z pilotu k ${dataDate}: potvrdiť aktuálnosť.`].filter(Boolean).join('\n') })
    if (!error) out.inquiries++
  }
  refresh(); return { ok: true, ...out }
})
