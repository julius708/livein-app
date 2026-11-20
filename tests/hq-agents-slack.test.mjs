// Testy čítania uložených výpisov Slacku: vymyslené správy, žiadne skutočné mená ani e-maily.
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSlack, signature, summarizeSlack } from '../lib/hq-agents-slack.js'

const CHANNEL = `Channel: #ai-tim (C000TEST)

=== Message from Skúšobný Účet <ucet@example.test> (U0AAA) at 2026-11-20 10:17:21 CET === 
Message TS: 1795166241.000100
[A27] STAV | A27 Mira | hotovo | text hlásenia, ktorý sa neukladá
druhý riadok s GH-PILOT-20261120-01 ako zmienkou
*Sent using* <@U0BOT1|Claude>
Thread: 1 replies (latest: 2026-11-20 11:06:43 CET)

=== Message from Skúšobný Účet <ucet@example.test> (U0AAA) at 2026-11-20 09:00:00 CET === 
Message TS: 1795161600.000200
[CENY A PODUJATIA] 20. 11. | bez roly
*Sent using* <@U0BOT2|ChatGPT>

=== Message from Iný Účet <iny@example.test> (U0BBB) at 2026-11-19 07:55:54 CET === 
Message TS: 1795071354.000300
[P1] STAV | ranný prehľad hotový
*Sent using* <@U0BOT1|Claude>
`
const THREAD = `=== THREAD PARENT MESSAGE ===
From: Skúšobný Účet <ucet@example.test> (U0AAA)
Time: 2026-11-18 20:29:15 CET
Message TS: 1795030155.113799
[Grok Hub] Prvé použitie. ID roly nenájdené.
*Sent using* Cursor

=== THREAD REPLIES (2 total) ===

--- Reply 1 of 2 ---
From: Skúšobný Účet <ucet@example.test> (U0AAA)
Time: 2026-11-18 21:06:24 CET
Message TS: 1795032384.260199
[A19] STAV | A19 | prevzaté | Grok Hub nemá ID roly
*Sent using* <@U0BOT1|Claude>

--- Reply 2 of 2 ---
From: Skúšobný Účet <ucet@example.test> (U0AAA)
Time: 2026-11-20 13:14:53 CET
Message TS: 1795176893.077159
[A19/Codex] TEST GROK HUB · GH-PILOT-20261120-01. Koordinácia, nie výstup Groka.
*Sent using* <@U0BOT2|ChatGPT>
`

test('výpis kanála aj vlákna sa rozdelí na správy s časom zo značky správy', () => {
  const a = parseSlack(CHANNEL), b = parseSlack(THREAD)
  assert.equal(a.length, 3)
  assert.equal(b.length, 3)
  assert.equal(a[0].at, new Date(1795166241.0001 * 1000).toISOString())
  assert.deepEqual([a[0].via, a[1].via, b[0].via], ['Claude', 'ChatGPT', 'Cursor'])
  assert.equal(a[2].account, 'U0BBB')
  assert.ok(a.every((x) => !JSON.stringify(x).includes('@example.test')))     // e-mail odosielateľa sa nikam neprenesie
  assert.equal(parseSlack(CHANNEL + '\n\n' + CHANNEL).length, 3)              // tá istá správa z dvoch výpisov sa počíta raz
})

test('podpis: číselná rola, rola s menom, pomenovaná rola, bez roly', () => {
  assert.deepEqual(signature('[A23 Sage] NÁVRH | 13. 11.'), { text: 'A23 Sage', role: 'A23' })
  assert.deepEqual(signature('*[A19/Codex] TEST GROK HUB'), { text: 'A19/Codex', role: 'A19' })
  assert.deepEqual(signature('[Grok Hub] Prvé použitie'), { text: 'Grok Hub', role: 'GROK-HUB' })
  assert.deepEqual(signature('[GROK_HUB] GH-PILOT'), { text: 'GROK_HUB', role: 'GROK-HUB' })
  assert.deepEqual(signature('[PODKLADY] 13. 11.'), { text: 'PODKLADY', role: null })
  assert.deepEqual(signature('Bez podpisu'), { text: '', role: null })
})

test('súhrn: roly, prostredie, pokrytie; text správ sa neukladá', () => {
  const s = summarizeSlack(CHANNEL + '\n\n' + THREAD)
  const by = Object.fromEntries(s.roles.map((r) => [r.role + '|' + (r.runtime || '?'), r]))
  assert.deepEqual(Object.keys(by).sort(), ['A19|Claude', 'A19|GPT', 'A27|Claude', 'GROK-HUB|Grok', 'P1|Claude'])
  assert.equal(by['A27|Claude'].name, 'Mira')
  assert.equal(by['GROK-HUB|Grok'].name, 'Grok Hub')                           // prostredie Grok je z mena roly; poslané bolo cez Cursor
  assert.equal(by['GROK-HUB|Grok'].last, new Date(1795030155.113799 * 1000).toISOString())
  assert.deepEqual([s.stats.messages, s.stats.unsigned], [6, 1])
  assert.deepEqual(s.stats.via, { Claude: 3, ChatGPT: 2, Cursor: 1 })
  assert.match(s.coverage, /6 správ od 18\. 11\. do 20\. 11\./)
  assert.ok(!JSON.stringify(s).includes('text hlásenia'))
  assert.deepEqual(s.hits, [])
})

test('označenie pilotu: zmienka inej roly nie je výstup pomenovanej roly', () => {
  const s = summarizeSlack(CHANNEL + '\n\n' + THREAD, { marker: 'GH-PILOT-20261120-01' })
  assert.deepEqual(s.hits.map((h) => [h.role, h.signature, h.via]), [['A27', 'A27', 'Claude'], ['A19', 'A19/Codex', 'ChatGPT']])
  assert.equal(s.hits.filter((h) => h.role === 'GROK-HUB').length, 0)
  const own = summarizeSlack(THREAD + '\n\n--- Reply 3 of 3 ---\nFrom: Skúšobný Účet <ucet@example.test> (U0AAA)\nTime: 2026-11-20 14:00:00 CET\nMessage TS: 1795179600.000001\n[Grok Hub] TEST GROK HUB · GH-PILOT-20261120-01 | syntetický výstup\n*Sent using* Cursor\n', { marker: 'GH-PILOT-20261120-01' })
  assert.deepEqual(own.hits.filter((h) => h.role === 'GROK-HUB').map((h) => [h.via, h.ts]), [['Cursor', '1795179600.000001']])
})
