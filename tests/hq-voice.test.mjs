// Ústredňa – príkazy (hlas aj paleta) a graf firmy. Syntetické mená.
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, fold } from '../lib/hq-voice.js'
import { companyGraph, mergeGraphs, groupColor } from '../lib/hq-graph.js'
import { buildIndex, parseNote, vaultGraph } from '../lib/hq-vault.js'

const people = [{ id: 'agent:codex', name: 'Codex' }, { id: 'agent:claude-code', name: 'Claude Code' }, { id: 'person:zuzana@example.test', name: 'Zuzana Skúšobná' }]

test('zadanie úlohy hlasom: príjemca aj v inom páde, text úlohy ostáva s diakritikou; nič sa nezapisuje samo', () => {
  assert.deepEqual(parseCommand('Zadaj úlohu Codexu: over novú verziu registra.', { people }), { type: 'assign', assigneeId: 'agent:codex', assigneeName: 'Codex', summary: 'Over novú verziu registra.' })
  const z = parseCommand('nová úloha pre Zuzanu aby potvrdila obhliadku vo štvrtok', { people })
  assert.equal(z.assigneeId, 'person:zuzana@example.test'); assert.equal(z.summary, 'Potvrdila obhliadku vo štvrtok')
  const c = parseCommand('vytvor úlohu pre Claude Code doplniť testy', { people })
  assert.equal(c.assigneeId, 'agent:claude-code'); assert.equal(c.summary, 'Doplniť testy')
  const n = parseCommand('zadaj úlohu skontrolovať vyúčtovanie', { people })
  assert.equal(n.type, 'assign'); assert.equal(n.assigneeId, null); assert.equal(n.summary, 'Skontrolovať vyúčtovanie')
})

test('navigácia, hľadanie a ostatné príkazy; neznáma veta ide do hľadania', () => {
  assert.deepEqual(parseCommand('Otvor prevádzku'), { type: 'nav', area: 'operations' })
  assert.deepEqual(parseCommand('ukáž mi mapu'), { type: 'nav', area: 'map' })
  assert.deepEqual(parseCommand('Kde je Obsidian?'), { type: 'nav', area: 'knowledge' })
  assert.deepEqual(parseCommand('choď na financie'), { type: 'nav', area: 'finance' })
  assert.deepEqual(parseCommand('Nájdi Dunajská'), { type: 'search', query: 'Dunajská' })
  assert.deepEqual(parseCommand('Čo odo mňa tím potrebuje?'), { type: 'briefing' })
  assert.deepEqual(parseCommand('nočný režim'), { type: 'theme', value: 'night' }); assert.deepEqual(parseCommand('prepni na svetlý'), { type: 'theme', value: 'day' })
  assert.deepEqual(parseCommand('Obnov údaje'), { type: 'refresh' })
  assert.deepEqual(parseCommand('niečo úplne iné'), { type: 'unknown', query: 'niečo úplne iné' }); assert.equal(parseCommand('').type, 'unknown')
  assert.equal(fold('Ľudia, ÚDRŽBA!'), 'ludia udrzba')
})

test('graf firmy: ústredňa, oblasti, zdroje, ľudia a úlohy; trezor sa pripojí na Znalosti', () => {
  const areas = [{ id: 'overview', nav: 'Prehľad' }, { id: 'agents', nav: 'Ľudia a agenti' }, { id: 'operations', nav: 'Prevádzka', sources: ['guesty'] }, { id: 'knowledge', nav: 'Znalosti' }, { id: 'connections', nav: 'Prepojenia' }]
  const g = companyGraph({ areas, sources: [{ key: 'guesty', name: 'Guesty', status: 'live' }, { key: 'gmail', name: 'Gmail', status: 'off' }], board: [{ id: 'agent:codex', name: 'Codex' }, { id: 'agent:claude-code', name: 'Claude Code' }], tasks: [{ taskId: 't1', title: 'Skúška', status: 'blocked', assigneeId: 'agent:codex', assignedBy: 'agent:claude-code' }] })
  const id = (x) => g.nodes.findIndex((n) => n.id === x), has = (a, b) => g.links.some(([x, y]) => (x === id(a) && y === id(b)) || (x === id(b) && y === id(a)))
  assert.equal(id('a:overview'), -1); assert.ok(has('hq', 'a:operations')); assert.ok(has('a:operations', 's:guesty')); assert.ok(has('a:connections', 's:gmail'))
  assert.ok(has('a:agents', 'p:agent:codex')); assert.ok(has('p:agent:codex', 't:t1')); assert.ok(has('p:agent:claude-code', 't:t1'))
  assert.equal(g.nodes[id('t:t1')].group, 'uloha-stop'); assert.equal(g.nodes[id('s:guesty')].group, 'zdroj-live'); assert.equal(g.nodes[id('s:gmail')].group, 'zdroj-off')
  const v = vaultGraph(buildIndex([{ ...parseNote('Tim/A.md', '[[B]]') }, { ...parseNote('Znalosti/B.md', '') }], { name: 'T' }))
  const all = mergeGraphs(g, v)
  assert.equal(all.nodes.length, g.nodes.length + v.nodes.length); assert.equal(all.links.length, g.links.length + v.links.length + 1)
  assert.ok(all.links.every(([a, b]) => a >= 0 && b >= 0 && a < all.nodes.length && b < all.nodes.length))
  assert.equal(mergeGraphs(g, null), g); assert.equal(groupColor('Tim'), '#f3dba8'); assert.equal(groupColor('neznáme'), '#a9bfd6')
})
