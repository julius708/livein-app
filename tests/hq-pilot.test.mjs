// Skúška toku roly do ústredne na vymyslených podkladoch v dočasnom priečinku.
// Dôkaz, neoverené a lokálny model sa nesmú zliať: neznámy vstup ostáva neoverený a lokálny model nie je produkčná viditeľnosť.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pilotCheck, findMarked, roleDirs } from '../lib/hq-pilot-fs.js'

const ID = 'GH-PILOT-20261120-01', NOW = new Date('2026-11-20T14:00:00Z')
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hq-pilot-'))
const put = (root, rel, text = 'x', when = NOW) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); fs.utimesSync(f, when, when) }
const msg = (ts, first, via) => `From: Skúšobný Účet <ucet@example.test> (U0AAA)\nTime: 2026-11-20 13:00:00 CET\nMessage TS: ${ts}\n${first}\n*Sent using* ${via}\n`
const MENTION = msg('1795176893.077159', `[A19/Codex] TEST GROK HUB · ${ID}. Koordinácia.`, '<@U0BOT2|ChatGPT>')
const OWN = msg('1795179600.000001', `[Grok Hub] TEST GROK HUB · ${ID} | syntetický výstup`, 'Cursor')   // 2026-11-20T13:00:00Z
const step = (rep, key) => rep.steps.find((s) => s.key === key)

test('stav pred pilotom: zmienka v Slacku a prázdne priečinky nie sú dôkaz', () => {
  const out = mk(), vault = mk()
  put(out, 'GROK_HUB/navrh.gdoc', '{"doc_id":"x"}'); fs.mkdirSync(path.join(out, 'GROK-HUB')); fs.mkdirSync(path.join(vault, 'Agenti', 'GROK-HUB'), { recursive: true })
  try {
    const rep = pilotCheck({ id: ID, role: 'GROK-HUB', outputs: [out], vault, slackTexts: [MENTION], now: NOW })
    assert.deepEqual([rep.ok, rep.verdict, rep.failed, rep.unverified], [false, 'missing', ['slack', 'disk'], ['vstup', 'produkcia']])
    assert.equal(step(rep, 'vstup').ok, null)
    assert.deepEqual([step(rep, 'slack').ok, step(rep, 'slack').mentions.map((h) => h.signature)], [false, ['A19/Codex']])   // koordinácia pod A19/Codex nie je výstup Groka
    assert.equal(step(rep, 'disk').ok, false)
    assert.deepEqual(step(rep, 'disk').dirs.map((d) => d.split('/')[1]).sort(), ['GROK-HUB', 'GROK_HUB'])
    assert.match(step(rep, 'disk').note, /1 dokumentov Google/)
    assert.match(step(rep, 'brain').note, /je prázdny/)
    // lokálny model vie rolu ukázať (čerstvý súbor v jej priečinku), ale dôkazom nie je; produkcia ostáva neoverená
    assert.deepEqual([step(rep, 'model').ok, step(rep, 'model').shown.state, step(rep, 'produkcia').ok], [null, 'delivering', null])
  } finally { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(vault, { recursive: true, force: true }) }
})

test('doložené kroky v dosahu: výsledok ostáva NEOVERENÉ, lebo vstup a produkciu skript nevidí', () => {
  const out = mk(), vault = mk()
  put(out, `GROK_HUB/2026-11-20_GROK-HUB_${ID}.md`, 'výstup'); put(out, 'GROK_HUB/latest.md', `posledný: ${ID}`); put(out, 'A1/latest.md', `vstup pre ${ID}`)
  put(vault, 'Agenti/GROK-HUB/00_Index.md', '# Grok Hub · GROK-HUB\n'); put(vault, 'Agenti/GROK-HUB/2026-11-20_pilot.md', `# Pilot\n${ID}\n`)
  try {
    const rep = pilotCheck({ id: ID, role: 'GROK-HUB', outputs: [out], vault, slackTexts: [MENTION, OWN], now: NOW })
    assert.deepEqual([rep.ok, rep.verdict, rep.failed, rep.unverified], [false, 'unverified', [], ['vstup', 'produkcia']])
    assert.deepEqual(step(rep, 'slack').items.map((h) => [h.via, h.ts]), [['Cursor', '1795179600.000001']])
    assert.deepEqual(step(rep, 'disk').items.map((h) => [h.file, h.by]).sort(), [[`GROK_HUB/2026-11-20_GROK-HUB_${ID}.md`, 'názov'], ['GROK_HUB/latest.md', 'obsah']])   // súbor A1 sa role GROK-HUB nepripíše
    assert.deepEqual(step(rep, 'brain').items.map((h) => h.file), ['2026-11-20_pilot.md'])
    const shown = step(rep, 'model').shown
    assert.deepEqual([shown.state, shown.name, shown.runtimes, shown.brainNotes], ['delivering', 'Grok Hub', ['grok'], 2])
    // s prehľadom z produkcie, ktorý rolu po pilote obsahuje: produkcia doložená, vstup stále nie, takže celok nie je „ok“
    const prod = { v: 1, asOf: '2026-11-20T14:30:00.000Z', roles: [], schedules: [], coverage: [], asks: [], slack: [{ runtime: 'Grok', role: 'GROK-HUB', last: '2026-11-20T13:00:00.000Z', count: 1 }], outputs: [{ runtime: 'Grok', role: 'GROK-HUB', where: 'Disk', files: 2, last: NOW.toISOString() }] }
    const withProd = pilotCheck({ id: ID, role: 'GROK-HUB', outputs: [out], vault, slackTexts: [OWN], snapshot: prod, now: new Date('2026-11-20T15:00:00Z') })
    assert.deepEqual([step(withProd, 'produkcia').ok, withProd.verdict, withProd.ok, withProd.unverified], [true, 'unverified', false, ['vstup']])
  } finally { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(vault, { recursive: true, force: true }) }
})

test('produkcia: prehľad bez roly alebo spred pilotu je chýbajúci dôkaz, aj keď lokálny model rolu ukáže', () => {
  const out = mk()
  put(out, `GROK_HUB/2026-11-20_${ID}.md`)
  try {
    const old = { v: 1, asOf: '2026-11-13T12:28:18.011Z', roles: [], schedules: [], outputs: [{ runtime: 'Claude', role: 'A1', where: 'Disk', files: 3, last: '2026-11-13T07:57:00.000Z' }], slack: [], coverage: [], asks: [] }
    const rep = pilotCheck({ id: ID, role: 'GROK-HUB', outputs: [out], slackTexts: [OWN], snapshot: old, now: NOW })
    assert.deepEqual([step(rep, 'slack').ok, step(rep, 'disk').ok, step(rep, 'model').shown.state, step(rep, 'produkcia').ok], [true, true, 'delivering', false])
    assert.deepEqual([rep.verdict, rep.ok, rep.failed], ['missing', false, ['produkcia']])
    assert.match(step(rep, 'produkcia').note, /nie je/)
    // prehľad, v ktorom rola je a „dodáva“, ale vznikol pred výstupom pilotu, pilot nedokladá
    const before = { ...old, asOf: '2026-11-20T10:00:00.000Z', slack: [{ runtime: 'Grok', role: 'GROK-HUB', last: '2026-11-18T19:29:15.000Z', count: 1 }] }
    const rep2 = pilotCheck({ id: ID, role: 'GROK-HUB', outputs: [out], slackTexts: [OWN], snapshot: before, now: NOW })
    assert.equal(step(rep2, 'produkcia').shown.state, 'delivering')
    assert.equal(step(rep2, 'produkcia').ok, false)
    assert.match(step(rep2, 'produkcia').note, /starší ako výstup pilotu/)
  } finally { fs.rmSync(out, { recursive: true, force: true }) }
})

test('pomocné: priečinky roly a hľadanie označenia', () => {
  const out = mk()
  put(out, 'GROK_HUB/a.md'); put(out, 'GROK_HUB_stare/a.md'); put(out, 'A11/a.md'); put(out, 'A11_sensitive/b.md', ID); put(out, 'A11/.skryte/c.md', ID)
  try {
    assert.deepEqual(roleDirs(out, 'GROK-HUB'), ['GROK_HUB'])
    assert.deepEqual(roleDirs(out, 'A11').sort(), ['A11', 'A11_sensitive'])
    assert.deepEqual(findMarked(path.join(out, 'A11'), ID).hits, [])                 // skryté priečinky sa neprehľadávajú
    assert.deepEqual(findMarked(path.join(out, 'A11_sensitive'), ID).hits.map((h) => h.by), ['obsah'])
    assert.throws(() => pilotCheck({ id: '', role: 'GROK-HUB' }), /Chýba/)
  } finally { fs.rmSync(out, { recursive: true, force: true }) }
})
