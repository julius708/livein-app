// Ústredňa – agenti: zoznam rolí sa skladá z dôkazov. Rozvrh sám osebe nikdy neznamená, že rola dodáva.
import test from 'node:test'
import assert from 'node:assert/strict'
import { roleOf, rruleText, cronText, sanitizeAgents, brainByRole, buildAgents, AGENTS_VERSION } from '../lib/hq-agents.js'

const NOW = Date.parse('2026-11-12T22:00:00Z')
const h = (n) => new Date(NOW - n * 3600e3).toISOString()
const snap = (x = {}) => sanitizeAgents({ v: AGENTS_VERSION, asOf: h(0), roles: [], schedules: [], outputs: [], slack: [], coverage: [], ...x })

test('ID roly sa číta z názvu rozvrhu a neplete si bežné slová', () => {
  assert.equal(roleOf('LIVE-IN A15 — Vyúčtovanie majiteľov'), 'A15')
  assert.equal(roleOf('LIVE-IN A6b — produkty, zľavy a dostupnosť'), 'A6b')
  assert.equal(roleOf('A27 Mira – e-mailová agentúra'), 'A27')
  assert.equal(roleOf('[P3] STAV'), 'P3')
  assert.equal(roleOf('S-A11P · Poklesy portfólia'), 'S-A11P')
  for (const s of ['APP – priebežné vylepšovanie aplikácií', '3CX monitoring hovorov', 'LIVE-IN · Obnova investičných ADR', 'B2B kampaň', 'Weekday Morning Brief', 'Koordinácia agentov cez Slack', '']) assert.equal(roleOf(s), null, s)
})

test('rozvrhy sa prepíšu po slovensky', () => {
  assert.equal(rruleText('FREQ=MINUTELY;INTERVAL=30'), 'každých 30 min')
  assert.equal(rruleText('FREQ=HOURLY;BYMINUTE=42;BYSECOND=0'), 'každú hodinu (:42)')
  assert.equal(rruleText('FREQ=DAILY;BYHOUR=7;BYMINUTE=30;BYSECOND=0'), 'denne 07:30')
  assert.equal(rruleText('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=30;BYSECOND=0'), 'po–pi 07:30')
  assert.equal(cronText('CRON_TZ=Europe/Bratislava 43 7 * * 1'), 'po 07:43')
  assert.equal(cronText('CRON_TZ=Europe/Bratislava 42 9,16 * * *'), 'denne 09:42 a 16:42')
  assert.equal(cronText('CRON_TZ=Europe/Bratislava 17 8-20 * * *'), 'každú hodinu 8–20 h (:17)')
  assert.equal(cronText('11 9 3 * *'), '3. deň v mesiaci 09:11')
})

test('prijatý prehľad sa očistí: neznáme polia, zlé roly a zlé časy vypadnú', () => {
  assert.throws(() => sanitizeAgents({ v: 99, asOf: h(0) }), /formát/)
  assert.throws(() => sanitizeAgents({ v: AGENTS_VERSION, asOf: 'včera' }), /čas/)
  const s = sanitizeAgents({ v: AGENTS_VERSION, asOf: h(0), secret: 'x',
    roles: [{ id: 'A1', name: 'Atlas', func: 'Koordinátor', prompt: 'tajné zadanie' }, { id: 'A1', name: 'duplikát' }, { id: '../etc', name: 'zlé' }],
    schedules: [{ runtime: 'GPT', role: 'A15', name: 'LIVE-IN A15', every: 'každú hodinu', active: 1, lastRun: h(1), prompt: 'tajné' }, { runtime: 'Iné', name: 'x' }, { runtime: 'Claude', name: '' }],
    outputs: [{ runtime: 'Claude', role: 'A7', where: 'Disk', files: 66.4, last: h(5), path: '/Users/x' }, { runtime: 'Claude', role: null, files: 1 }],
    slack: [{ runtime: 'Claude', role: 'A19', last: h(3), count: 14, text: 'obsah správy' }, { role: 'A2', last: 'nie čas' }],
    asks: [{ role: 'A19', at: h(3), text: 'Kto je vlastník leadov?', context: 'A19 hlási…', url: 'javascript:alert(1)' }, { role: 'A19', text: 'bez času' }],
    coverage: ['Slack: 120 správ'] })
  assert.deepEqual(Object.keys(s).sort(), ['asOf', 'asks', 'coverage', 'outputs', 'roles', 'schedules', 'slack', 'v'])
  assert.deepEqual(s.roles, [{ id: 'A1', name: 'Atlas', func: 'Koordinátor' }])
  assert.deepEqual(s.schedules, [{ runtime: 'GPT', role: 'A15', name: 'LIVE-IN A15', every: 'každú hodinu', active: true, lastRun: h(1), ok: null }])
  assert.deepEqual(s.outputs, [{ runtime: 'Claude', role: 'A7', where: 'Disk', files: 66, last: h(5), learn: 0, learnLast: null }])
  assert.deepEqual(s.slack, [{ runtime: 'Claude', role: 'A19', last: h(3), count: 14 }])
  assert.deepEqual(s.asks, [{ role: 'A19', at: h(3), text: 'Kto je vlastník leadov?', context: 'A19 hlási…' }])
  assert.ok(!JSON.stringify(s).includes('tajné') && !JSON.stringify(s).includes('obsah správy'))
})

test('zapnutý rozvrh bez výstupu nie je „Dodáva“', () => {
  const v = buildAgents(snap({
    schedules: [
      { runtime: 'GPT', role: 'A18', name: 'LIVE-IN A18 — Zavádzanie bytov', every: 'každú hodinu (:51)', active: true, lastRun: h(1) },
      { runtime: 'GPT', role: 'A6b', name: 'LIVE-IN A6b — produkty', every: 'každú hodinu (:57)', active: true, lastRun: h(1) },
      { runtime: 'Claude', role: 'A28', name: 'A28 Dom – reporty pre majiteľov', every: '3. deň v mesiaci 09:11', active: true, lastRun: h(9 * 24), ok: true },
      { runtime: 'GPT', role: 'A15', name: 'LIVE-IN A15 — Vyúčtovanie majiteľov', every: 'každú hodinu (:42)', active: true, lastRun: h(1) },
      { runtime: 'GPT', role: null, name: 'Weekday Morning Brief', every: 'po–pi 07:30', active: true, lastRun: h(15) },
      { runtime: 'GPT', role: null, name: 'Presun na doménu', every: 'denne 21:30', active: false },
    ],
    outputs: [{ runtime: 'GPT', role: 'A6b', where: 'Codex · pracovný priečinok', files: 40, last: h(12) }, { runtime: 'Claude', role: 'A28', where: 'Disk · Vystupy_agentov', files: 2, last: h(9 * 24) }, { runtime: 'GPT', role: 'A10', where: 'Codex · pracovný priečinok', files: 3, last: h(31 * 24) }, { runtime: 'Claude', role: 'A15', where: 'Disk · Vystupy_agentov', files: 3, last: h(10 * 24) }],
    slack: [{ runtime: 'Claude', role: 'A19', last: h(4), count: 14 }],
    roles: [{ id: 'A18', func: 'Zavádzanie bytov' }, { id: 'A9', func: 'Editor obsahu' }],
  }), null, NOW)
  const by = Object.fromEntries(v.roles.map((r) => [r.id, r]))
  assert.equal(by.A18.state, 'idle')          // beží každú hodinu, výstup žiadny
  assert.equal(by.A6b.state, 'delivering')    // súbor pred 12 h
  assert.equal(by.A28.state, 'scheduled')     // mesačný rozvrh, výstup pred 9 dňami
  assert.equal(by.A19.state, 'delivering')    // hlásenie v Slacku pred 4 h, bez rozvrhu v prehľade
  assert.equal(by.A10.state, 'quiet')         // starý výstup, žiadny rozvrh
  assert.equal(by.A9.state, 'registered')     // len meno
  assert.equal(by.A15.state, 'idle')          // hodinový rozvrh GPT bez výstupu GPT; výstup Claude spred 10 dní ho neospravedlní
  assert.equal(by.A19.claude.lastWhere, 'Slack #ai-tim')
  assert.equal(by.A6b.gpt.lastWhere, 'Codex · pracovný priečinok')
  assert.equal(by.A28.func, 'reporty pre majiteľov')
  assert.deepEqual(v.other.map((o) => o.name), ['Weekday Morning Brief', 'Presun na doménu'])
  assert.deepEqual([v.totals.roles, v.totals.delivering, v.totals.idle, v.totals.scheduled, v.totals.quiet, v.totals.registered], [7, 2, 2, 1, 1, 1])
  assert.deepEqual([v.totals.gpt.schedules, v.totals.gpt.active, v.totals.gpt.roleSchedules, v.totals.gpt.delivering], [5, 4, 3, 1])
  assert.deepEqual([v.totals.claude.active, v.totals.claude.delivering], [1, 1])
  assert.equal(v.stale, false)
})

test('starý prehľad sa označí ako neaktuálny a stav sa počíta k času zberu', () => {
  const old = sanitizeAgents({ v: AGENTS_VERSION, asOf: h(72), slack: [{ runtime: 'Claude', role: 'A1', last: h(80), count: 1 }] })
  const v = buildAgents(old, null, NOW)
  assert.equal(v.stale, true)
  assert.equal(v.roles[0].state, 'delivering')   // k času zberu bola rola čerstvá; obrazovka k tomu ukáže, že prehľad je starý
})

test('zápisy v Braine: priečinok Claude sú zápisy Claude, meno roly je z nadpisu indexu', () => {
  const ix = { syncedAt: h(0), notes: [
    { path: 'Agenti/A1/00_Index.md', title: 'Atlas · A1', mtime: h(700) },
    { path: 'Agenti/A1/2026-10-13_Dokaz_odovzdania.md', title: 'Dôkaz', mtime: h(690) },
    { path: 'Agenti/A1/Claude/00_Prevzatie.md', title: 'Prevzatie', mtime: h(680) },
    { path: 'Agenti/00_REGISTER.md', title: 'Register', mtime: h(10) },
    { path: 'Znalosti/x.md', title: 'x', mtime: h(1) },
  ] }
  const b = brainByRole(ix)
  assert.deepEqual([...b.keys()], ['A1'])
  assert.deepEqual([b.get('A1').notes, b.get('A1').claudeNotes, b.get('A1').otherNotes, b.get('A1').name], [3, 1, 2, 'Atlas'])
  const v = buildAgents(null, ix, NOW)
  assert.equal(v.hasSnapshot, false)
  assert.deepEqual([v.roles[0].id, v.roles[0].name, v.roles[0].state], ['A1', 'Atlas', 'quiet'])
  assert.equal(v.totals.brainLastClaude, h(680))
  // meno z Brainu má prednosť pred menom, ktoré prišlo v prehľade
  assert.equal(buildAgents(snap({ roles: [{ id: 'A1', name: 'Marketing' }] }), ix, NOW).roles[0].name, 'Atlas')
  assert.equal(buildAgents(null, null, NOW), null)
  assert.equal(buildAgents(null, { notes: [] }, NOW), null)
})

test('otázky rolí na vedenie prejdú s menom roly, najnovšie prvé', () => {
  const v = buildAgents(snap({ roles: [{ id: 'A19', name: 'Orion' }], asks: [{ role: 'A2', at: h(10), text: 'Kto schvaľuje SOP?' }, { role: 'A19', at: h(4), text: 'Ktorí agenti majú bežať?', context: 'A19 hlási…' }] }), null, NOW)
  assert.deepEqual(v.asks.map((a) => [a.role, a.name, a.text]), [['A19', 'Orion', 'Ktorí agenti majú bežať?'], ['A2', '', 'Kto schvaľuje SOP?']])
})

test('denné učenie medzi výstupmi je zápis poznatkov, aj keď priečinok roly v trezore mlčí', () => {
  const ix = { syncedAt: h(0), notes: [{ path: 'Agenti/A19/2026-10-19_Poznamka.md', title: 'Poznámka', mtime: h(25 * 24) }, { path: 'Agenti/A11/Claude/Poznatok.md', title: 'Poznatok', mtime: h(30 * 24) }] }
  const v = buildAgents(snap({
    outputs: [
      { runtime: 'Claude', role: 'A11', where: 'Disk · Zrkadlo_Obsidian/Vystupy_agentov', files: 97, last: h(5), learn: 12, learnLast: h(5) },
      { runtime: 'Claude', role: 'A11', where: 'Disk · Live-in/Vystupy_agentov', files: 13, last: h(4 * 24), learn: 3, learnLast: h(4 * 24) },
      { runtime: 'Claude', role: 'A27', where: 'Disk · Live-in/Vystupy_agentov', files: 24, last: h(2) },
      { runtime: 'GPT', role: 'A6b', where: 'Codex · pracovný priečinok', files: 40, last: h(3), learn: 1, learnLast: h(32 * 24) },
      { runtime: 'Claude', role: 'A5', where: 'Disk', files: 3, last: h(1), learn: -4, learnLast: 'včera' },
    ],
  }), ix, NOW)
  const by = Object.fromEntries(v.roles.map((r) => [r.id, r]))
  assert.deepEqual(by.A11.learn, { notes: 15, last: h(5) })     // oba priečinky výstupov spolu, čas najnovšieho
  assert.equal(by.A11.claude.files, 110)
  assert.equal(by.A27.learn, null)                              // výstup áno, učenie nie
  assert.equal(by.A5.learn, null)                               // nezmyselný počet a čas vypadnú
  assert.equal(by.A19.learn, null)
  assert.equal(by.A19.brain.last, h(25 * 24))
  const t = v.totals
  assert.deepEqual([t.learnRoles, t.learnFresh], [2, 1])        // A11 a A6b; čerstvé len A11
  assert.equal(t.brainLast, h(25 * 24))                         // priečinky rolí v trezore: staré
  assert.equal(t.knowLast, h(5))                                // posledný zápis poznatkov: dnešné učenie
  assert.deepEqual([t.knowLastClaude, t.knowLastGpt], [h(5), h(25 * 24)])
  assert.equal(t.learnLastGpt, h(32 * 24))
})

test('prehľad bez učenia (staršia verzia zberu) sa číta ďalej', () => {
  const v = buildAgents(snap({ outputs: [{ runtime: 'Claude', role: 'A7', where: 'Disk', files: 5, last: h(2) }] }), null, NOW)
  assert.equal(v.roles[0].learn, null)
  assert.deepEqual([v.totals.learnRoles, v.totals.learnLast, v.totals.knowLast], [0, null, null])
})

test('zber výstupov spočíta súbory učenia zvlášť a spojí priečinky tej istej roly', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
  const { scanOutputs } = await import('../lib/hq-agents-fs.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-out-'))
  const put = (rel, when) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); fs.utimesSync(f, when, when) }
  const d = (n) => new Date(NOW - n * 86400e3)
  put('A11/2026-11-13_A11.md', d(0)); put('A11/2026-11-12_A11_UCENIE.md', d(1)); put('A11/2026-11-09_A11_ucenie.md', d(4)); put('A11_sensitive/poznamka.md', d(2))
  put('A27/latest.md', d(0)); put('Poznamky/UCENIE.md', d(0)); put('A3/.skryte/2026_UCENIE.md', d(0))
  try {
    const out = Object.fromEntries(scanOutputs(root, { runtime: 'Claude', where: 'Disk' }).map((o) => [o.role, o]))
    assert.deepEqual(Object.keys(out).sort(), ['A11', 'A27'])   // priečinok bez ID roly a skryté súbory sa nepočítajú
    assert.deepEqual([out.A11.files, out.A11.learn], [4, 2])
    assert.equal(out.A11.last, d(0).toISOString())
    assert.equal(out.A11.learnLast, d(1).toISOString())
    assert.deepEqual([out.A27.learn, out.A27.learnLast], [0, null])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
