// Ústredňa – konektory Slack a Asana: len čisté časti (bez siete). Živé overenie je opísané v docs/ustredna/README.md.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { slackText, marker, MARKER_RE, classifySlackEvent, verifySlackSignature, slackRef, postSlack, asanaTaskPayload, asanaReceipt, asanaRef, createAsanaTask } from '../lib/hq-connectors.js'

const EVENT = { taskId: 'task_abc', sequence: 3, status: 'blocked', actorId: 'agent:codex', summary: 'Chýba prístup', nextAction: 'CEO dodá prístup', evidence: [] }
const CH = 'C0C9HG8B42C'
const msg = (e) => ({ type: 'event_callback', event_id: 'Ev1', event: { type: 'message', channel: CH, ts: '1700000000.000100', user: 'U1', text: 'Ahoj', ...e } })

test('hlásenie do Slacku nesie značku udalosti a skúšobné úlohy sú označené', () => {
  const t = slackText(EVENT, { actorName: 'Codex', title: 'Skúšobná úloha', test: true })
  assert.match(t, /^\[SKÚŠKA ÚSTREDNE, nereagovať\] \*Blokovanie\* · Codex · Skúšobná úloha/)
  assert.match(t, /Ďalší krok: CEO dodá prístup/)
  const m = MARKER_RE.exec(t); assert.equal(m[1], 'task_abc'); assert.equal(m[2], '3'); assert.equal(marker('task_abc', 3), 'hq:task_abc#3')
  const r = slackText({ ...EVENT, status: 'result_ready', evidence: [{ uri: 'artifact:x', version: '2', digest: 'a'.repeat(64) }] }, {})
  assert.match(r, /Verzia 2: artifact:x \(sha256 aaaaaaaaaaaa…\)/)
})

test('prichádzajúce správy: vlastné hlásenia, boti, úpravy a iné kanály sa ignorujú (žiadna slučka)', () => {
  assert.equal(classifySlackEvent({ type: 'url_verification', challenge: 'abc' }).challenge, 'abc')
  assert.equal(classifySlackEvent(msg({ text: 'x `hq:task_abc#3`' })).reason, 'own_marker')
  assert.equal(classifySlackEvent(msg({ bot_id: 'B1' })).reason, 'bot_or_edit')
  assert.equal(classifySlackEvent(msg({ subtype: 'message_changed' })).reason, 'bot_or_edit')
  assert.equal(classifySlackEvent(msg({ channel: 'C0OTHER' })).reason, 'other_channel')
  assert.equal(classifySlackEvent(null).action, 'ignore')
  const c = classifySlackEvent(msg({ thread_ts: '1699999999.000001' }))
  assert.equal(c.action, 'candidate'); assert.equal(c.key, CH + '/1700000000.000100'); assert.equal(c.threadKey, CH + '/1699999999.000001')
  assert.equal(c.claimedAuthor, 'U1')   // autor je tvrdenie Slacku, nie overená identita agenta
  assert.equal(classifySlackEvent(msg({})).key, classifySlackEvent(msg({})).key)   // opakované doručenie → rovnaký kľúč na deduplikáciu
})

test('podpis Slacku: správny prejde, zlý, starý alebo chýbajúci nie', () => {
  const secret = 'test-signing-secret', body = '{"type":"url_verification"}', now = 1_800_000_000_000, ts = String(now / 1000)
  const signature = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature, body, now }), true)
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature, body: body + ' ', now }), false)
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature, body, now: now + 301e3 }), false)
  assert.equal(verifySlackSignature({ secret: '', timestamp: ts, signature, body, now }), false)
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature: 'v0=00', body, now }), false)
})

test('bez tokenu sa nič neodošle a odkazy majú stabilný tvar', async () => {
  const before = { s: process.env.SLACK_BOT_TOKEN, a: process.env.ASANA_TOKEN }
  delete process.env.SLACK_BOT_TOKEN; delete process.env.ASANA_TOKEN
  const never = () => { throw new Error('sieť sa nesmie volať') }
  assert.deepEqual(await postSlack('x', { fetchImpl: never }), { skipped: 'not_configured' })
  assert.deepEqual(await createAsanaTask({}, { fetchImpl: never }), { skipped: 'not_configured' })
  if (before.s) process.env.SLACK_BOT_TOKEN = before.s; if (before.a) process.env.ASANA_TOKEN = before.a
  assert.deepEqual(slackRef(CH, '1700000000.000100'), { kind: 'slack', id: CH + '/1700000000.000100', url: 'https://live-ininternational.slack.com/archives/' + CH + '/p1700000000000100' })
  assert.deepEqual(asanaRef('12'), { kind: 'asana', id: '12', url: 'https://app.asana.com/0/0/12' })
})

test('Asana: úloha nesie spoločné ID a potvrdenie vzniká len z odpovede služby', () => {
  const p = asanaTaskPayload({ taskId: 'task_abc', title: 'Skúšobná úloha', status: 'prepared', nextAction: 'Prevziať', caseId: 'case_abc' }, { projectGid: '999' })
  assert.equal(p.name, '[HQ task_abc] Skúšobná úloha'); assert.deepEqual(p.projects, ['999']); assert.match(p.notes, /Prípad: case_abc/)
  assert.equal(asanaReceipt({}, 'evt_1'), null); assert.equal(asanaReceipt({ data: {} }, 'evt_1'), null)
  assert.deepEqual(asanaReceipt({ data: { gid: '12', modified_at: '2026-11-12T20:00:00Z' } }, 'evt_1'), { id: 'asana:12:2026-11-12T20:00:00Z', target: 'asana', verifiedEventId: 'evt_1' })
})
