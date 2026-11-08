'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { CATEGORIES, normPhone, MAINT_ROLES } from '@/lib/maint'
import { createCase, transition, setHandling, sendVendorRequests, selectQuote, scheduleCall, shareAccess, addWork, closeCase, createOrder, confirmDraftQuote, logEvent, enqueue } from '@/lib/maint-server'


async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Najprv sa prihlás.' }
  if (!(v.me.roles || []).some((r) => MAINT_ROLES.includes(r))) return { error: 'Údržba je pre prevádzku a zákaznícky servis.' }
  return v
}
const who = (v) => ({ email: v.user.email.toLowerCase(), name: v.me.name || v.user.email })
const isUuid = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || ''))
const str = (fd, k, max = 500) => String(fd.get(k) || '').trim().slice(0, max)
const refresh = (id) => { revalidatePath('/udrzba'); if (id) revalidatePath(`/udrzba/${id}`) }

/** Nový prípad (karta opravy): byt podľa stabilného ID, kategória, príznaky, foto, dopad na hosťa, hosť na mieste, urgent. */
export async function createCaseAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const listing_id = str(fd, 'listing_id', 80), listing_name = str(fd, 'listing_name', 120), category = str(fd, 'category', 30), symptoms = str(fd, 'symptoms', 2000)
  if (!listing_id) return { ok: false, error: 'Vyber byt.' }
  if (!CATEGORIES.some((c) => c.id === category)) return { ok: false, error: 'Vyber kategóriu.' }
  if (symptoms.length < 5) return { ok: false, error: 'Opíš príznaky (aspoň pár slov).' }
  const photos = String(fd.get('photos') || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 10)
  const duplicate_of = str(fd, 'duplicate_of', 40)
  const r = await createCase(v.s, who(v), { listing_id, listing_name, category, symptoms, photos, guest_impact: ['none', 'limited', 'blocking'].includes(fd.get('guest_impact')) ? fd.get('guest_impact') : 'none', guest_present: fd.get('guest_present') === 'on', urgent: fd.get('urgent') === 'on', urgent_reason: str(fd, 'urgent_reason', 300), cosmetic: fd.get('cosmetic') === 'on', incident_id: isUuid(fd.get('incident_id')) ? fd.get('incident_id') : null, duplicate_of: isUuid(duplicate_of) ? duplicate_of : null })
  if (r.ok) refresh(r.case.id)
  return r.ok ? { ok: true, id: r.case.id, ref: r.case.ref, triage: r.triage } : r
}
export async function setHandlingAction(caseId, handling) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId) || !['internal_take', 'needs_specialist'].includes(handling)) return { ok: false, error: 'Neplatná voľba.' }
  const r = await setHandling(v.s, who(v), caseId, handling); refresh(caseId); return r
}
export async function transitionAction(caseId, to, note = '') {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const r = await transition(v.s, who(v), caseId, String(to), {}, String(note || '').slice(0, 500)); refresh(caseId); return r
}
export async function markDuplicateAction(caseId, ofRef) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const { data: orig } = await v.s.from('maint_cases').select('id').eq('ref', String(ofRef || '').trim().toUpperCase()).neq('id', caseId).maybeSingle()
  if (!orig) return { ok: false, error: 'Pôvodný prípad s týmto číslom neexistuje.' }
  const r = await transition(v.s, who(v), caseId, 'duplicate', { duplicate_of: orig.id }, `duplikát ${ofRef}`); refresh(caseId); return r
}
export async function linkIncidentAction(caseId, title) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const t = String(title || '').trim().slice(0, 160); if (t.length < 3) return { ok: false, error: 'Zadaj názov incidentu.' }
  let { data: inc } = await v.s.from('maint_incidents').select('id').ilike('title', t).is('closed_at', null).maybeSingle()
  if (!inc) { const r = await v.s.from('maint_incidents').insert({ title: t, created_by: who(v).email, created_by_name: who(v).name }).select('id').single(); inc = r.data }
  if (!inc) return { ok: false, error: 'Incident sa nepodarilo vytvoriť.' }
  await v.s.from('maint_cases').update({ incident_id: inc.id }).eq('id', caseId)
  await logEvent(v.s, caseId, 'incident_linked', { incident_id: inc.id, title: t }, who(v).email)
  refresh(caseId); return { ok: true }
}
export async function sendRequestsAction(caseId, vendorIds, backup = false) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const ids = (Array.isArray(vendorIds) ? vendorIds : []).filter(isUuid).slice(0, 6)
  if (!isUuid(caseId) || !ids.length) return { ok: false, error: 'Vyber aspoň jedného dodávateľa.' }
  const r = await sendVendorRequests(v.s, who(v), caseId, ids, { backup: !!backup }); refresh(caseId); return r
}
export async function confirmDraftQuoteAction(caseId, quoteId, patch) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(quoteId)) return { ok: false, error: 'Neplatná ponuka.' }
  const r = await confirmDraftQuote(v.s, who(v), quoteId, patch || {}); refresh(caseId); return r
}
export async function selectQuoteAction(caseId, quoteId, tried = '') {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId) || !isUuid(quoteId)) return { ok: false, error: 'Neplatná ponuka.' }
  const r = await selectQuote(v.s, who(v), caseId, quoteId, { tried: String(tried || '').slice(0, 1000) }); refresh(caseId); return r
}
export async function createOrderAction(caseId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const r = await createOrder(v.s, who(v), caseId); refresh(caseId); return r
}
export async function scheduleCallAction(caseId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const r = await scheduleCall(v.s, who(v), caseId); refresh(caseId); return r
}
export async function shareAccessAction(caseId, orderId, from, until, note) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(orderId)) return { ok: false, error: 'Neplatná objednávka.' }
  const r = await shareAccess(v.s, who(v), orderId, { from, until, note }); refresh(caseId); return r
}
export async function addWorkAction(caseId, entry) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId) || !['work', 'material', 'receipt', 'note'].includes(entry && entry.entry_type)) return { ok: false, error: 'Neplatný záznam.' }
  const r = await addWork(v.s, who(v), caseId, { ...entry, receipt: entry.receipt_url ? { url: String(entry.receipt_url).slice(0, 500), number: String(entry.receipt_number || '').slice(0, 80) } : null }); refresh(caseId); return r
}
export async function closeCaseAction(caseId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  const r = await closeCase(v.s, who(v), caseId); refresh(caseId); return r
}
export async function resyncAsanaAction(caseId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isUuid(caseId)) return { ok: false, error: 'Neplatný prípad.' }
  await enqueue(v.s, 'asana_sync', { case_id: caseId }, { dedupeKey: `asana:${caseId}:manual:${Date.now()}` }); return { ok: true }
}

/** Sieť technikov. */
export async function saveVendorAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const id = str(fd, 'id', 40)
  const row = { name: str(fd, 'name', 120), professions: str(fd, 'professions', 300).split(',').map((x) => x.trim()).filter(Boolean), locality: str(fd, 'locality', 120) || null, brands: str(fd, 'brands', 300).split(',').map((x) => x.trim()).filter(Boolean), availability: str(fd, 'availability', 200) || null, response_hours: Number(fd.get('response_hours')) || 24, callout_fee: fd.get('callout_fee') ? Number(fd.get('callout_fee')) : null, email: str(fd, 'email', 160).toLowerCase() || null, phone: normPhone(str(fd, 'phone', 40)) || null, is_primary: fd.get('is_primary') === 'on', backup_of: isUuid(fd.get('backup_of')) ? fd.get('backup_of') : null, active: fd.get('active') !== 'off', note: str(fd, 'note', 500) || null, updated_at: new Date().toISOString() }
  if (row.name.length < 2) return { ok: false, error: 'Zadaj meno dodávateľa.' }
  if (!row.professions.length) return { ok: false, error: 'Zadaj aspoň jednu profesiu.' }
  const q = isUuid(id) ? v.s.from('maint_vendors').update(row).eq('id', id) : v.s.from('maint_vendors').insert(row)
  const { error } = await q
  if (error) return { ok: false, error: error.message }
  revalidatePath('/udrzba/dodavatelia'); return { ok: true, n: Date.now() }
}
/** Nastavenia bytu: schvaľovateľ, kontakt, limity, fakturačné pravidlá, služba, overenie. */
export async function saveListingSettingsAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const listing_id = str(fd, 'listing_id', 80); if (!listing_id) return { ok: false, error: 'Vyber byt.' }
  const row = { listing_id, approver_name: str(fd, 'approver_name', 120) || null, approver_email: str(fd, 'approver_email', 160).toLowerCase() || null, approver_phone: normPhone(str(fd, 'approver_phone', 40)) || null, routine_limit: Number(fd.get('routine_limit')) || 0, emergency_limit: Number(fd.get('emergency_limit')) || 0, billing_rules: { note: str(fd, 'billing_rules', 500), material_to: ['owner', 'livein'].includes(fd.get('material_to')) ? fd.get('material_to') : 'owner' }, duty_contact: str(fd, 'duty_contact', 160).toLowerCase() || null, verify_hint: str(fd, 'verify_hint', 200) || null, updated_by: who(v).email, updated_at: new Date().toISOString() }
  if (row.approver_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.approver_email)) return { ok: false, error: 'E-mail schvaľovateľa nie je platný.' }
  const { error } = await v.s.from('maint_listing_settings').upsert(row)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/udrzba/nastavenia'); return { ok: true, n: Date.now() }
}
/** Nastavenia pilotu (len admin): test režim, povolené adresy a čísla, poplatok, pripomienky, telefónia. Zapnutie pilotu je vedomý krok. */
export async function savePilotSettingsAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Nastavenia pilotu mení len admin.' }
  const list = (k) => str(fd, k, 2000).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
  const pilot = { enabled: fd.get('enabled') === 'on', test_mode: fd.get('test_mode') !== 'off', allowed_emails: list('allowed_emails').map((e) => e.toLowerCase()), allowed_phones: list('allowed_phones').map(normPhone), notes: str(fd, 'notes', 300) }
  const fee = { enabled: fd.get('fee_enabled') === 'on', amount_eur: Number(fd.get('fee_amount')) || 45, max_minutes: Number(fd.get('fee_minutes')) || 60, material_separate: true, terms_approved: fd.get('fee_terms') === 'on' }
  const reminders = { owner_reminder_hours: list('reminder_hours').map(Number).filter((n) => n > 0).slice(0, 4), owner_escalate_hours: Number(fd.get('escalate_hours')) || 48, vendor_backup_hours: Number(fd.get('backup_hours')) || 24, call_retry: { max_attempts: Number(fd.get('call_attempts')) || 3, spacing_minutes: list('call_spacing').map(Number).filter((n) => n > 0) } }
  if (!reminders.owner_reminder_hours.length) reminders.owner_reminder_hours = [4, 24]
  if (!reminders.call_retry.spacing_minutes.length) reminders.call_retry.spacing_minutes = [60, 240]
  const telephony = { provider: ['test', '3cx', 'twilio'].includes(fd.get('provider')) ? fd.get('provider') : 'test', agent_version: str(fd, 'agent_version', 20) || 'v0.1', inbound_enabled: fd.get('inbound_enabled') === 'on' }
  const retention = { transcripts_days: Number(fd.get('transcripts_days')) || 90, recordings_days: Number(fd.get('recordings_days')) || 30 }
  const rows = [['pilot', pilot], ['fee', fee], ['reminders', reminders], ['telephony', telephony], ['retention', retention]].map(([key, value]) => ({ key, value, updated_by: who(v).email, updated_at: new Date().toISOString() }))
  const { error } = await v.s.from('maint_settings').upsert(rows)
  if (error) return { ok: false, error: error.message }
  await logEvent(v.s, null, 'settings_changed', { pilot_enabled: pilot.enabled, test_mode: pilot.test_mode, provider: telephony.provider }, who(v).email)
  revalidatePath('/udrzba/nastavenia'); return { ok: true, n: Date.now() }
}
