import test from 'node:test'
import assert from 'node:assert/strict'
import { dupHeads, tileName, headOf, normalizeRows, rowOf, sortUnits, board, tileState, applyTake, applyReturn, owedBy, overdue, dayList, matches, personOptions, canKeys } from '../lib/keys-core.js'

const U = (id, name, hook, sets = 1, out = 0, holders = []) => ({ listing_id: id, listing_name: name, hook_no: hook, sets, out_sets: out, holders, active: true })

test('rady: normalizácia a zaradenie pozície', () => {
  const rows = normalizeRows([{ row: 2, from: 10, to: 20 }, { row: 1, from: 1, to: 9 }, { from: 'x', to: 3 }])
  assert.equal(rows.length, 2); assert.equal(rows[0].row, 1)
  assert.equal(rowOf(rows, 15), 2); assert.equal(rowOf(rows, 99), null)
  assert.equal(normalizeRows(null).length, 3)
})

test('radenie: pozície podľa čísla, nezaradené abecedne po slovensky', () => {
  const s = sortUnits([U('a', 'Žilinská', null), U('b', 'Dunajská 1', 12), U('c', 'Hlavatého', null), U('d', 'Krížna', 3), U('e', 'Chorvátska', null)])
  assert.deepEqual(s.map((u) => u.listing_name), ['Krížna', 'Dunajská 1', 'Hlavatého', 'Chorvátska', 'Žilinská'])
})

test('tabuľa: prázdne háčiky, byty mimo rozsahu a nezaradené', () => {
  const b = board([U('a', 'A', 1), U('b', 'B', 5), U('c', 'C', null)], [{ row: 1, from: 1, to: 3 }])
  assert.equal(b.rows[0].hooks.length, 3); assert.equal(b.rows[0].hooks[0].unit.listing_name, 'A'); assert.equal(b.rows[0].hooks[1].unit, null)
  assert.equal(b.outside[0].listing_name, 'B'); assert.equal(b.unplaced[0].listing_name, 'C')
})

test('stav dlaždice', () => {
  assert.equal(tileState(U('a', 'A', 1, 2, 0)), 'ok'); assert.equal(tileState(U('a', 'A', 1, 2, 1)), 'part')
  assert.equal(tileState(U('a', 'A', 1, 2, 2)), 'out'); assert.equal(tileState(U('a', 'A', 1, 0, 0)), 'none')
})

test('zobratie a vrátenie sád', () => {
  const me = { name: 'Meno 1', email: 'm1@x.sk' }
  let u = U('a', 'A', 1, 2)
  let r = applyTake(u, me, 1, '2026-11-09T07:00:00Z', 'm1'); assert.equal(r.out_sets, 1); assert.equal(r.holders.length, 1)
  u = { ...u, ...r }
  r = applyTake(u, { name: 'Meno 2' }, 1, '2026-11-09T07:05:00Z'); u = { ...u, ...r }; assert.equal(u.out_sets, 2)
  assert.ok(applyTake(u, me, 1).error)
  r = applyReturn(u, me, 1); assert.equal(r.out_sets, 1); assert.equal(r.mismatch, false); assert.equal(r.holders[0].name, 'Meno 2')
  u = { ...u, ...r }
  r = applyReturn(u, { name: 'Niekto iný' }, 1); assert.equal(r.out_sets, 0); assert.equal(r.mismatch, true); assert.equal(r.holders.length, 0)
  assert.ok(applyReturn({ ...u, ...r }, me, 1).error)
})

test('dlžníci a oneskorenie', () => {
  const units = [U('a', 'A', 1, 1, 1, [{ name: 'Meno 1', email: 'm1@x.sk', sets: 1, at: '2026-11-08T06:00:00Z' }]), U('b', 'B', 2, 1, 1, [{ name: 'Meno 2', sets: 1, at: '2026-11-09T06:00:00Z' }])]
  assert.equal(owedBy(units, { name: 'Meno 1', email: 'm1@x.sk' }).length, 1)
  const od = overdue(units, 24, Date.parse('2026-11-09T07:00:00Z')); assert.equal(od.length, 1); assert.equal(od[0].name, 'Meno 1'); assert.equal(od[0].hours, 25)
})

test('zoznam podľa tašiek a hľadanie', () => {
  const units = [U('a', 'Žilinská', 7), U('b', 'Dunajská', 2)]
  const l = dayList([{ id: 'p1', listing_id: 'a', listing_name: 'Zilinska', date: '2026-11-09', status: 'todo' }, { id: 'p2', listing_id: 'b', listing_name: 'Dunajská', date: '2026-11-09', status: 'cancelled' }, { id: 'p3', listing_id: 'x', listing_name: 'Nový byt', date: '2026-11-09', status: 'packed' }], units)
  assert.deepEqual(l.map((x) => x.listing_name), ['Nový byt', 'Žilinská']); assert.equal(l[1].hook_no, 7); assert.equal(l[0].key, 'unknown')
  assert.ok(matches(units[0], 'zilin')); assert.ok(matches(units[0], '7')); assert.ok(!matches(units[1], '7')); assert.ok(matches(units[1], ''))
})

test('osoby bez technických účtov a duplicít', () => {
  const p = personOptions([{ name: 'LIVE-IN automatizácia', email: 'bot@x' }, { name: 'Angelika Jankóová', email: 'a@x.sk' }, { name: 'Zákaznícky servis (info)', email: 'info@x' }], [{ display_name: 'Angelika' }, { display_name: 'Zuzka' }, { display_name: 'crm-bot' }, { display_name: 'knititsewit.com' }])
  assert.deepEqual(p.map((x) => x.name), ['Angelika Jankóová', 'Zuzka'])
  assert.ok(canKeys({ roles: ['cleaning'] })); assert.ok(!canKeys({ roles: ['marketing'] }))
})

test('názov na dlaždici: krátky, ale jednoznačný', () => {
  const units = [U('a', 'Eurovea, 1 Danube', 115), U('b', 'Eurovea, 2 Sky', 116), U('c', '29. Augusta, Grand', 10), U('d', 'Modrá Guľa 2 (2nd Floor)', 124), U('e', 'Skypark, Luxury I', 55), U('f', 'Skypark Luxe I', 50)]
  const d = dupHeads(units)
  assert.equal(headOf('Modrá Guľa 2 (2nd Floor)'), 'Modrá Guľa 2')
  assert.equal(tileName('29. Augusta, Grand', d), '29. Augusta')
  assert.equal(tileName('Eurovea, 1 Danube', d), 'Eurovea · 1 Danube')
  assert.equal(tileName('Skypark, Luxury I', d), 'Skypark · Luxury I')
  assert.equal(tileName('Skypark Luxe I', d), 'Skypark Luxe I')
})
