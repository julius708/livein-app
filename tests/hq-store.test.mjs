// Ústredňa – tok registra nad lokálnym úložiskom (rovnaké unikátne kľúče ako migrácia). Syntetické identity a dôkazy; nie živý beh agentov.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localStore } from '../lib/hq-local.js'
import { appendOp, listTasks, getTask, listSources, markSource, listQuarantine, linkTask, registerReady, listActors } from '../lib/hq-store.js'
import { actorFromToken, actorFromViewer, attentionOf, queueFor, actorBoard, buildEvent, mergeActors, mergeSources, ACTORS, WORKSPACE, sourceFor, recentEvents } from '../lib/hq-core.js'

const NOW = '2026-11-12T20:00:00Z'
const at = (m) => new Date(Date.parse(NOW) + m * 60e3).toISOString().replace('.000Z', 'Z')
const ceo = actorFromViewer({ user: { email: 'CEO@example.test' }, me: { roles: ['admin'], name: 'Skúšobný CEO' } })
const TOKENS = { 'agent:claude-code': 'c'.repeat(32), 'agent:codex': 'x'.repeat(32) }
const claude = actorFromToken(TOKENS['agent:claude-code'], TOKENS)
const codex = actorFromToken(TOKENS['agent:codex'], TOKENS)
const EVIDENCE = [{ uri: 'artifact:synthetic-result-v1', version: '1', digest: 'b'.repeat(64) }]
const base = { summary: 'Skúšobná úloha', nextAction: 'Prevziať', assigneeId: 'agent:claude-code' }
async function assigned(s, extra = {}) { return (await appendOp(s, 'assign', { ...base, ...extra }, { actor: ceo, now: NOW })).taskId }

test('identita: prihlásený admin a token agenta; telo požiadavky identitu neurčí', async () => {
  assert.equal(ceo.id, 'person:ceo@example.test'); assert.equal(ceo.workspaceId, WORKSPACE)
  assert.equal(actorFromViewer({ user: { email: 'a@b.sk' }, me: { roles: ['crm'] } }), null)
  assert.equal(claude.id, 'agent:claude-code'); assert.equal(codex.id, 'agent:codex')
  assert.equal(actorFromToken('zly-token-zly-token-zly-token-1', TOKENS), null)
  assert.equal(actorFromToken('kratky', { 'agent:codex': 'kratky' }), null)
  assert.equal(actorFromToken('n'.repeat(32), { 'agent:neznamy': 'n'.repeat(32) }), null)   // token bez registrovaného vykonávateľa
  const s = localStore()
  const r = await appendOp(s, 'assign', { ...base, actorId: 'person:forged', workspaceId: 'other', source: 'forged' }, { actor: ceo, now: NOW })
  const t = await getTask(s, r.taskId)
  assert.equal(t.assignedBy, ceo.id); assert.equal(t.history[0].workspaceId, WORKSPACE); assert.equal(t.history[0].source, 'ui')
})

test('celý tok: zadanie → prevzatie → krok → blokovanie → pokračovanie → výsledok → nezávislé overenie verzie', async () => {
  const s = localStore()
  const id = await assigned(s)
  assert.equal((await getTask(s, id)).status, 'prepared')
  await appendOp(s, 'accept', { taskId: id, summary: 'Preberám', nextAction: 'Začať' }, { actor: claude, now: at(1) })
  await appendOp(s, 'step', { taskId: id, summary: 'Krok 1', nextAction: 'Pokračovať' }, { actor: claude, now: at(2) })
  await appendOp(s, 'block', { taskId: id, summary: 'Chýba prístup', nextAction: 'CEO dodá prístup' }, { actor: claude, now: at(3) })
  let t = await getTask(s, id)
  assert.equal(t.status, 'blocked'); assert.deepEqual(attentionOf([t]).map((x) => x.taskId), [id])
  await appendOp(s, 'step', { taskId: id, summary: 'Prístup je, pokračujem', nextAction: 'Dokončiť' }, { actor: claude, now: at(4) })
  await assert.rejects(appendOp(s, 'result', { taskId: id, summary: 'Hotovo', nextAction: 'Skontrolovať' }, { actor: claude, now: at(5) }), (e) => e.code === 'evidence')
  const res = await appendOp(s, 'result', { taskId: id, summary: 'Hotovo', nextAction: 'Skontrolovať verziu 1', evidence: EVIDENCE }, { actor: claude, now: at(5) })
  t = await getTask(s, id)
  assert.equal(t.status, 'result_ready'); assert.equal(t.verified, false); assert.equal(t.result.eventId, res.eventId)
  assert.deepEqual(queueFor([t], codex.id).toVerify.map((x) => x.taskId), [id]); assert.equal(queueFor([t], claude.id).toVerify.length, 0)
  const check = { checkedEventId: res.eventId, checkedDigests: ['b'.repeat(64)] }
  await assert.rejects(appendOp(s, 'verify', { taskId: id, summary: 'OK', nextAction: '-', ...check }, { actor: claude, now: at(6) }), (e) => e.code === 'self_verify')
  await assert.rejects(appendOp(s, 'verify', { taskId: id, summary: 'OK', nextAction: '-' }, { actor: codex, now: at(6) }), (e) => e.code === 'verification')
  await assert.rejects(appendOp(s, 'verify', { taskId: id, summary: 'OK', nextAction: '-', checkedEventId: res.eventId, checkedDigests: ['c'.repeat(64)], evidence: EVIDENCE }, { actor: codex, now: at(6) }), (e) => e.code === 'verification')
  await appendOp(s, 'verify', { taskId: id, summary: 'Verzia 1 sedí', nextAction: 'Zapracovať', ...check }, { actor: codex, now: at(7) })
  t = await getTask(s, id)
  assert.equal(t.status, 'verified'); assert.equal(t.verified, true); assert.equal(t.applied, false)
  assert.deepEqual(t.history.map((e) => e.status), ['prepared', 'accepted', 'working', 'blocked', 'working', 'result_ready', 'verified'])
  assert.equal(t.history[3].summary, 'Chýba prístup')   // blokovanie ostáva v histórii
  // zapracovanie potrebuje vykonávateľa so schopnosťou apply a potvrdenie cieľovej služby
  await assert.rejects(appendOp(s, 'apply', { taskId: id, summary: 'x', nextAction: '-', receipt: { id: 'r', target: 'asana' } }, { actor: codex, now: at(8) }), (e) => e.code === 'forbidden')
  const asana = { id: 'integration:asana', workspaceId: WORKSPACE, capabilities: ['apply'], kind: 'integration' }
  await assert.rejects(appendOp(s, 'apply', { taskId: id, summary: 'x', nextAction: '-' }, { actor: asana, now: at(8) }), (e) => e.code === 'receipt')
  await appendOp(s, 'apply', { taskId: id, summary: 'Asana potvrdila', nextAction: 'Hotovo', receipt: { id: 'synthetic-receipt', target: 'asana' } }, { actor: asana, now: at(9) })
  assert.equal((await getTask(s, id)).applied, true)
})

test('cudzí vykonávateľ úlohu neprevezme a nikto bez oprávnenia nezadáva', async () => {
  const s = localStore()
  const id = await assigned(s)
  await assert.rejects(appendOp(s, 'accept', { taskId: id, summary: 'Beriem', nextAction: 'x' }, { actor: codex, now: at(1) }), (e) => e.code === 'not_assignee' && e.status === 403)
  await assert.rejects(appendOp(s, 'assign', base, { actor: { id: 'integration:asana', workspaceId: WORKSPACE, capabilities: ['apply'], kind: 'integration' }, now: NOW }), (e) => e.code === 'forbidden')
  await assert.rejects(appendOp(s, 'accept', { taskId: 'task_neexistuje', summary: 'x', nextAction: 'x' }, { actor: claude, now: NOW }), (e) => e.status === 404)
  await assert.rejects(appendOp(s, 'accept', { taskId: id, summary: 'x', nextAction: 'x' }, {}), (e) => e.status === 401)
})

test('opakované doručenie nevytvorí druhú úlohu ani udalosť; iný obsah pod rovnakým kľúčom ide do karantény', async () => {
  const s = localStore()
  const a = await appendOp(s, 'assign', { ...base, idempotencyKey: 'slack:C0TEST/1.1' }, { actor: ceo, now: NOW })
  const b = await appendOp(s, 'assign', { ...base, idempotencyKey: 'slack:C0TEST/1.1' }, { actor: ceo, now: at(5) })
  assert.equal(b.duplicate, true); assert.equal(b.taskId, a.taskId)
  assert.equal((await listTasks(s)).length, 1); assert.equal((await getTask(s, a.taskId)).history.length, 1)
  await assert.rejects(appendOp(s, 'assign', { ...base, summary: 'Iné zadanie', idempotencyKey: 'slack:C0TEST/1.1' }, { actor: ceo, now: at(6) }), (e) => e.code === 'collision')
  const k = { taskId: a.taskId, summary: 'Preberám', nextAction: 'Začať', idempotencyKey: 'run-1' }
  await appendOp(s, 'accept', k, { actor: claude, now: at(1) })
  assert.equal((await appendOp(s, 'accept', k, { actor: claude, now: at(2) })).duplicate, true)
  assert.equal((await getTask(s, a.taskId)).history.length, 2)
  // rovnaký kľúč od iného vykonávateľa nie je duplicita (zdroj je naviazaný na identitu)
  assert.notEqual(sourceFor(claude), sourceFor(codex))
  const q = await listQuarantine(s)
  assert.equal(q.length, 1); assert.equal(q[0].reason_code, 'collision')
})

test('oneskorená alebo súbežná udalosť neprepíše novší stav a zostane v karanténe', async () => {
  const s = localStore()
  const id = await assigned(s)
  await appendOp(s, 'accept', { taskId: id, summary: 'Preberám', nextAction: 'x' }, { actor: claude, now: at(1) })
  await appendOp(s, 'step', { taskId: id, summary: 'Krok', nextAction: 'x' }, { actor: claude, now: at(2) })
  await assert.rejects(appendOp(s, 'step', { taskId: id, summary: 'Starý krok', nextAction: 'x', sequence: 2 }, { actor: claude, now: at(3) }), (e) => e.code === 'sequence' && e.status === 409)
  await assert.rejects(appendOp(s, 'accept', { taskId: id, summary: 'Znova prevziať', nextAction: 'x' }, { actor: claude, now: at(3) }), (e) => e.code === 'transition')
  const t = await getTask(s, id)
  assert.equal(t.sequence, 3); assert.equal(t.summary, 'Krok')
  assert.deepEqual((await listQuarantine(s)).map((x) => x.reason_code).sort(), ['sequence', 'transition'])
  // unikátny kľúč úložiska zachytí aj zápis, ktorý by obišiel kontrolu v pamäti
  const dupRow = { ...s.db.tables.hq_events[2], event_id: 'evt_iny', source_event_id: 'iny' }
  const ins = await s.from('hq_events').insert(dupRow)
  assert.equal(ins.error.code, '23505')
})

test('pôvodné odkazy (Slack, Asana) sa uchovajú pri udalosti aj ako neskoršie mapovanie, bez duplicít', async () => {
  const s = localStore()
  const refs = [{ kind: 'slack', id: 'C0TEST/1700000000.000100', url: 'https://example.slack.com/archives/C0TEST/p1700000000000100' }]
  const id = await assigned(s, { refs })
  await linkTask(s, { taskId: id, kind: 'asana', externalId: '1200000000000001', url: 'https://app.asana.com/0/0/1200000000000001' })
  assert.equal((await linkTask(s, { taskId: id, kind: 'asana', externalId: '1200000000000001' })).duplicate, true)
  await linkTask(s, { taskId: id, kind: 'slack', externalId: 'C0TEST/1700000000.000100' })
  const t = await getTask(s, id)
  assert.deepEqual(t.refs.map((r) => r.kind).sort(), ['asana', 'slack'])
})

test('nová rola mimo zabudovaného registra sa pridá bez prepisu histórie', async () => {
  const s = localStore()
  const id = await assigned(s)
  await s.from('hq_actors').insert({ id: 'agent:viktor', kind: 'agent', name: 'Viktor', role: 'Marketing', runtime: 'GPT', capabilities: ['work'], active: true })
  const actors = await listActors(s)
  assert.ok(actors.some((a) => a.id === 'agent:viktor')); assert.equal(actors.length, ACTORS.length + 1)
  const viktor = actorFromToken('v'.repeat(32), { 'agent:viktor': 'v'.repeat(32) }, actors)
  const id2 = (await appendOp(s, 'assign', { ...base, assigneeId: 'agent:viktor' }, { actor: ceo, now: at(1) })).taskId
  await appendOp(s, 'accept', { taskId: id2, summary: 'Preberám', nextAction: 'x' }, { actor: viktor, now: at(2) })
  assert.equal((await getTask(s, id)).history.length, 1)   // staršia úloha nedotknutá
  assert.equal(mergeActors([{ id: 'agent:codex', active: false, capabilities: [] }]).find((a) => a.id === 'agent:codex').active, false)
})

test('stav vykonávateľa sa odvodzuje len z jeho udalostí: bez signálu nie je „pracuje“', async () => {
  const s = localStore()
  const id = await assigned(s)
  let board = actorBoard(ACTORS, await listTasks(s), Date.parse(at(1)))
  assert.equal(board.find((a) => a.id === 'agent:claude-code').state, 'Čaká na prevzatie')
  assert.equal(board.find((a) => a.id === 'agent:codex').state, 'Bez signálu')
  await appendOp(s, 'accept', { taskId: id, summary: 'Preberám', nextAction: 'x' }, { actor: claude, now: at(1) })
  board = actorBoard(ACTORS, await listTasks(s), Date.parse(at(2)))
  assert.equal(board.find((a) => a.id === 'agent:claude-code').state, 'Pracuje')
  board = actorBoard(ACTORS, await listTasks(s), Date.parse(at(60 * 9)))
  assert.equal(board.find((a) => a.id === 'agent:claude-code').state, 'Rozpracované, bez nového kroku')
  assert.equal(recentEvents(await listTasks(s))[0].status, 'accepted')
})

test('zdroje: nepripojené, chybné a neaktuálne sú odlíšené; stav „naživo“ vzniká len úspešným prenosom', async () => {
  const s = localStore()
  let src = await listSources(s, { now: Date.parse(NOW) })
  assert.ok(src.every((x) => x.status === 'off'))
  await markSource(s, 'register', { ok: true, now: NOW })
  await markSource(s, 'slack', { ok: false, error: 'channel_not_found', now: NOW })
  await markSource(s, 'asana', { status: 'pending', account: 'firemný účet', note: 'Čaká na token', now: NOW })
  src = Object.fromEntries((await listSources(s, { now: Date.parse(NOW) })).map((x) => [x.key, x]))
  assert.equal(src.register.status, 'live'); assert.equal(src.register.lastOkAt, NOW); assert.equal(src.register.coveredFrom, NOW)
  assert.equal(src.slack.status, 'error'); assert.equal(src.slack.lastError, 'channel_not_found')
  assert.equal(src.asana.status, 'pending'); assert.equal(src.asana.account, 'firemný účet')
  assert.equal(src.whatsapp.status, 'off')
  assert.equal(mergeSources([{ key: 'register', status: 'live', last_ok_at: NOW }], { now: Date.parse(NOW) + 72 * 3600e3 })[0].status, 'stale')
})

test('lokálny register prežije reštart (súbor) a chýbajúca schéma v databáze neznamená chybu', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hq-')), 'register.json')
  const id = await assigned(localStore(file))
  const again = localStore(file)
  assert.equal((await getTask(again, id)).status, 'prepared'); assert.equal(await registerReady(again), true)
  fs.rmSync(path.dirname(file), { recursive: true })
  const missing = { from: () => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, then: (r) => r({ data: null, error: { message: 'relation "hq_events" does not exist' } }) }; return b } }
  assert.equal(await registerReady(missing), false); assert.deepEqual(await listTasks(missing), [])
})

test('buildEvent: poradie určuje server, povinné polia sú vyžadované', () => {
  const e = buildEvent('assign', base, { actor: ceo, now: NOW })
  assert.equal(e.sequence, 1); assert.equal(e.status, 'prepared'); assert.match(e.taskId, /^task_/); assert.match(e.caseId, /^case_/)
  assert.throws(() => buildEvent('assign', { ...base, summary: '' }, { actor: ceo }), (x) => x.code === 'summary')
  assert.throws(() => buildEvent('assign', { ...base, nextAction: '' }, { actor: ceo }), (x) => x.code === 'next')
  assert.throws(() => buildEvent('assign', { ...base, assigneeId: '' }, { actor: ceo }), (x) => x.code === 'assignee')
  assert.throws(() => buildEvent('finish', base, { actor: ceo }), (x) => x.code === 'bad_op')
})

// --- Nálezy nezávislej kontroly Codexu (CODEX_RESULT.md, 12. 11. 2026) ---
// F1: opakovanie s rovnakým idempotencyKey je duplicita len pri úplnej zhode obsahu. Prvé tri testy sú prevzaté z CODEX_CONTRACT_CHECK.test.mjs.
const cxCeo = { id: 'person:synthetic-ceo', workspaceId: 'livein', kind: 'person', capabilities: ['assign'] }
const cxWorker = { id: 'agent:codex', workspaceId: 'livein', kind: 'agent', capabilities: ['work'] }
const cxReviewer = { id: 'agent:claude-code', workspaceId: 'livein', kind: 'agent', capabilities: ['verify'] }
const cxEvidence = [{ uri: 'artifact:synthetic-v1', version: '1', digest: 'a'.repeat(64) }]
const cxAssignment = { taskId: 'synthetic-task', caseId: 'synthetic-case', assigneeId: cxWorker.id, summary: 'Synthetic task', nextAction: 'Accept', idempotencyKey: 'assign-key' }
async function cxReady() { const s = localStore(); await appendOp(s, 'assign', cxAssignment, { actor: cxCeo, now: NOW }); await appendOp(s, 'accept', { taskId: cxAssignment.taskId, summary: 'Accepted', nextAction: 'Prepare result' }, { actor: cxWorker, now: NOW }); return s }

test('REGRESSION (Codex F1): same idempotency key with changed assignee must be a collision', async () => {
  const s = localStore(); await appendOp(s, 'assign', cxAssignment, { actor: cxCeo, now: NOW })
  await assert.rejects(appendOp(s, 'assign', { ...cxAssignment, assigneeId: 'agent:other' }, { actor: cxCeo, now: NOW }), (e) => e.code === 'collision')
})
test('REGRESSION (Codex F1): same result key with changed artifact digest must be a collision', async () => {
  const s = await cxReady(); const p = { taskId: cxAssignment.taskId, summary: 'Result', nextAction: 'Review', idempotencyKey: 'result-key', evidence: cxEvidence }
  await appendOp(s, 'result', p, { actor: cxWorker, now: NOW })
  await assert.rejects(appendOp(s, 'result', { ...p, evidence: [{ ...cxEvidence[0], digest: 'b'.repeat(64) }] }, { actor: cxWorker, now: NOW }), (e) => e.code === 'collision')
})
test('REGRESSION (Codex F1): a verify retry with changed checked digest must not return success', async () => {
  const s = await cxReady(); await appendOp(s, 'result', { taskId: cxAssignment.taskId, summary: 'Result', nextAction: 'Review', evidence: cxEvidence }, { actor: cxWorker, now: NOW })
  const t = await getTask(s, cxAssignment.taskId)
  const p = { taskId: cxAssignment.taskId, summary: 'Checked', nextAction: 'Decide', idempotencyKey: 'verify-key', checkedEventId: t.result.eventId, checkedDigests: [cxEvidence[0].digest] }
  await appendOp(s, 'verify', p, { actor: cxReviewer, now: NOW })
  await assert.rejects(appendOp(s, 'verify', { ...p, checkedDigests: ['b'.repeat(64)] }, { actor: cxReviewer, now: NOW }), (e) => e.code === 'collision' || e.code === 'verification')
})
test('F1 doplnené: líšiaci sa prípad, verzia dôkazu, overovaná udalosť, potvrdenie alebo odkazy sú kolízia; úplná zhoda ostáva duplicitou', async () => {
  const s = await cxReady()
  const refs = [{ kind: 'slack', id: 'C0TEST/1.1', url: 'https://example.test/a' }]
  const res = { taskId: cxAssignment.taskId, summary: 'Result', nextAction: 'Review', idempotencyKey: 'r1', evidence: cxEvidence, refs }
  const first = await appendOp(s, 'result', res, { actor: cxWorker, now: NOW })
  // úplná zhoda (aj v inom poradí kľúčov a s medzerami okolo textu) je duplicita
  const again = await appendOp(s, 'result', { refs, evidence: [{ digest: 'a'.repeat(64), version: '1', uri: 'artifact:synthetic-v1' }], idempotencyKey: 'r1', nextAction: ' Review ', summary: 'Result', taskId: cxAssignment.taskId }, { actor: cxWorker, now: at(3) })
  assert.equal(again.duplicate, true); assert.equal(again.eventId, first.eventId)
  const bad = (patch) => assert.rejects(appendOp(s, 'result', { ...res, ...patch }, { actor: cxWorker, now: at(4) }), (e) => e.code === 'collision' && e.status === 409)
  await bad({ evidence: [{ ...cxEvidence[0], version: '2' }] }); await bad({ evidence: [{ ...cxEvidence[0], uri: 'artifact:other' }] }); await bad({ evidence: [...cxEvidence, { uri: 'artifact:extra', version: '1', digest: 'c'.repeat(64) }] })
  await bad({ refs: [{ ...refs[0], url: 'https://example.test/changed' }] }); await bad({ refs: undefined }); await bad({ summary: 'Iný' })
  await assert.rejects(appendOp(s, 'assign', { ...cxAssignment, caseId: 'other-case' }, { actor: cxCeo, now: NOW }), (e) => e.code === 'collision')
  const ver = { taskId: cxAssignment.taskId, summary: 'Checked', nextAction: 'Decide', idempotencyKey: 'v1', checkedEventId: first.eventId, checkedDigests: [cxEvidence[0].digest] }
  const v = await appendOp(s, 'verify', ver, { actor: cxReviewer, now: at(5) })
  assert.equal((await appendOp(s, 'verify', ver, { actor: cxReviewer, now: at(6) })).duplicate, true)
  await assert.rejects(appendOp(s, 'verify', { ...ver, checkedEventId: 'evt_other' }, { actor: cxReviewer, now: at(6) }), (e) => e.code === 'collision')
  const asana = { id: 'integration:asana', workspaceId: WORKSPACE, capabilities: ['apply'], kind: 'integration' }
  const app = { taskId: cxAssignment.taskId, summary: 'Applied', nextAction: 'Done', idempotencyKey: 'a1', receipt: { id: 'rcpt-1', target: 'asana' } }
  await appendOp(s, 'apply', app, { actor: asana, now: at(7) })
  assert.equal((await appendOp(s, 'apply', app, { actor: asana, now: at(8) })).duplicate, true)
  await assert.rejects(appendOp(s, 'apply', { ...app, receipt: { id: 'rcpt-2', target: 'asana' } }, { actor: asana, now: at(8) }), (e) => e.code === 'collision')
  await assert.rejects(appendOp(s, 'apply', { ...app, receipt: { id: 'rcpt-1', target: 'asana', verifiedEventId: 'evt_other' } }, { actor: asana, now: at(8) }), (e) => e.code === 'collision')
  assert.equal((await getTask(s, cxAssignment.taskId)).history.length, 5)   // žiadna z odmietnutých požiadaviek nič nezapísala
  assert.equal(v.status, 'verified')
  // opakovanie neobchádza práva: po odobratí schopnosti sa nevráti ani „duplicita“
  await assert.rejects(appendOp(s, 'result', res, { actor: { ...cxWorker, capabilities: [] }, now: at(9) }), (e) => e.code === 'forbidden' && e.status === 403)
})
// F2: register vykonávateľov je autoritatívny aj pre zabudovaných agentov (rovnaké zloženie, aké používa lib/hq-server.js: actorFromToken + mergeActors).
test('Codex F2: deaktivácia alebo zúženie práv zabudovaného agenta v registri platí pri overení tokenu', () => {
  const token = 'synthetic-test-token-not-a-real-credential', tokens = { 'agent:codex': token }
  const viaRegister = (rows) => actorFromToken(token, tokens, mergeActors(rows, ACTORS))
  assert.deepEqual(viaRegister([]).capabilities, ['assign', 'work', 'verify'])                                   // bez riadku platí zabudovaný základ
  assert.equal(viaRegister([{ id: 'agent:codex', kind: 'agent', name: 'Codex', active: false, capabilities: [] }]), null)
  assert.deepEqual(viaRegister([{ id: 'agent:codex', kind: 'agent', name: 'Codex', active: true, capabilities: ['work'] }]).capabilities, ['work'])
  assert.deepEqual(viaRegister([{ id: 'agent:codex', kind: 'agent', name: 'Codex', active: true }]).capabilities, [])   // riadok bez práv práva nepridáva
  assert.deepEqual(actorFromToken(token, { 'agent:claude-code': token }, mergeActors([{ id: 'agent:codex', active: false }], ACTORS)).id, 'agent:claude-code')   // obmedzenie sa týka len danej identity
})
