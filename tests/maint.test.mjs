import test from 'node:test'
import assert from 'node:assert/strict'
import { triage, canTransition, approvalNeed, approvalMatches, decide, reminderPlan, quoteTotal, compareQuotes, feeFor, financeBlockers, allowedTarget, requestTag, parseRequestTag, extractQuoteFromText, svixVerify, callMetrics, findRepeat, randomToken, hashToken } from '../lib/maint.js'

test('triáž: havária, porucha pri hosťovi, bežná, kozmetika, urgentná výnimka', () => {
  assert.equal(triage({ category: 'plyn' }).severity, 'emergency')
  assert.equal(triage({ category: 'voda', guest_impact: 'blocking', guest_present: true }).severity, 'emergency')
  assert.equal(triage({ category: 'spotrebic', guest_impact: 'blocking' }).severity, 'affects_stay')
  assert.equal(triage({ category: 'nabytok' }).severity, 'cosmetic')
  assert.equal(triage({ category: 'elektrina', guest_impact: 'limited' }).severity, 'routine')
  const u = triage({ category: 'ine', urgent: true }); assert.equal(u.severity, 'emergency'); assert.equal(u.role, 'duty')
  // jasne odborná porucha ide rovno profesii, nejasná dáva internému údržbárovi voľbu
  assert.equal(triage({ category: 'klima', guest_impact: 'limited' }).role, 'specialist')
  assert.equal(triage({ category: 'zamok', guest_impact: 'limited' }).role, 'internal_tech')
})
test('stavy: dvojklik a nepovolené prechody sú zamietnuté', () => {
  assert.ok(canTransition('new', 'quoting')); assert.ok(canTransition('awaiting_approval', 'approved')); assert.ok(canTransition('approved', 'ordered'))
  assert.ok(!canTransition('approved', 'approved')); assert.ok(!canTransition('closed', 'in_progress')); assert.ok(!canTransition('ordered', 'awaiting_approval'))
})
test('súhlas: v limite bez majiteľa, nad limitom e-mail, bez schvaľovateľa eskalácia', () => {
  const st = { routine_limit: 100, emergency_limit: 300, approver_email: 'o@x.sk' }
  assert.equal(approvalNeed({ total: 80, severity: 'routine', settings: st }).needed, false)
  assert.equal(approvalNeed({ total: 180, severity: 'routine', settings: st }).needed, true)
  assert.equal(approvalNeed({ total: 180, severity: 'emergency', settings: st }).needed, false)
  const b = approvalNeed({ total: 180, severity: 'routine', settings: { routine_limit: 100 } }); assert.equal(b.blocked, true); assert.equal(b.reason, 'no_approver')
})
test('zmena ceny alebo rozsahu zneplatní starý súhlas; rozhoduje len výslovný POST, raz', () => {
  const q1 = { id: 'q', version: 1, total: 150 }, q2 = { id: 'q', version: 2, total: 190 }
  const a = { quote_id: 'q', quote_version: 1, quote_total: 150, status: 'sent', expires_at: new Date(Date.now() + 864e5).toISOString() }
  assert.ok(approvalMatches(a, q1)); assert.ok(!approvalMatches(a, q2))
  assert.deepEqual(decide({ approval: a, quote: q1, action: 'approved' }), { ok: true, status: 'approved' })
  assert.equal(decide({ approval: a, quote: q2, action: 'approved' }).error, 'superseded')
  assert.equal(decide({ approval: { ...a, status: 'approved' }, quote: q1, action: 'declined' }).error, 'already_decided')
  assert.equal(decide({ approval: { ...a, expires_at: new Date(Date.now() - 1000).toISOString() }, quote: q1, action: 'approved' }).error, 'expired')
  assert.equal(decide({ approval: null, quote: q1, action: 'approved' }).error, 'invalid_token')
  assert.equal(decide({ approval: a, quote: q1, action: 'get' }).error, 'bad_action')
})
test('mlčanie nie je súhlas: pripomienky a eskalácia', () => {
  const sent = new Date(Date.now() - 5 * 3600e3).toISOString()
  const p = reminderPlan(sent, { owner_reminder_hours: [4, 24], owner_escalate_hours: 48 })
  assert.ok(p.nextReminderAt && Date.parse(p.nextReminderAt) > Date.now()); assert.equal(p.escalated, false)
  assert.equal(reminderPlan(new Date(Date.now() - 49 * 3600e3).toISOString(), {}).escalated, true)
})
test('ponuka: súčet, DPH, porovnanie, výmena', () => {
  const t = quoteTotal({ items: [{ qty: 2, price: 30 }, { price: 15.5 }], callout: 20, diagnostics: 0, material: 10, vat_mode: 'without_vat' })
  assert.equal(t.total, 105.5); assert.equal(t.withVat, 129.77)
  const cmp = compareQuotes([{ total: 300, status: 'submitted' }, { total: 120, status: 'submitted' }, { total: 50, status: 'superseded' }])
  assert.deepEqual(cmp.map((q) => q.total), [120, 300])
})
test('poplatok 45 € len so schválenými podmienkami a do 60 minút', () => {
  const fee = { enabled: true, amount_eur: 45, max_minutes: 60, terms_approved: true }
  assert.equal(feeFor({ severity: 'routine', minutes: 50, fee }).amount, 45)
  assert.equal(feeFor({ severity: 'routine', minutes: 75, fee }).amount, 0)
  assert.equal(feeFor({ severity: 'emergency', minutes: 30, fee }).amount, 0)
  assert.equal(feeFor({ severity: 'routine', minutes: 30, fee: { ...fee, terms_approved: false } }).reason, 'terms_not_approved')
})
test('finančné uzavretie blokuje chýbajúci a duplicitný doklad', () => {
  const b = financeBlockers([{ entry_type: 'material', description: 'ventil' }, { entry_type: 'receipt', receipt: { number: 'F1' } }, { entry_type: 'receipt', receipt: { number: 'F1' } }])
  assert.equal(b.length, 2)
  assert.equal(financeBlockers([{ entry_type: 'material', description: 'x', receipt: { number: 'F2' } }]).length, 0)
})
test('testovací režim: len povolené adresy a čísla', () => {
  const p = { enabled: false, test_mode: true, allowed_emails: ['test@live-in.international'], allowed_phones: ['+421 940 213 613'] }
  assert.ok(allowedTarget(p, { email: 'TEST@live-in.international' })); assert.ok(!allowedTarget(p, { email: 'majitel@gmail.com' }))
  assert.ok(allowedTarget(p, { phone: '00421940213613' })); assert.ok(!allowedTarget(p, { phone: '+421900000000' }))
  assert.ok(allowedTarget({ enabled: true, test_mode: false }, { email: 'majitel@gmail.com' }))
})
test('e-mail: značka dopytu a hrubé čítanie ponuky (vždy len návrh)', () => {
  const tag = requestTag('U-26-0001', 'abcdef12-3456'); assert.equal(tag, '[U-26-0001#Rabcdef12]')
  assert.deepEqual(parseRequestTag('Re: Ponuka ' + tag), { ref: 'U-26-0001', requestPrefix: 'abcdef12' })
  const q = extractQuoteFromText('Dobrý deň, výjazd 30 €, práca 120 € bez DPH, spolu 150 €. Vieme prísť zajtra.')
  assert.equal(q.total, 150); assert.equal(q.vat_mode, 'without_vat'); assert.ok(q.eta); assert.equal(q.draft, true); assert.ok(q.confidence < 1)
  assert.equal(extractQuoteFromText('Prepáčte, nestíham.').declined, true)
})
test('svix podpis webhooku', async () => {
  const secret = 'whsec_' + btoa('tajny-kluc-123')
  const id = 'msg_1', ts = String(Math.floor(Date.now() / 1000)), body = '{"a":1}'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('tajny-kluc-123'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))))
  assert.ok(await svixVerify({ secret, id, timestamp: ts, signature: 'v1,' + sig, body }))
  assert.ok(!(await svixVerify({ secret, id, timestamp: ts, signature: 'v1,zle', body })))
  assert.ok(!(await svixVerify({ secret, id, timestamp: '1', signature: 'v1,' + sig, body })))
})
test('metriky hovorov: koniec bez potvrdenia nie je vyriešené, transfer vetvy raz, neznáme oddelene', () => {
  const sessions = [
    { call_id: 'c1', direction: 'inbound', caller_hash: 'h1', started_at: '2026-11-08T10:00:00Z', outcome: 'unknown' },
    { call_id: 'c2', direction: 'inbound', caller_hash: 'h2', started_at: '2026-11-08T10:05:00Z', outcome: 'unknown' },
    { call_id: 'c3', direction: 'inbound', caller_hash: 'h1', started_at: '2026-11-08T11:00:00Z', outcome: 'unknown', repeat_of: 'c1' },
    { call_id: 'c4', direction: 'inbound', caller_hash: null, started_at: '2026-11-08T12:00:00Z', outcome: 'unknown' },
  ]
  const events = [
    { call_id: 'c1', event: 'ai_started' }, { call_id: 'c1', event: 'resolved_confirmed' },
    { call_id: 'c2', event: 'ai_started' }, { call_id: 'c2', event: 'transfer_requested' }, { call_id: 'c2', event: 'transfer_requested' }, { call_id: 'c2', event: 'transfer_connected' },
    { call_id: 'c3', event: 'ai_started' }, { call_id: 'c3', event: 'answer' },
    { call_id: 'c4', event: 'ai_started' }, { call_id: 'c4', event: 'transfer_requested' }, { call_id: 'c4', event: 'transfer_failed' },
  ]
  const m = callMetrics(sessions, events)
  assert.equal(m.calls, 4); assert.equal(m.resolved, 1); assert.equal(m.transferRequested, 2); assert.equal(m.transferConnected, 1); assert.equal(m.transferFailed, 1)
  assert.equal(m.unknown, 1); assert.equal(m.uniqueCallers, 2); assert.equal(m.repeats, 1)
  assert.equal(m.successPct, 25); assert.equal(m.transferPctOfAll, 25); assert.equal(m.transferSuccessPct, 50)
  assert.equal(findRepeat(sessions[2], sessions.slice(0, 2).map((s) => ({ ...s, topic: 'kurenie' }))), null)
  assert.equal(findRepeat({ ...sessions[2], topic: 'kurenie' }, sessions.slice(0, 2).map((s) => ({ ...s, topic: 'kurenie' }))), 'c1')
})
test('tokeny: náhodné, do DB ide len hash', async () => {
  const t1 = randomToken(), t2 = randomToken(); assert.notEqual(t1, t2); assert.ok(/^[A-Za-z0-9_-]{20,}$/.test(t1))
  const h = await hashToken(t1); assert.equal(h.length, 64); assert.equal(h, await hashToken(t1)); assert.notEqual(h, await hashToken(t2))
})

test('starý odkaz, replay webhooku a opakovaný kontakt', async () => {
  // súhlas „bez odpovede“ sa ešte dá rozhodnúť (mlčanie nie je súhlas, ale neskorá odpoveď platí, kým ponuka a odkaz platia)
  const q = { id: 'q', version: 1, total: 150 }
  const a = { quote_id: 'q', quote_version: 1, quote_total: 150, status: 'no_response', expires_at: new Date(Date.now() + 864e5).toISOString() }
  assert.equal(decide({ approval: a, quote: q, action: 'declined' }).status, 'declined')
  // replay webhooku so starou časovou pečiatkou neprejde ani so správnym podpisom
  const secret = 'whsec_' + Buffer.from('tajne').toString('base64')
  const old = String(Math.floor(Date.now() / 1000) - 3600)
  assert.equal(await svixVerify({ secret, id: 'msg_1', timestamp: old, signature: 'v1,xxx', body: '{}' }), false)
  // opakovaný kontakt k rovnakej téme do 24 h len pri spoľahlivej zhode (hash volajúceho + téma)
  const now = new Date().toISOString(), before = new Date(Date.now() - 3600e3).toISOString()
  assert.equal(findRepeat({ call_id: 'b', caller_hash: 'h1', topic: 'wifi', started_at: now }, [{ call_id: 'a', caller_hash: 'h1', topic: 'wifi', started_at: before }]), 'a')
  assert.equal(findRepeat({ call_id: 'b', caller_hash: 'h1', topic: 'wifi', started_at: now }, [{ call_id: 'a', caller_hash: 'h2', topic: 'wifi', started_at: before }]), null)
  assert.equal(findRepeat({ call_id: 'b', caller_hash: null, topic: 'wifi', started_at: now }, [{ call_id: 'a', caller_hash: null, topic: 'wifi', started_at: before }]), null)
})
