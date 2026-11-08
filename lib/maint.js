// Údržba (pilot): čistá logika bez Supabase a Reactu, aby sa dala otestovať.
// Triáž, profesie, termíny, stavy prípadu, verzie ponúk a súhlasu, tokeny, metriky hovorov, čítanie ponuky z e-mailu.

export const CATEGORIES = [
  { id: 'kurenie', label: 'Kúrenie / teplá voda', profession: 'kúrenár', clear: true },
  { id: 'plyn', label: 'Plyn (zápach, kotol)', profession: 'plynár', clear: true, emergency: true },
  { id: 'voda', label: 'Voda / odpad (únik, upchatie)', profession: 'inštalatér', clear: false },
  { id: 'elektrina', label: 'Elektrina', profession: 'elektrikár', clear: false },
  { id: 'spotrebic', label: 'Spotrebič (práčka, chladnička, rúra)', profession: 'servis spotrebičov', clear: true },
  { id: 'klima', label: 'Klimatizácia', profession: 'klimatizácie', clear: true },
  { id: 'zamok', label: 'Zámok / vstup / kľúče', profession: 'zámočník', clear: false },
  { id: 'internet', label: 'Internet / TV', profession: 'IT a siete', clear: false },
  { id: 'nabytok', label: 'Nábytok / dvere / okná', profession: 'stolár', clear: false },
  { id: 'cistota', label: 'Čistota / škodcovia', profession: 'deratizácia', clear: false },
  { id: 'ine', label: 'Iné', profession: '', clear: false },
]
export const SEVERITIES = {
  emergency: { label: 'Havária', hours: 2, role: 'duty', order: 0 },
  affects_stay: { label: 'Porucha ovplyvňujúca pobyt', hours: 24, role: 'internal_tech', order: 1 },
  routine: { label: 'Bežná oprava', hours: 72, role: 'internal_tech', order: 2 },
  cosmetic: { label: 'Kozmetika', hours: 24 * 14, role: 'internal_tech', order: 3 },
}
export const ROLES = { duty: 'Služba (pohotovosť)', internal_tech: 'Interný údržbár', specialist: 'Externý špecialista', cs: 'Zákaznícky servis' }
export const STATUSES = {
  new: 'Nové', triage: 'Triáž', internal: 'Rieši interný údržbár', quoting: 'Čaká na ponuky', comparing: 'Porovnanie ponúk',
  awaiting_approval: 'Čaká na súhlas majiteľa', approved: 'Schválené', declined: 'Majiteľ odmietol', question: 'Majiteľ má otázku', no_response: 'Majiteľ neodpovedal',
  ordered: 'Objednané', in_progress: 'Prebieha oprava', done: 'Opravené', closed: 'Uzavreté', cancelled: 'Zrušené', duplicate: 'Duplikát',
}
export const OPEN_STATUSES = ['new', 'triage', 'internal', 'quoting', 'comparing', 'awaiting_approval', 'approved', 'question', 'no_response', 'ordered', 'in_progress', 'declined']

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1]

/**
 * Triáž: havária (plyn, únik vody s dopadom, výpadok elektriny / kúrenia pri hosťovi v byte), porucha ovplyvňujúca pobyt
 * (hosť na mieste alebo blokujúci dopad), bežná oprava, kozmetika. Urgentná výnimka ide službe ihneď.
 */
export function triage({ category, guest_impact = 'none', guest_present = false, urgent = false, cosmetic = false }) {
  const cat = categoryOf(category)
  let severity
  if (urgent || cat.emergency || (guest_impact === 'blocking' && guest_present && ['voda', 'elektrina', 'kurenie', 'zamok'].includes(cat.id))) severity = 'emergency'
  else if (guest_impact === 'blocking' || (guest_present && guest_impact === 'limited')) severity = 'affects_stay'
  else if (cosmetic || (guest_impact === 'none' && cat.id === 'nabytok')) severity = 'cosmetic'
  else severity = 'routine'
  const sv = SEVERITIES[severity]
  // jasne odborná porucha ide rovno profesii; nejasná alebo bežná dáva internému údržbárovi voľbu Preberám / Treba špecialistu
  const direct = cat.clear && severity !== 'cosmetic'
  return { severity, hours: sv.hours, role: severity === 'emergency' ? 'duty' : direct ? 'specialist' : 'internal_tech', profession: cat.profession, direct, label: sv.label }
}
export const dueAt = (hours, from = Date.now()) => new Date(from + hours * 3600e3).toISOString()

/** Povolené prechody stavov; všetko ostatné je chyba (ochrana pred dvojklikom a starými odkazmi). */
const TRANSITIONS = {
  new: ['triage', 'internal', 'quoting', 'duplicate', 'cancelled'],
  triage: ['internal', 'quoting', 'duplicate', 'cancelled'],
  internal: ['quoting', 'done', 'cancelled', 'awaiting_approval', 'approved'],
  quoting: ['comparing', 'cancelled', 'internal'],
  comparing: ['awaiting_approval', 'approved', 'quoting', 'cancelled'],
  awaiting_approval: ['approved', 'declined', 'question', 'no_response', 'comparing', 'cancelled'],
  question: ['awaiting_approval', 'approved', 'declined', 'comparing', 'cancelled'],
  no_response: ['awaiting_approval', 'approved', 'declined', 'cancelled'],
  declined: ['comparing', 'cancelled', 'closed'],
  approved: ['ordered', 'cancelled'],
  ordered: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['closed', 'in_progress'],
  closed: [], cancelled: [], duplicate: [],
}
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to)

/** Potrebuje ponuka súhlas majiteľa? Limit podľa závažnosti (havarijný limit pri havárii). Bez schvaľovateľa → eskalácia službe. */
export function approvalNeed({ total, severity, settings }) {
  const s = settings || {}
  const limit = Number(severity === 'emergency' ? s.emergency_limit : s.routine_limit) || 0
  const amount = Number(total) || 0
  if (amount <= limit) return { needed: false, reason: 'within_limit', limit }
  if (!s.approver_email) return { needed: true, blocked: true, reason: 'no_approver', limit }
  return { needed: true, blocked: false, reason: 'over_limit', limit }
}

/** Nová verzia ponuky zneplatní súhlas k starej verzii: platný je len súhlas k (quote_id, version) a sume. */
export function approvalMatches(approval, quote) {
  if (!approval || !quote) return false
  return approval.quote_id === quote.id && Number(approval.quote_version) === Number(quote.version) && Number(approval.quote_total) === Number(quote.total)
}

/** Rozhodnutie majiteľa: len výslovný POST s platným tokenom, nerozhodnutým súhlasom a aktuálnou verziou. Vráti { ok, status } alebo { ok:false, error }. */
export function decide({ approval, quote, action, now = Date.now() }) {
  if (!approval) return { ok: false, error: 'invalid_token' }
  if (!['approved', 'declined', 'question'].includes(action)) return { ok: false, error: 'bad_action' }
  if (['approved', 'declined'].includes(approval.status)) return { ok: false, error: 'already_decided', status: approval.status }
  if (approval.status === 'invalidated') return { ok: false, error: 'superseded' }
  if (!['sent', 'delivered', 'question', 'pending', 'no_response'].includes(approval.status)) return { ok: false, error: 'not_open', status: approval.status }
  if (approval.expires_at && Date.parse(approval.expires_at) < now) return { ok: false, error: 'expired' }
  if (!approvalMatches(approval, quote)) return { ok: false, error: 'superseded' }
  return { ok: true, status: action }
}

/** Mlčanie nie je súhlas: pripomienky a eskalácia podľa nastavenia. */
export function reminderPlan(sentAt, cfg = {}, now = Date.now()) {
  const hours = cfg.owner_reminder_hours || [4, 24], esc = cfg.owner_escalate_hours || 48
  const t = Date.parse(sentAt)
  const remind = hours.map((h) => t + h * 3600e3).filter((x) => x > now)
  return { nextReminderAt: remind.length ? new Date(remind[0]).toISOString() : null, escalateAt: new Date(t + esc * 3600e3).toISOString(), escalated: now >= t + esc * 3600e3 }
}

/** Súčet ponuky: položky + výjazd + diagnostika + materiál. Pri „s DPH“ sa DPH nepripočítava (sumy sú konečné), pri „bez DPH“ zobrazíme aj odhad s 23 %. */
export function quoteTotal(q) {
  const items = Array.isArray(q.items) ? q.items : []
  const sum = items.reduce((a, it) => a + (Number(it.qty) || 1) * (Number(it.price) || 0), 0)
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100
  const total = r2(sum + (Number(q.callout) || 0) + (Number(q.diagnostics) || 0) + (Number(q.material) || 0))
  const cents = Math.round(total * 100)
  return { total, withVat: q.vat_mode === 'without_vat' ? Math.round(cents * 1.23) / 100 : total }
}

/** Ponuky na porovnanie: zoradené podľa ceny, s príznakom výmeny a neopraviteľnosti. */
export function compareQuotes(quotes) {
  return [...(quotes || [])].filter((q) => q.status !== 'superseded' && q.status !== 'rejected').sort((a, b) => (Number(a.total) || 0) - (Number(b.total) || 0))
}

/** Konfigurovateľný poplatok za dokončenú bežnú opravu (návrh 45 € do 60 minút, materiál zvlášť). Bez schválených podmienok sa neúčtuje. */
export function feeFor({ severity, minutes, fee }) {
  const f = fee || {}
  if (!f.enabled || !f.terms_approved) return { amount: 0, reason: f.terms_approved ? 'disabled' : 'terms_not_approved' }
  if (severity !== 'routine' && severity !== 'cosmetic') return { amount: 0, reason: 'not_routine' }
  if (Number(minutes) > Number(f.max_minutes || 60)) return { amount: 0, reason: 'over_max_minutes' }
  return { amount: Number(f.amount_eur) || 0, reason: 'ok' }
}

/** Finančné uzavretie blokuje chýbajúci doklad k materiálu alebo duplicitný doklad. */
export function financeBlockers(workLog) {
  const out = []
  const receipts = new Set()
  for (const w of workLog || []) {
    if (w.entry_type === 'material' && !w.receipt) out.push('Chýba doklad k materiálu: ' + (w.description || ''))
    if (w.entry_type === 'receipt' && w.receipt && w.receipt.number) {
      if (receipts.has(w.receipt.number)) out.push('Duplicitný doklad č. ' + w.receipt.number)
      receipts.add(w.receipt.number)
    }
  }
  return out
}

/** Testovací režim: správy a hovory len na povolené interné adresy a čísla. */
export function allowedTarget(pilot, { email, phone } = {}) {
  const p = pilot || {}
  if (p.enabled && !p.test_mode) return true
  if (email) return (p.allowed_emails || []).map((e) => String(e).toLowerCase()).includes(String(email).toLowerCase())
  if (phone) return (p.allowed_phones || []).map(normPhone).includes(normPhone(phone))
  return false
}
export function normPhone(p) { const d = String(p || '').replace(/[^\d+]/g, ''); return d.startsWith('00') ? '+' + d.slice(2) : d }

/** Identifikácia dopytu v e-maile: [U-26-0001#R<id-prefix>] v predmete alebo tele. */
export const requestTag = (ref, requestId) => `[${ref}#R${String(requestId).slice(0, 8)}]`
export function parseRequestTag(text) { const m = /\[(U-\d{2}-\d{4})#R([0-9a-f]{8})\]/i.exec(String(text || '')); return m ? { ref: m[1].toUpperCase(), requestPrefix: m[2].toLowerCase() } : null }

/** Hrubé čítanie ponuky z textu e-mailu bez AI: sumy, termín. AI extrakcia je vždy len návrh (draft) na kontrolu. */
export function extractQuoteFromText(text) {
  const t = String(text || '')
  const money = [...t.matchAll(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur)/gi)].map((m) => Number(m[1].replace(',', '.')))
  const total = money.length ? Math.max(...money) : null
  const vat = /bez\s*dph/i.test(t) ? 'without_vat' : /s\s*dph|vr[áa]tane\s*dph/i.test(t) ? 'with_vat' : /neplatca|nie som platca/i.test(t) ? 'not_vat_payer' : null
  const eta = (/(zajtra|pozajtra|do \d+ (?:dní|dni|hodín|hod)|v (?:pondelok|utorok|stredu|štvrtok|piatok|sobotu|nedeľu)|\d{1,2}\.\s?\d{1,2}\.)/i.exec(t) || [])[0] || null
  const declined = /nem[oô]žem|nestíham|neberiem|odmietam/i.test(t)
  const confidence = total ? (vat ? 0.6 : 0.4) : 0.1
  return { total, vat_mode: vat, eta, declined, confidence, draft: true }
}

/** Overenie Svix podpisu (Resend webhooky): v1,<base64 hmac-sha256(secret, `${id}.${ts}.${body}`)>. */
export async function svixVerify({ secret, id, timestamp, signature, body, now = Date.now(), tolerance = 300 }) {
  if (!secret || !id || !timestamp || !signature) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > tolerance) return false
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const key = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return String(signature).split(' ').some((s) => s.split(',')[1] === expected)
}

/** Metriky prichádzajúcich hovorov podľa zadania. Jeden call_id na hovor; vyriešené = len potvrdené. */
export function callMetrics(sessions, events) {
  const byCall = new Map()
  for (const s of sessions || []) byCall.set(s.call_id, { ...s, events: new Set() })
  for (const e of events || []) { const c = byCall.get(e.call_id); if (c) c.events.add(e.event) }
  const all = [...byCall.values()].filter((c) => c.events.has('ai_started') || c.direction === 'inbound')
  const n = all.length
  const resolved = all.filter((c) => c.events.has('resolved_confirmed') || c.outcome === 'resolved_ai').length
  const transferReq = all.filter((c) => c.events.has('transfer_requested')).length
  const transferOk = all.filter((c) => c.events.has('transfer_connected')).length
  const transferFail = all.filter((c) => c.events.has('transfer_failed')).length
  const cases = all.filter((c) => c.events.has('case_created')).length
  const unresolved = all.filter((c) => c.events.has('ended_unresolved')).length
  const errors = all.filter((c) => c.events.has('tech_error')).length
  const unknown = all.filter((c) => !c.events.has('resolved_confirmed') && !c.events.has('transfer_connected') && !c.events.has('transfer_failed') && !c.events.has('ended_unresolved') && !c.events.has('tech_error') && !c.events.has('case_created')).length
  const callers = new Set(all.map((c) => c.caller_hash).filter(Boolean)).size
  const repeats = all.filter((c) => c.repeat_of).length
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
  return { calls: n, resolved, transferRequested: transferReq, transferConnected: transferOk, transferFailed: transferFail, casesCreated: cases, unresolved, errors, unknown, uniqueCallers: callers, repeats,
    successPct: pct(resolved, n), transferPctOfAll: pct(transferOk, n), transferSuccessPct: pct(transferOk, transferReq) }
}

/** Nájde opakovaný kontakt k rovnakej téme do 24 h od rovnakého overeného volajúceho. */
export function findRepeat(session, previous) {
  if (!session.caller_hash || !session.topic) return null
  const t = Date.parse(session.started_at)
  const prev = (previous || []).filter((p) => p.call_id !== session.call_id && p.caller_hash === session.caller_hash && p.topic === session.topic && t - Date.parse(p.started_at) <= 24 * 3600e3 && t - Date.parse(p.started_at) > 0)
  return prev.length ? prev.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0].call_id : null
}

/** Náhodný token (URL-safe) a jeho hash na uloženie; do DB ide len hash. */
export function randomToken(bytes = 24) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
export async function hashToken(token) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token))); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') }
/** Roly s prístupom do údržby (rovnaké ako maint_team() v databáze, bez bota). */
export const MAINT_ROLES = ['admin', 'operations', 'customer_service', 'assistant']
export const canMaint = (me) => !!(me && (me.roles || []).some((r) => MAINT_ROLES.includes(r)))
