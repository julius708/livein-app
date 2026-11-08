// Údržba (pilot): serverová logika nad Supabase. Udalosti sú append-only (maint_events), doručenie správ a hovorov ide cez frontu (maint_jobs),
// stav prípadu je oddelený od stavu doručenia. Produkčné správy, hovory a objednávky sú v test režime obmedzené na povolené adresy a čísla.
import { adminClientAsync } from './supabase-admin'
import { triage, dueAt, canTransition, approvalNeed, decide, approvalMatches, reminderPlan, quoteTotal, randomToken, hashToken, allowedTarget, requestTag, parseRequestTag, extractQuoteFromText, financeBlockers, feeFor, STATUSES, findRepeat } from './maint'
import { sendMail, approvalEmail, reminderEmail, vendorRequestEmail } from './maint-mail'
import { providerFor, providerName, providerReady, normPhone } from './maint-telephony'
import { syncCaseTask, asanaReady } from './maint-asana'

export const appUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://app.live-in.international').replace(/\/+$/, '')
const iso = (d = Date.now()) => new Date(d).toISOString()
const log = (...a) => console.log('[udrzba]', ...a)

export async function getSettings(s) {
  const { data } = await s.from('maint_settings').select('key,value')
  const o = {}; for (const r of data || []) o[r.key] = r.value || {}
  return { pilot: o.pilot || { enabled: false, test_mode: true }, fee: o.fee || {}, reminders: o.reminders || {}, telephony: o.telephony || {}, retention: o.retention || {} }
}
export async function logEvent(s, caseId, type, payload = {}, actor = null, dedupeKey = null) {
  const { error } = await s.from('maint_events').insert({ case_id: caseId, type, payload, actor, dedupe_key: dedupeKey })
  if (error && !/duplicate|unique/i.test(error.message)) log('event', type, error.message)
  return !error
}
export async function enqueue(s, kind, payload = {}, { runAfter = null, dedupeKey = null, maxAttempts = 5 } = {}) {
  const { error } = await s.from('maint_jobs').insert({ kind, payload, run_after: runAfter || iso(), dedupe_key: dedupeKey, max_attempts: maxAttempts })
  if (error && !/duplicate|unique/i.test(error.message)) log('enqueue', kind, error.message)
  return !error
}
async function notifyDuty(s, c, title, body) {
  const { data: ls } = await s.from('maint_listing_settings').select('duty_contact').eq('listing_id', c.listing_id).maybeSingle()
  const targets = [ls && ls.duty_contact, process.env.MAINT_DUTY_EMAIL].filter(Boolean)
  if (!targets.length) { const { data: admins } = await s.from('app_users').select('email').eq('active', true).contains('roles', ['admin']); for (const a of admins || []) targets.push(a.email) }
  for (const email of new Set(targets)) await s.from('notifications').insert({ user_email: email, kind: 'maint', title, body, url: `/udrzba/${c.id}` })
}

/** Nový prípad: triáž, termín, rola, udalosť, úloha v Asane cez frontu, urgent → služba ihneď. */
export async function createCase(s, who, input) {
  const t = triage({ category: input.category, guest_impact: input.guest_impact, guest_present: !!input.guest_present, urgent: !!input.urgent, cosmetic: !!input.cosmetic })
  const row = {
    listing_id: input.listing_id, listing_name: input.listing_name || null, category: input.category, symptoms: input.symptoms, photos: input.photos || [],
    guest_impact: input.guest_impact || 'none', guest_present: !!input.guest_present, severity: t.severity, status: 'new',
    profession: t.profession || null, assigned_role: t.role, due_at: dueAt(t.hours), urgent_override: !!input.urgent, urgent_reason: input.urgent_reason || null,
    incident_id: input.incident_id || null, duplicate_of: input.duplicate_of || null, source: input.source || 'app', created_by: who.email, created_by_name: who.name,
  }
  if (input.duplicate_of) row.status = 'duplicate'
  const { data: ls } = await s.from('maint_listing_settings').select('*').eq('listing_id', input.listing_id).maybeSingle()
  if (ls) row.approver_snapshot = { approver_name: ls.approver_name, approver_email: ls.approver_email, approver_phone: ls.approver_phone, routine_limit: ls.routine_limit, emergency_limit: ls.emergency_limit, billing_rules: ls.billing_rules, duty_contact: ls.duty_contact, verify_hint: ls.verify_hint }
  const { data: c, error } = await s.from('maint_cases').insert(row).select('*').single()
  if (error) return { ok: false, error: error.message }
  await logEvent(s, c.id, 'created', { severity: t.severity, role: t.role, direct: t.direct, profession: t.profession }, who.email)
  await enqueue(s, 'asana_sync', { case_id: c.id }, { dedupeKey: `asana:${c.id}:${Date.now()}` })
  if (t.severity === 'emergency') { await notifyDuty(s, c, `Havária ${c.ref}: ${c.listing_name || c.listing_id}`, c.symptoms.slice(0, 200)); await logEvent(s, c.id, 'duty_notified', { reason: 'emergency' }, 'system') }
  return { ok: true, case: c, triage: t }
}

export async function transition(s, who, caseId, to, patch = {}, note = '') {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  if (!c) return { ok: false, error: 'Prípad neexistuje.' }
  if (!canTransition(c.status, to)) return { ok: false, error: `Z „${STATUSES[c.status] || c.status}“ sa nedá prejsť na „${STATUSES[to] || to}“.` }
  const upd = { ...patch, status: to, updated_at: iso() }
  if (['closed', 'cancelled', 'done'].includes(to) && !c.closed_at) upd.closed_at = iso()
  const { error } = await s.from('maint_cases').update(upd).eq('id', caseId).eq('status', c.status)
  if (error) return { ok: false, error: error.message }
  await logEvent(s, caseId, 'status', { from: c.status, to, note }, who.email)
  await enqueue(s, 'asana_sync', { case_id: caseId }, { dedupeKey: `asana:${caseId}:${to}:${Date.now()}` })
  return { ok: true }
}

/** Interný údržbár: Preberám (rieši sám) alebo Treba špecialistu (dopyty profesii). */
export async function setHandling(s, who, caseId, handling) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  if (!c) return { ok: false, error: 'Prípad neexistuje.' }
  const to = handling === 'internal_take' ? 'internal' : 'quoting'
  const r = await transition(s, who, caseId, to, { handling, assigned_role: handling === 'internal_take' ? 'internal_tech' : 'specialist', assignee_email: handling === 'internal_take' ? who.email : c.assignee_email })
  if (r.ok) await logEvent(s, caseId, 'handling', { handling }, who.email)
  return r
}

/** Dopyty dodávateľom: časovo obmedzený odkaz na ponuku, e-mail cez frontu (v test režime len na povolené adresy). Pri havárii súbežne viacerým. */
export async function sendVendorRequests(s, who, caseId, vendorIds, { backup = false, hours = 72 } = {}) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  if (!c) return { ok: false, error: 'Prípad neexistuje.' }
  const links = []
  for (const vendorId of vendorIds) {
    const token = randomToken(), token_hash = await hashToken(token)
    const expires_at = iso(Date.now() + hours * 3600e3)
    const { data: r, error } = await s.from('maint_requests').insert({ case_id: caseId, vendor_id: vendorId, token_hash, expires_at, is_backup: backup, sent_at: iso(), channel: 'link' }).select('id').single()
    if (error) return { ok: false, error: error.message }
    const url = `${appUrl()}/p/dopyt/${token}`
    links.push({ request_id: r.id, vendor_id: vendorId, url, expires_at })
    await logEvent(s, caseId, 'request_sent', { request_id: r.id, vendor_id: vendorId, backup }, who.email)
    await enqueue(s, 'send_vendor_email', { request_id: r.id, url }, { dedupeKey: `vendor_email:${r.id}` })
  }
  if (['new', 'triage', 'internal'].includes(c.status)) await transition(s, who, caseId, 'quoting', { assigned_role: 'specialist' })
  // pri neodpovedi záloha: naplánuj kontrolu
  const st = await getSettings(s)
  await enqueue(s, 'vendor_backup_check', { case_id: caseId }, { runAfter: iso(Date.now() + (Number(st.reminders.vendor_backup_hours) || 24) * 3600e3), dedupeKey: `vendor_backup:${caseId}:${Date.now()}` })
  return { ok: true, links }
}

/** Verejný formulár ponuky (dodávateľ): nájde dopyt podľa tokenu. */
export async function requestByToken(token) {
  const admin = await adminClientAsync()
  const { data: r } = await admin.from('maint_requests').select('*, maint_cases(*), maint_vendors(*)').eq('token_hash', await hashToken(token)).maybeSingle()
  if (!r) return null
  if (r.status === 'sent') await admin.from('maint_requests').update({ status: 'viewed', viewed_at: iso() }).eq('id', r.id).eq('status', 'sent')
  return r
}
/** Dodávateľ pošle ponuku alebo odmietne. Nová ponuka k tej istej žiadosti = nová verzia. */
export async function submitQuote(token, form) {
  const admin = await adminClientAsync()
  const r = await requestByToken(token)
  if (!r) return { ok: false, error: 'Odkaz nie je platný.' }
  if (Date.parse(r.expires_at) < Date.now()) return { ok: false, error: 'Platnosť odkazu uplynula. Ozvite sa prosím LIVE-IN.' }
  if (['declined', 'cancelled', 'expired'].includes(r.status)) return { ok: false, error: 'Tento dopyt je už uzavretý.' }
  const c = r.maint_cases
  if (form.decline) {
    await admin.from('maint_requests').update({ status: 'declined', answered_at: iso() }).eq('id', r.id)
    await logEvent(admin, c.id, 'request_declined', { request_id: r.id, reason: String(form.reason || '').slice(0, 300) }, 'vendor')
    return { ok: true, declined: true }
  }
  const items = (Array.isArray(form.items) ? form.items : []).map((it) => ({ name: String(it.name || '').slice(0, 120), qty: Number(it.qty) || 1, price: Number(it.price) || 0 })).filter((it) => it.name)
  const q = { items, callout: Number(form.callout) || 0, diagnostics: Number(form.diagnostics) || 0, material: Number(form.material) || 0, vat_mode: ['with_vat', 'without_vat', 'not_vat_payer'].includes(form.vat_mode) ? form.vat_mode : 'without_vat' }
  const { total } = quoteTotal(q)
  if (!total && !form.not_repairable) return { ok: false, error: 'Zadajte aspoň jednu položku alebo cenu.' }
  const { data: prev } = await admin.from('maint_quotes').select('id,version').eq('case_id', c.id).eq('vendor_id', r.vendor_id).order('version', { ascending: false }).limit(1)
  const version = prev && prev.length ? prev[0].version + 1 : 1
  if (prev && prev.length) await admin.from('maint_quotes').update({ status: 'superseded' }).eq('id', prev[0].id)
  const row = { case_id: c.id, request_id: r.id, vendor_id: r.vendor_id, version, kind: form.kind === 'replacement' ? 'replacement' : 'repair', ...q, total, eta: String(form.eta || '').slice(0, 120) || null, valid_until: form.valid_until || null, attachments: Array.isArray(form.attachments) ? form.attachments.slice(0, 10) : [], note: String(form.note || '').slice(0, 2000) || null, replacement: form.kind === 'replacement' ? { reason: form.replacement_reason, model: form.replacement_model, price: Number(form.replacement_price) || null, installation: Number(form.replacement_installation) || null, disposal: Number(form.replacement_disposal) || null } : null, not_repairable: String(form.not_repairable || '').slice(0, 1000) || null, source: 'link', draft: false }
  const { data: quote, error } = await admin.from('maint_quotes').insert(row).select('*').single()
  if (error) return { ok: false, error: error.message }
  await admin.from('maint_requests').update({ status: 'offered', answered_at: iso() }).eq('id', r.id)
  await logEvent(admin, c.id, 'quote_received', { quote_id: quote.id, vendor_id: r.vendor_id, version, total, kind: row.kind }, 'vendor')
  // nová verzia zneplatní starý súhlas k predchádzajúcej verzii tejto ponuky
  if (version > 1) await invalidateApprovalsFor(admin, c.id, prev[0].id, 'quote_updated')
  if (c.status === 'quoting') await admin.from('maint_cases').update({ status: 'comparing', updated_at: iso() }).eq('id', c.id).eq('status', 'quoting')
  return { ok: true, quote }
}
async function invalidateApprovalsFor(s, caseId, quoteId, reason) {
  const { data: live } = await s.from('maint_approvals').select('id').eq('case_id', caseId).eq('quote_id', quoteId).in('status', ['pending', 'sent', 'delivered', 'question', 'no_response'])
  for (const a of live || []) { await s.from('maint_approvals').update({ status: 'invalidated', decision_note: reason }).eq('id', a.id); await logEvent(s, caseId, 'approval_invalidated', { approval_id: a.id, reason }, 'system') }
  await s.from('maint_cases').update({ approval_id: null }).eq('id', caseId).eq('status', 'awaiting_approval').then(async ({ error }) => { if (!error) await s.from('maint_cases').update({ status: 'comparing' }).eq('id', caseId).eq('status', 'awaiting_approval') })
}

/** Tím vybral ponuku: v limite → schválené pravidlom; nad limit → súhlas majiteľa e-mailom; bez schvaľovateľa → služba. Zmena ceny/rozsahu zneplatní starý súhlas. */
export async function selectQuote(s, who, caseId, quoteId, { tried = '' } = {}) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  const { data: q } = await s.from('maint_quotes').select('*, maint_vendors(name)').eq('id', quoteId).eq('case_id', caseId).maybeSingle()
  if (!c || !q) return { ok: false, error: 'Ponuka alebo prípad neexistuje.' }
  if (q.status === 'superseded' || q.draft) return { ok: false, error: q.draft ? 'Ponuka z e-mailu je len návrh, najprv ju skontrolujte a potvrďte.' : 'Táto verzia ponuky už neplatí.' }
  if (!['comparing', 'quoting', 'internal', 'awaiting_approval', 'declined', 'question', 'no_response'].includes(c.status)) return { ok: false, error: `V stave „${STATUSES[c.status]}“ sa ponuka nevyberá.` }
  await s.from('maint_quotes').update({ status: 'submitted' }).eq('case_id', caseId).eq('status', 'selected')
  await s.from('maint_quotes').update({ status: 'selected' }).eq('id', quoteId)
  // starý súhlas k inej ponuke/verzii neplatí
  const { data: live } = await s.from('maint_approvals').select('*').eq('case_id', caseId).in('status', ['pending', 'sent', 'delivered', 'question', 'no_response'])
  for (const a of live || []) if (!approvalMatches(a, q)) { await s.from('maint_approvals').update({ status: 'invalidated', decision_note: 'quote_changed' }).eq('id', a.id); await logEvent(s, caseId, 'approval_invalidated', { approval_id: a.id, reason: 'quote_changed' }, who.email) }
  const settings = c.approver_snapshot || {}
  const need = approvalNeed({ total: q.total, severity: c.severity, settings })
  await logEvent(s, caseId, 'quote_selected', { quote_id: quoteId, version: q.version, total: q.total, need }, who.email)
  if (!need.needed) {
    await s.from('maint_cases').update({ selected_quote_id: quoteId, status: 'approved', updated_at: iso() }).eq('id', caseId)
    await logEvent(s, caseId, 'approved_by_limit', { limit: need.limit, total: q.total }, 'system')
    return { ok: true, mode: 'within_limit' }
  }
  if (need.blocked) {
    await s.from('maint_cases').update({ selected_quote_id: quoteId, status: 'comparing', updated_at: iso() }).eq('id', caseId)
    await notifyDuty(s, c, `Chýba schvaľovateľ: ${c.ref}`, 'Byt nemá oprávneného schvaľovateľa ani limit. Doplň v nastaveniach bytu.')
    await logEvent(s, caseId, 'approver_missing', {}, 'system')
    return { ok: false, error: 'Byt nemá oprávneného schvaľovateľa. Doplň ho v nastaveniach bytu; služba bola upozornená.' }
  }
  const existing = (live || []).filter((a) => a.status !== 'no_response').find((a) => approvalMatches(a, q))
  if (existing) return { ok: true, mode: 'already_sent', approval_id: existing.id }
  const token = randomToken(), token_hash = await hashToken(token)
  const { data: a, error } = await s.from('maint_approvals').insert({ case_id: caseId, quote_id: quoteId, quote_version: q.version, quote_total: q.total, recipient_email: settings.approver_email, recipient_name: settings.approver_name || null, token_hash, status: 'pending', expires_at: iso(Date.now() + 7 * 864e5), created_by: who.email }).select('*').single()
  if (error) return { ok: false, error: error.message }
  await s.from('maint_cases').update({ selected_quote_id: quoteId, approval_id: a.id, status: 'awaiting_approval', updated_at: iso() }).eq('id', caseId)
  await enqueue(s, 'send_approval_email', { approval_id: a.id, url: `${appUrl()}/p/schvalenie/${token}`, tried }, { dedupeKey: `approval_email:${a.id}` })
  await logEvent(s, caseId, 'approval_created', { approval_id: a.id, to: 'majiteľ', total: q.total }, who.email)
  return { ok: true, mode: 'email', approval_id: a.id, url: `${appUrl()}/p/schvalenie/${token}` }
}

/** Verejná stránka súhlasu: GET nič nerozhoduje. */
export async function approvalByToken(token) {
  const admin = await adminClientAsync()
  const { data: a } = await admin.from('maint_approvals').select('*, maint_cases(*), maint_quotes(*, maint_vendors(name))').eq('token_hash', await hashToken(token)).maybeSingle()
  return a || null
}
/** Rozhodnutie majiteľa: výslovný POST, jedna platná verzia, jeden súhlas → jedna objednávka. */
export async function decideApproval(token, action, note = '', meta = {}) {
  const admin = await adminClientAsync()
  const a = await approvalByToken(token)
  const q = a && a.maint_quotes, c = a && a.maint_cases
  const d = decide({ approval: a, quote: q, action })
  if (!d.ok) return d
  const { data: upd, error } = await admin.from('maint_approvals').update({ status: d.status, decided_at: iso(), decision_note: String(note || '').slice(0, 1000) || null }).eq('id', a.id).in('status', ['sent', 'delivered', 'question', 'pending', 'no_response']).select('id')
  if (error || !upd || !upd.length) return { ok: false, error: 'already_decided' }
  await logEvent(admin, c.id, 'owner_decision', { approval_id: a.id, decision: d.status, note: String(note || '').slice(0, 300), ua: String(meta.ua || '').slice(0, 120) }, 'owner', `decision:${a.id}`)
  if (d.status === 'approved') {
    const settings = await getSettings(admin)
    const { data: o, error: oe } = await admin.from('maint_orders').insert({ case_id: c.id, approval_id: a.id, quote_id: q.id, vendor_id: q.vendor_id, authorized_by: a.recipient_email, status: 'created', created_by: 'owner' }).select('id').single()
    if (!oe && o) {
      await admin.from('maint_cases').update({ status: 'ordered', order_id: o.id, updated_at: iso() }).eq('id', c.id)
      await logEvent(admin, c.id, 'order_created', { order_id: o.id, pilot_enabled: !!settings.pilot.enabled, note: settings.pilot.enabled ? '' : 'Pilot vypnutý: objednávka je evidovaná, dodávateľovi sa nič neposiela.' }, 'system', `order:${a.id}`)
    } else if (oe && !/duplicate|unique/i.test(oe.message)) log('order', oe.message)
    await admin.from('maint_calls').update({ status: 'cancelled', result: 'rozhodnuté e-mailom' }).eq('approval_id', a.id).in('status', ['scheduled'])
    await admin.from('maint_jobs').update({ status: 'cancelled' }).eq('status', 'queued').in('kind', ['owner_reminder', 'owner_escalate', 'place_call']).contains('payload', { approval_id: a.id })
  } else if (d.status === 'declined') {
    await admin.from('maint_cases').update({ status: 'declined', updated_at: iso() }).eq('id', c.id)
    await admin.from('maint_jobs').update({ status: 'cancelled' }).eq('status', 'queued').in('kind', ['owner_reminder', 'owner_escalate', 'place_call']).contains('payload', { approval_id: a.id })
  } else {
    await admin.from('maint_cases').update({ status: 'question', updated_at: iso() }).eq('id', c.id)
    await notifyDuty(admin, c, `Majiteľ má otázku: ${c.ref}`, String(note || '').slice(0, 200))
  }
  await enqueue(admin, 'asana_sync', { case_id: c.id }, { dedupeKey: `asana:${c.id}:decision:${a.id}` })
  return { ok: true, status: d.status }
}

/** Objednávka: prístup do bytu len vybranému technikovi po potvrdení vstupu a na potrebný čas. */
export async function shareAccess(s, who, orderId, { from, until, note }) {
  const { data: o } = await s.from('maint_orders').select('*').eq('id', orderId).maybeSingle()
  if (!o) return { ok: false, error: 'Objednávka neexistuje.' }
  if (!from || !until || Date.parse(until) <= Date.parse(from)) return { ok: false, error: 'Zadaj platný čas od a do.' }
  if (Date.parse(until) - Date.parse(from) > 3 * 864e5) return { ok: false, error: 'Prístup najviac na 3 dni; pri dlhšej oprave ho predĺž znova.' }
  await s.from('maint_orders').update({ access_shared_to: o.vendor_id, access_from: from, access_until: until, access_note: String(note || '').slice(0, 300), status: o.status === 'created' ? 'scheduled' : o.status, scheduled_at: o.scheduled_at || from, updated_at: iso() }).eq('id', orderId)
  await logEvent(s, o.case_id, 'access_shared', { order_id: orderId, vendor_id: o.vendor_id, from, until }, who.email)
  return { ok: true }
}

/** Hovor majiteľovi: až po akceptovaní e-mailu poskytovateľom; pred vytočením sa znovu overí ponuka a stav rozhodnutia. */
export async function scheduleCall(s, who, caseId) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  if (!c || !c.approval_id) return { ok: false, error: 'Prípad nemá odoslaný súhlas.' }
  const { data: a } = await s.from('maint_approvals').select('*').eq('id', c.approval_id).maybeSingle()
  if (!a || !['sent', 'delivered'].includes(a.status)) return { ok: false, error: 'Hovor sa plánuje až po odoslanom e-maile so súhlasom (a pred rozhodnutím).' }
  const phone = normPhone((c.approver_snapshot || {}).approver_phone)
  if (!phone) return { ok: false, error: 'Schvaľovateľ nemá telefón.' }
  const settings = await getSettings(s)
  if (!allowedTarget(settings.pilot, { phone })) return { ok: false, error: 'Test režim: toto číslo nie je v zozname povolených čísel.' }
  const { data: call, error } = await s.from('maint_calls').insert({ case_id: caseId, approval_id: a.id, direction: 'outbound', provider: providerName(settings.telephony), to_phone: phone, status: 'scheduled', scheduled_at: iso(), agent_version: settings.telephony.agent_version || 'v0.1', lang: 'sk' }).select('*').single()
  if (error) return { ok: false, error: error.message }
  await enqueue(s, 'place_call', { call_id: call.id, approval_id: a.id, case_id: caseId }, { dedupeKey: `call:${call.id}` })
  await logEvent(s, caseId, 'call_scheduled', { call_id: call.id, provider: call.provider }, who.email)
  return { ok: true, call }
}

/** Pracovný záznam, materiál, doklad, poplatok. */
export async function addWork(s, who, caseId, entry) {
  const row = { case_id: caseId, entry_type: entry.entry_type, minutes: entry.minutes ? Number(entry.minutes) : null, description: String(entry.description || '').slice(0, 500) || null, amount: entry.amount ? Number(entry.amount) : null, receipt: entry.receipt || null, billed_to: entry.billed_to || null, created_by: who.email, created_by_name: who.name }
  const { error } = await s.from('maint_work_log').insert(row)
  if (error) return { ok: false, error: error.message }
  await logEvent(s, caseId, 'work_logged', { entry_type: row.entry_type, minutes: row.minutes, amount: row.amount }, who.email)
  return { ok: true }
}
/** Finančné uzavretie: blokuje chýbajúci doklad alebo duplicita; poplatok len so schválenými podmienkami. */
export async function closeCase(s, who, caseId) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  const { data: work } = await s.from('maint_work_log').select('*').eq('case_id', caseId)
  if (!c) return { ok: false, error: 'Prípad neexistuje.' }
  const blockers = financeBlockers(work || [])
  if (blockers.length) { await s.from('maint_cases').update({ finance_status: 'blocked', finance_block_reason: blockers.join('; ') }).eq('id', caseId); return { ok: false, error: 'Finančné uzavretie blokuje: ' + blockers.join('; ') } }
  const settings = await getSettings(s)
  const minutes = (work || []).filter((w) => w.entry_type === 'work').reduce((a, w) => a + (Number(w.minutes) || 0), 0)
  const fee = feeFor({ severity: c.severity, minutes, fee: settings.fee })
  if (fee.amount > 0 && !(work || []).some((w) => w.entry_type === 'fee')) await addWork(s, who, caseId, { entry_type: 'fee', amount: fee.amount, description: `Poplatok za dokončenú bežnú opravu do ${settings.fee.max_minutes || 60} min`, billed_to: 'owner' })
  const r = await transition(s, who, caseId, 'closed', { finance_status: 'closed', finance_block_reason: null })
  if (r.ok) await logEvent(s, caseId, 'finance_closed', { minutes, fee }, who.email)
  return r
}

/** Prichádzajúci e-mail (Resend webhook): priradenie podľa overeného odosielateľa a značky dopytu; AI extrakcia je len návrh. */
export async function ingestInboundEmail(admin, { from, subject, text, html, attachments = [] }) {
  const tag = parseRequestTag(subject) || parseRequestTag(text)
  if (!tag) return { ok: false, error: 'bez značky dopytu' }
  const { data: c } = await admin.from('maint_cases').select('id,ref,status').eq('ref', tag.ref).maybeSingle()
  if (!c) return { ok: false, error: 'neznámy prípad' }
  const { data: reqs } = await admin.from('maint_requests').select('*, maint_vendors(email,name)').eq('case_id', c.id)
  const r = (reqs || []).find((x) => String(x.id).startsWith(tag.requestPrefix))
  if (!r) return { ok: false, error: 'neznámy dopyt' }
  const senderOk = r.maint_vendors && r.maint_vendors.email && String(from || '').toLowerCase().includes(String(r.maint_vendors.email).toLowerCase())
  const ext = extractQuoteFromText(text || html || '')
  if (ext.declined && senderOk) { await admin.from('maint_requests').update({ status: 'declined', answered_at: iso() }).eq('id', r.id); await logEvent(admin, c.id, 'request_declined', { request_id: r.id, via: 'email' }, 'vendor'); return { ok: true, declined: true } }
  const { data: prev } = await admin.from('maint_quotes').select('version').eq('case_id', c.id).eq('vendor_id', r.vendor_id).order('version', { ascending: false }).limit(1)
  const version = prev && prev.length ? prev[0].version + 1 : 1
  const draft = !senderOk || !ext.total || ext.confidence < 0.8
  const { data: q, error } = await admin.from('maint_quotes').insert({ case_id: c.id, request_id: r.id, vendor_id: r.vendor_id, version, items: [], vat_mode: ext.vat_mode || 'without_vat', total: ext.total || 0, eta: ext.eta, attachments, note: String(text || '').slice(0, 2000), source: 'email', draft, confidence: ext.confidence }).select('id').single()
  if (error) return { ok: false, error: error.message }
  await admin.from('maint_requests').update({ status: 'offered', answered_at: iso() }).eq('id', r.id)
  await logEvent(admin, c.id, 'quote_received', { quote_id: q.id, vendor_id: r.vendor_id, version, via: 'email', draft, sender_verified: !!senderOk }, 'vendor')
  return { ok: true, quote_id: q.id, draft }
}

/** Udalosti prichádzajúcich hovorov (recepčná AI): jeden call_id na hovor, dedupe, opakovaný kontakt do 24 h. */
export async function recordCallEvent(admin, ev) {
  const callId = String(ev.call_id || '').slice(0, 120)
  if (!callId || !ev.event) return { ok: false, error: 'call_id a event sú povinné' }
  const { data: session } = await admin.from('maint_call_sessions').select('*').eq('call_id', callId).maybeSingle()
  if (!session) {
    const row = { call_id: callId, direction: ev.direction || 'inbound', started_at: ev.ts || iso(), agent_version: ev.agent_version || null, lang: ev.lang || null, topic: ev.topic || null, caller_hash: ev.caller_hash || null }
    const { data: prevs } = await admin.from('maint_call_sessions').select('call_id,caller_hash,topic,started_at').gte('started_at', iso(Date.now() - 25 * 3600e3))
    row.repeat_of = findRepeat(row, prevs || [])
    await admin.from('maint_call_sessions').insert(row)
  }
  const { error } = await admin.from('maint_call_events').insert({ call_id: callId, event: ev.event, ts: ev.ts || iso(), agent_version: ev.agent_version || null, lang: ev.lang || null, topic: ev.topic || null, payload: ev.payload || {}, dedupe_key: ev.dedupe_key || `${callId}:${ev.event}:${ev.seq || ''}` || null })
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message }
  const outcome = { resolved_confirmed: 'resolved_ai', transfer_connected: 'transferred', transfer_failed: 'transfer_failed', case_created: 'case_created', ended_unresolved: 'ended_unresolved', tech_error: 'tech_error' }[ev.event]
  const upd = { updated_at: iso(), ...(ev.topic ? { topic: ev.topic } : {}), ...(ev.lang ? { lang: ev.lang } : {}) }
  if (outcome) upd.outcome = outcome
  if (['resolved_confirmed', 'transfer_connected', 'transfer_failed', 'ended_unresolved', 'tech_error'].includes(ev.event)) upd.ended_at = ev.ts || iso()
  await admin.from('maint_call_sessions').update(upd).eq('call_id', callId)
  return { ok: true, dup: !!error }
}

/** Spracovanie fronty (cron): e-maily, pripomienky, eskalácie, záloha dodávateľa, hovory, Asana. Idempotentné cez dedupe_key a stav jobu. */
export async function processJobs(limit = 20) {
  const admin = await adminClientAsync()
  const settings = await getSettings(admin)
  const { data: jobs } = await admin.from('maint_jobs').select('*').eq('status', 'queued').lte('run_after', iso()).order('id').limit(limit)
  const out = { done: 0, failed: 0, skipped: 0 }
  for (const job of jobs || []) {
    const { data: lock } = await admin.from('maint_jobs').update({ status: 'running', locked_at: iso(), attempts: job.attempts + 1 }).eq('id', job.id).eq('status', 'queued').select('id')
    if (!lock || !lock.length) { out.skipped++; continue }
    try {
      const r = await runJob(admin, settings, job)
      await admin.from('maint_jobs').update({ status: r && r.retryAt ? 'queued' : 'done', done_at: r && r.retryAt ? null : iso(), run_after: r && r.retryAt ? r.retryAt : job.run_after, last_error: r && r.note ? String(r.note).slice(0, 300) : null }).eq('id', job.id)
      out.done++
    } catch (e) {
      const failed = job.attempts + 1 >= job.max_attempts
      await admin.from('maint_jobs').update({ status: failed ? 'failed' : 'queued', run_after: iso(Date.now() + Math.min(60, 2 ** job.attempts) * 60e3), last_error: String(e && e.message).slice(0, 300) }).eq('id', job.id)
      out.failed++
      log('job failed', job.kind, e && e.message)
    }
  }
  return out
}

async function runJob(admin, settings, job) {
  const p = job.payload || {}
  if (job.kind === 'send_approval_email') {
    const { data: a } = await admin.from('maint_approvals').select('*, maint_cases(*), maint_quotes(*, maint_vendors(name))').eq('id', p.approval_id).maybeSingle()
    if (!a || a.status !== 'pending') return { note: 'súhlas už nie je v stave pending' }
    const c = a.maint_cases, q = a.maint_quotes
    const impact = { none: 'bez dopadu na hostí', limited: 'obmedzený dopad na pobyt', blocking: 'hosť nemôže byt plnohodnotne používať' }[c.guest_impact] + (c.guest_present ? ', hosť je v byte' : '')
    const mail = approvalEmail({ ref: c.ref, listingName: c.listing_name || c.listing_id, ownerName: a.recipient_name, impact, tried: p.tried, quote: q, vendorName: q.maint_vendors && q.maint_vendors.name, limit: (c.approver_snapshot || {})[c.severity === 'emergency' ? 'emergency_limit' : 'routine_limit'], due: c.due_at ? new Date(c.due_at).toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' }) : '', url: p.url, items: q.items, attachments: q.attachments })
    if (!allowedTarget(settings.pilot, { email: a.recipient_email })) {
      await admin.from('maint_approvals').update({ status: 'suppressed', decision_note: 'test režim: adresa nie je povolená' }).eq('id', a.id)
      await admin.from('maint_cases').update({ status: 'comparing', approval_id: null }).eq('id', c.id).eq('status', 'awaiting_approval')
      await logEvent(admin, c.id, 'email_suppressed', { approval_id: a.id, reason: 'test_mode' }, 'system')
      return { note: 'test režim: e-mail neodišiel (adresa nie je povolená)' }
    }
    const r = await sendMail({ to: a.recipient_email, subject: mail.subject, html: mail.html, text: mail.text, tag: 'maint-approval' })
    if (!r.ok) { await logEvent(admin, c.id, 'email_failed', { approval_id: a.id, error: r.error }, 'system'); throw new Error(r.error) }
    await admin.from('maint_approvals').update({ status: 'sent', sent_at: iso(), email_id: r.id }).eq('id', a.id)
    await logEvent(admin, c.id, 'email_sent', { approval_id: a.id, email_id: r.id }, 'system')
    const plan = reminderPlan(iso(), settings.reminders)
    if (plan.nextReminderAt) await enqueue(admin, 'owner_reminder', { approval_id: a.id, url: p.url, n: 1 }, { runAfter: plan.nextReminderAt, dedupeKey: `reminder:${a.id}:1` })
    await enqueue(admin, 'owner_escalate', { approval_id: a.id }, { runAfter: plan.escalateAt, dedupeKey: `escalate:${a.id}` })
    return null
  }
  if (job.kind === 'owner_reminder') {
    const { data: a } = await admin.from('maint_approvals').select('*, maint_cases(ref,listing_name,listing_id,id)').eq('id', p.approval_id).maybeSingle()
    if (!a || !['sent', 'delivered'].includes(a.status)) return { note: 'rozhodnuté alebo neplatné' }
    const mail = reminderEmail({ ref: a.maint_cases.ref, listingName: a.maint_cases.listing_name || a.maint_cases.listing_id, url: p.url, n: p.n || 1 })
    if (!allowedTarget(settings.pilot, { email: a.recipient_email })) return { note: 'test režim' }
    const r = await sendMail({ to: a.recipient_email, ...mail, tag: 'maint-reminder' }); if (!r.ok) throw new Error(r.error)
    await admin.from('maint_approvals').update({ reminder_count: (a.reminder_count || 0) + 1 }).eq('id', a.id)
    await logEvent(admin, a.maint_cases.id, 'reminder_sent', { approval_id: a.id, n: p.n }, 'system')
    const hours = settings.reminders.owner_reminder_hours || [4, 24]
    if ((p.n || 1) < hours.length) await enqueue(admin, 'owner_reminder', { approval_id: a.id, url: p.url, n: (p.n || 1) + 1 }, { runAfter: iso(Date.parse(a.sent_at) + hours[p.n || 1] * 3600e3), dedupeKey: `reminder:${a.id}:${(p.n || 1) + 1}` })
    return null
  }
  if (job.kind === 'owner_escalate') {
    const { data: a } = await admin.from('maint_approvals').select('*, maint_cases(*)').eq('id', p.approval_id).maybeSingle()
    if (!a || !['sent', 'delivered'].includes(a.status)) return { note: 'rozhodnuté alebo neplatné' }
    await admin.from('maint_approvals').update({ status: 'no_response' }).eq('id', a.id)
    await admin.from('maint_cases').update({ status: 'no_response', updated_at: iso() }).eq('id', a.maint_cases.id).eq('status', 'awaiting_approval')
    await notifyDuty(admin, a.maint_cases, `Majiteľ neodpovedal: ${a.maint_cases.ref}`, 'Súhlas bez odpovede po termíne. Mlčanie nie je súhlas; rozhodni ďalší postup.')
    await logEvent(admin, a.maint_cases.id, 'owner_no_response', { approval_id: a.id }, 'system')
    return null
  }
  if (job.kind === 'send_vendor_email') {
    const { data: r } = await admin.from('maint_requests').select('*, maint_cases(*), maint_vendors(*)').eq('id', p.request_id).maybeSingle()
    if (!r || r.status !== 'sent') return { note: 'dopyt už nie je nový' }
    const v = r.maint_vendors, c = r.maint_cases
    if (!v.email) { await admin.from('maint_requests').update({ channel: 'manual' }).eq('id', r.id); return { note: 'dodávateľ bez e-mailu, odkaz zdieľaj ručne' } }
    if (!allowedTarget(settings.pilot, { email: v.email })) { await logEvent(admin, c.id, 'email_suppressed', { request_id: r.id, reason: 'test_mode' }, 'system'); return { note: 'test režim: e-mail dodávateľovi neodišiel' } }
    const mail = vendorRequestEmail({ ref: c.ref, tag: requestTag(c.ref, r.id), listingName: c.listing_name || c.listing_id, locality: v.locality, category: c.category, symptoms: c.symptoms, severity: c.severity, url: p.url, expiresAt: new Date(r.expires_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' }) })
    const m = await sendMail({ to: v.email, ...mail, tag: 'maint-request' }); if (!m.ok) throw new Error(m.error)
    await admin.from('maint_requests').update({ channel: 'email' }).eq('id', r.id)
    await logEvent(admin, c.id, 'request_emailed', { request_id: r.id }, 'system')
    return null
  }
  if (job.kind === 'vendor_backup_check') {
    const { data: reqs } = await admin.from('maint_requests').select('*, maint_vendors(backup_of,id,name)').eq('case_id', p.case_id)
    const { data: c } = await admin.from('maint_cases').select('*').eq('id', p.case_id).maybeSingle()
    if (!c || !['quoting'].includes(c.status)) return { note: 'prípad už nečaká na ponuky' }
    const unanswered = (reqs || []).filter((r) => ['sent', 'viewed'].includes(r.status) && Date.parse(r.expires_at) > Date.now())
    if (!unanswered.length || (reqs || []).some((r) => r.status === 'offered')) return { note: 'ponuka prišla alebo nie je čo zálohovať' }
    await notifyDuty(admin, c, `Dodávateľ neodpovedal: ${c.ref}`, 'Po lehote bez ponuky. Oslov záložného dodávateľa z detailu prípadu.')
    await logEvent(admin, c.id, 'vendor_no_response', { requests: unanswered.map((r) => r.id) }, 'system')
    return null
  }
  if (job.kind === 'place_call') {
    const { data: call } = await admin.from('maint_calls').select('*, maint_cases(*)').eq('id', p.call_id).maybeSingle()
    if (!call || call.status !== 'scheduled') return { note: 'hovor nie je naplánovaný' }
    // pred vytočením znovu over aktuálnosť ponuky a stav rozhodnutia
    const { data: a } = await admin.from('maint_approvals').select('*, maint_quotes(*)').eq('id', call.approval_id).maybeSingle()
    if (!a || !['sent', 'delivered'].includes(a.status) || !approvalMatches(a, a.maint_quotes)) { await admin.from('maint_calls').update({ status: 'cancelled', result: 'ponuka alebo rozhodnutie sa zmenili' }).eq('id', call.id); return { note: 'hovor zrušený: zmena ponuky alebo rozhodnutia' } }
    if (!allowedTarget(settings.pilot, { phone: call.to_phone })) { await admin.from('maint_calls').update({ status: 'cancelled', result: 'test režim: číslo nie je povolené' }).eq('id', call.id); return { note: 'test režim' } }
    const name = providerName(settings.telephony), prov = providerFor(name)
    if (!prov.ready()) { await admin.from('maint_calls').update({ status: 'failed', result: `poskytovateľ ${name} nie je nakonfigurovaný` }).eq('id', call.id); return { note: 'poskytovateľ nie je nakonfigurovaný' } }
    const r = await prov.placeCall({ to: call.to_phone, call, context: { ref: call.maint_cases.ref, appUrl: appUrl() } })
    if (!r.ok) {
      const retry = settings.reminders.call_retry || {}
      const attempts = call.attempts + 1
      await admin.from('maint_calls').update({ attempts, status: attempts >= (retry.max_attempts || 3) ? 'failed' : 'scheduled', result: r.error }).eq('id', call.id)
      await logEvent(admin, call.case_id, 'call_failed', { call_id: call.id, error: r.error, attempts }, 'system')
      if (attempts < (retry.max_attempts || 3)) return { retryAt: iso(Date.now() + ((retry.spacing_minutes || [60, 240])[attempts - 1] || 240) * 60e3), note: r.error }
      await notifyDuty(admin, call.maint_cases, `Hovor zlyhal: ${call.maint_cases.ref}`, r.error)
      return { note: r.error }
    }
    await admin.from('maint_calls').update({ attempts: call.attempts + 1, status: r.status || 'dialing', provider_call_id: r.providerCallId, started_at: iso(), result: r.note || null }).eq('id', call.id)
    await logEvent(admin, call.case_id, 'call_placed', { call_id: call.id, provider: name, simulated: name === 'test' }, 'system')
    if (name === 'test') await admin.from('maint_calls').update({ status: 'completed', ended_at: iso(), result: 'simulované (test provider)' }).eq('id', call.id)
    return null
  }
  if (job.kind === 'asana_sync') {
    if (!asanaReady()) return { note: 'Asana nie je nakonfigurovaná' }
    const { data: c } = await admin.from('maint_cases').select('*').eq('id', p.case_id).maybeSingle()
    if (!c) return { note: 'prípad neexistuje' }
    const gid = await syncCaseTask(c, { statusLabel: STATUSES[c.status] || c.status, url: `${appUrl()}/udrzba/${c.id}` })
    if (gid && gid !== c.asana_gid) await admin.from('maint_cases').update({ asana_gid: gid }).eq('id', c.id)
    return null
  }
  return { note: 'neznámy job' }
}

/** Zosúladenie stavu hovoru s poskytovateľom (webhook). Idempotentné cez maint_inbound_events. */
export async function ingestCallWebhook(providerKey, req, raw) {
  const admin = await adminClientAsync()
  const prov = providerFor(providerKey)
  const parsed = await prov.parseWebhook(req, raw)
  if (!parsed.ok) { await admin.from('maint_inbound_events').insert({ source: providerKey, external_id: 'bad-' + Date.now(), signature_ok: false, status: 'rejected', error: parsed.error, payload: {} }); return { ok: false, error: parsed.error } }
  const { error } = await admin.from('maint_inbound_events').insert({ source: providerKey, external_id: parsed.externalId, signature_ok: true, payload: parsed.payload, status: 'received' })
  if (error) return { ok: true, duplicate: true }
  const { data: call } = await admin.from('maint_calls').select('*').eq('provider_call_id', parsed.providerCallId).maybeSingle()
  if (call) {
    const upd = { status: parsed.status, updated_at: iso() }
    if (['answered'].includes(parsed.status)) upd.started_at = call.started_at || iso()
    if (['completed', 'failed', 'busy', 'no_answer', 'voicemail', 'cancelled'].includes(parsed.status)) upd.ended_at = iso()
    await admin.from('maint_calls').update(upd).eq('id', call.id)
    await logEvent(admin, call.case_id, 'call_status', { call_id: call.id, status: parsed.status }, 'provider', `callwh:${parsed.externalId}`)
    if (['no_answer', 'busy', 'voicemail', 'failed'].includes(parsed.status)) {
      const settings = await getSettings(admin), retry = settings.reminders.call_retry || {}
      if (call.attempts < (retry.max_attempts || 3)) { await admin.from('maint_calls').update({ status: 'scheduled' }).eq('id', call.id); await enqueue(admin, 'place_call', { call_id: call.id, approval_id: call.approval_id, case_id: call.case_id }, { runAfter: iso(Date.now() + ((retry.spacing_minutes || [60, 240])[call.attempts - 1] || 240) * 60e3), dedupeKey: `call:${call.id}:retry${call.attempts}` }) }
    }
  }
  await admin.from('maint_inbound_events').update({ status: 'processed', processed_at: iso() }).eq('source', providerKey).eq('external_id', parsed.externalId)
  return { ok: true }
}

/** Kontrola stavu pre /api/maint/health (bez tajomstiev). */
export async function healthReport() {
  const admin = await adminClientAsync()
  const settings = await getSettings(admin)
  const { count: queued } = await admin.from('maint_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued')
  const { count: failed } = await admin.from('maint_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed')
  const { count: open } = await admin.from('maint_cases').select('id', { count: 'exact', head: true }).not('status', 'in', '("closed","cancelled","duplicate")')
  const tel = providerName(settings.telephony)
  return { ok: true, pilot: { enabled: !!settings.pilot.enabled, test_mode: settings.pilot.test_mode !== false, allowed_emails: (settings.pilot.allowed_emails || []).length, allowed_phones: (settings.pilot.allowed_phones || []).length }, mail: !!process.env.RESEND_API_KEY, inbound_mail_secret: !!process.env.RESEND_WEBHOOK_SECRET, asana: asanaReady(), telephony: { provider: tel, ready: providerReady(tel) }, jobs: { queued: queued || 0, failed: failed || 0 }, open_cases: open || 0 }
}

/** Objednávka po schválení pravidlom (v limite) alebo po súhlase majiteľa, ak sa ešte nevytvorila. Jedna na prípad (čiastočný unikátny index). */
export async function createOrder(s, who, caseId) {
  const { data: c } = await s.from('maint_cases').select('*').eq('id', caseId).maybeSingle()
  if (!c) return { ok: false, error: 'Prípad neexistuje.' }
  if (c.status !== 'approved' || !c.selected_quote_id) return { ok: false, error: 'Objednať sa dá až po schválení vybranej ponuky.' }
  const { data: q } = await s.from('maint_quotes').select('id,vendor_id,version,total').eq('id', c.selected_quote_id).maybeSingle()
  if (!q) return { ok: false, error: 'Vybraná ponuka neexistuje.' }
  let authorized_by = who.email
  if (c.approval_id) { const { data: a } = await s.from('maint_approvals').select('status,recipient_email,quote_id,quote_version').eq('id', c.approval_id).maybeSingle(); if (!a || a.status !== 'approved' || !approvalMatches(a, q)) return { ok: false, error: 'Súhlas majiteľa neplatí pre túto verziu ponuky.' }; authorized_by = a.recipient_email }
  const { data: o, error } = await s.from('maint_orders').insert({ case_id: caseId, approval_id: c.approval_id || null, quote_id: q.id, vendor_id: q.vendor_id, authorized_by, status: 'created', created_by: who.email }).select('id').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Objednávka už existuje.' : error.message }
  await s.from('maint_cases').update({ status: 'ordered', order_id: o.id, updated_at: iso() }).eq('id', caseId)
  const settings = await getSettings(s)
  await logEvent(s, caseId, 'order_created', { order_id: o.id, by: c.approval_id ? 'owner_approval' : 'limit_rule', pilot_enabled: !!settings.pilot.enabled }, who.email, `order:case:${caseId}`)
  await enqueue(s, 'asana_sync', { case_id: caseId }, { dedupeKey: `asana:${caseId}:ordered` })
  return { ok: true, order_id: o.id }
}
/** Ponuka z e-mailu (návrh po AI extrakcii) sa po kontrole tímom stane platnou ponukou. */
export async function confirmDraftQuote(s, who, quoteId, patch = {}) {
  const { data: q } = await s.from('maint_quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!q || !q.draft) return { ok: false, error: 'Ponuka nie je návrh.' }
  const upd = { draft: false, vat_mode: patch.vat_mode || q.vat_mode, callout: Number(patch.callout ?? q.callout) || 0, diagnostics: Number(patch.diagnostics ?? q.diagnostics) || 0, material: Number(patch.material ?? q.material) || 0, items: Array.isArray(patch.items) ? patch.items : q.items, eta: patch.eta || q.eta, source: 'ai_draft' }
  upd.total = Number(patch.total) || quoteTotal(upd).total || q.total
  const { error } = await s.from('maint_quotes').update(upd).eq('id', quoteId)
  if (error) return { ok: false, error: error.message }
  await logEvent(s, q.case_id, 'quote_confirmed', { quote_id: quoteId, total: upd.total }, who.email)
  return { ok: true }
}
