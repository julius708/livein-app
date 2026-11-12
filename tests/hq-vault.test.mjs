// Ústredňa – Obsidian index: syntetické poznámky, žiadne firemné dáta.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseNote, buildIndex, packIndex, unpackIndex, sanitizeIndex, vaultSummary, vaultGraph, obsidianUrl, VAULT_SKIP } from '../lib/hq-vault.js'
import { scanVault, gzIndex, ungzIndex } from '../lib/hq-vault-fs.js'

test('poznámka: názov, štítky a odkazy; kód, prílohy a farby sa neberú', () => {
  const n = parseNote('Tim/Poznamka.md', '---\ntags: [proces, ai-tim]\n---\n# Hlavný názov\nPozri [[Druha]] a [[Znalosti/Tretia|tretiu]] aj [[Druha#Časť]].\n![[obrazok.png]] [odkaz](../Agenti/Stvrta.md) [web](https://example.test/x.md)\nFarba #F46D16 a štítok #dolezite.\n```\n[[V kode]] #nie\n```\n`[[inline]]`')
  assert.equal(n.title, 'Hlavný názov')
  assert.deepEqual(n.links.sort(), ['Agenti/Stvrta', 'Druha', 'Znalosti/Tretia'])
  assert.deepEqual(n.tags.sort(), ['ai-tim', 'dolezite', 'proces'])
  assert.equal(parseNote('Priecinok/Bez nadpisu.md', 'text bez nadpisu').title, 'Bez nadpisu')
  assert.equal(parseNote('Tim/2026-10-19_Codex_ranne.md', 'bez nadpisu').title, '2026-10-19 Codex ranne')
  assert.equal(parseNote('x.md', '# _Dôležité_ **pravidlo** `kód` a_b').title, 'Dôležité pravidlo kód a_b')
  assert.ok(n.words > 5)
})

test('index: odkazy sa rozlíšia podľa cesty alebo názvu, neexistujúce sa len spočítajú, text sa neukladá', () => {
  const ix = buildIndex([
    { ...parseNote('A/Jedna.md', '# Jedna\n[[Dva]] [[B/Tri]] [[Neexistuje]] [[Jedna]] TAJNY TEXT'), mtime: '2026-11-01T10:00:00.000Z' },
    { ...parseNote('B/Dva.md', '# Dva\n[[jedna]]'), mtime: '2026-11-03T10:00:00.000Z' },
    { ...parseNote('B/Tri.md', '# Tri'), mtime: '2026-11-02T10:00:00.000Z' },
    { ...parseNote('C/hlboko/Dva.md', '# Iné Dva') },
  ], { name: 'Skúšobný trezor', syncedAt: '2026-11-12T10:00:00.000Z' })
  assert.deepEqual(ix.notes[0].out, [1, 2]); assert.deepEqual(ix.notes[1].out, [0])   // [[Dva]] → kratšia cesta B/Dva; odkaz na seba sa neráta
  assert.deepEqual(ix.stats, { notes: 4, links: 3, unresolved: 1 })
  assert.equal(JSON.stringify(packIndex(ix)).includes('TAJNY'), false)
  assert.deepEqual(unpackIndex(packIndex(ix)), ix); assert.deepEqual(ungzIndex(gzIndex(ix)), ix)
  const s = vaultSummary(ix)
  assert.equal(s.recent[0].path, 'B/Dva.md'); assert.equal(s.hubs[0].title, 'Jedna'); assert.equal(s.hubs[0].degree, 3); assert.equal(s.lastChange, '2026-11-03T10:00:00.000Z')
  assert.deepEqual(s.groups.map((g) => g.name + g.count), ['B2', 'A1', 'C1'])
  const g = vaultGraph(ix)
  assert.equal(g.nodes.filter((n) => n.kind === 'note').length, 4); assert.ok(g.nodes.some((n) => n.kind === 'folder' && n.path === 'C/hlboko'))
  assert.equal(g.links.filter((l) => l[2] === 1).length, 3); assert.ok(g.links.every(([a, b]) => a < g.nodes.length && b < g.nodes.length))
  assert.equal(vaultGraph(ix, { folders: false }).nodes.length, 4)
  assert.equal(obsidianUrl('Live-in International', 'Tim/Poznámka A.md'), 'obsidian://open?vault=Live-in%20International&file=Tim%2FPozn%C3%A1mka%20A')
})

test('prijatý index sa očistí: zlé cesty, cudzie indexy a nadrozmerné údaje neprejdú', () => {
  const good = packIndex(buildIndex([{ ...parseNote('A/X.md', '[[Y]]') }, { ...parseNote('A/Y.md', '') }], { name: 'T' }))
  assert.equal(sanitizeIndex(good).stats.links, 1)
  assert.throws(() => sanitizeIndex({ ...good, n: [['../mimo.md', 'x', null, 0, [], []]] }), /cesta/)
  assert.throws(() => sanitizeIndex({ ...good, n: [['/abs.md', 'x', null, 0, [], []]] }), /cesta/)
  assert.throws(() => sanitizeIndex({ ...good, n: [['a.txt', 'x', null, 0, [], []]] }), /cesta/)
  assert.throws(() => sanitizeIndex({ ...good, n: [['a.md', 'x', null, 0, [], []], ['a.md', 'y', null, 0, [], []]] }), /opakovaná/)
  assert.throws(() => sanitizeIndex({ ...good, v: 99 }), /verzia/); assert.throws(() => sanitizeIndex({ nope: 1 }), /tvar/)
  const messy = sanitizeIndex({ ...good, n: [['a.md', 'x'.repeat(999), 'nie-datum', -5, [0, 1, 7, 'x', 1], ['t'.repeat(999)]], ['b.md', '', null, 3, [], []]] })
  assert.equal(messy.notes[0].title.length, 200); assert.equal(messy.notes[0].mtime, null); assert.equal(messy.notes[0].words, 0)
  assert.deepEqual(messy.notes[0].out, [1]); assert.equal(messy.notes[0].tags[0].length, 60); assert.equal(messy.notes[1].title, 'b')
})

test('čítanie z disku vynechá súkromné a skryté priečinky a symbolické odkazy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-vault-'))
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t) }
  w('Tim/A.md', '# A\n[[B]]'); w('Znalosti/B.md', '# B'); w('Pristupy_PRIVATE/Hesla.md', '# tajné'); w('.obsidian/x.md', '# cfg'); w('Tim/poznamka.txt', 'nie md'); w('Tim/moje hesla.md', '# x')
  fs.symlinkSync(path.join(root, 'Znalosti'), path.join(root, 'Odkaz'))
  const ix = scanVault(root, { name: 'T' })
  assert.deepEqual(ix.notes.map((n) => n.path).sort(), ['Tim/A.md', 'Znalosti/B.md']); assert.equal(ix.stats.links, 1); assert.ok(ix.notes[0].mtime)
  fs.rmSync(root, { recursive: true })
  for (const p of ['Pristupy_PRIVATE/a.md', 'x/.git/a.md', 'Tim/Passwords.md', '_obsidian_nastavenia_stare/a.md']) assert.ok(VAULT_SKIP.test(p), p)
  assert.equal(VAULT_SKIP.test('Tim/Noviny/2026-10-22.md'), false)
})
