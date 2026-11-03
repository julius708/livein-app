import test from 'node:test'
import assert from 'node:assert/strict'
import { TESTS, TEST_KEYS, score, summary, latest, validAnswers, ranked } from '../lib/personality-tests.js'

test('každý test má položky, dimenzie a každá položka patrí do existujúcej dimenzie', () => {
  for (const k of TEST_KEYS) {
    const T = TESTS[k]
    assert.ok(T.items.length >= 8, k)
    for (const it of T.items) assert.ok(T.dims[it.d], `${k}: dimenzia ${it.d}`)
  }
})

test('skóre: samé „Určite áno“ dá 100 %, samé „Vôbec nie“ 0 %, obrátené položky sa otočia', () => {
  const all5 = TESTS.disc.items.map(() => 5)
  const sc = score('disc', all5)
  for (const d of Object.keys(sc)) assert.equal(sc[d], 100)
  const all1 = TESTS.big5.items.map(() => 1)
  const b = score('big5', all1)
  // Big Five má v každej dimenzii jednu obrátenú položku: 4 × 0 + 1 × 100 → 20 %
  for (const d of Object.keys(b)) assert.equal(b[d], 20)
})

test('zhrnutie: 16 typov dá štvorpísmenový typ, ostatné dve najsilnejšie dimenzie', () => {
  assert.equal(summary('t16', { E: 80, S: 20, T: 60, J: 10 }), 'ENTP')
  assert.equal(summary('roly', { L: 10, T: 90, R: 70, Z: 20, A: 30, P: 40 }), 'Tvorca + Realizátor')
})

test('overenie odpovedí a najnovší výsledok', () => {
  assert.equal(validAnswers('disc', TESTS.disc.items.map(() => 3)), true)
  assert.equal(validAnswers('disc', [1, 2]), false)
  assert.equal(validAnswers('disc', TESTS.disc.items.map(() => 7)), false)
  assert.equal(validAnswers('nic', []), false)
  const rows = [{ user_id: 'a', test_key: 'disc', created_at: '2026-01-01' }, { user_id: 'a', test_key: 'disc', created_at: '2026-02-01' }, { user_id: 'b', test_key: 'disc', created_at: '2026-01-15' }]
  const l = latest(rows)
  assert.equal(l.length, 2)
  assert.equal(l.find((r) => r.user_id === 'a').created_at, '2026-02-01')
  assert.equal(ranked('styl', { T: 10, S: 90, R: 50, K: 50 })[0].name, 'Samostatnosť')
})

// Tímový modul
import { position, similarity, teamAverage, pairs, compare, advice, byPerson, initials } from '../lib/personality-team.js'

test('tím: pozícia na mape je v rozsahu -1…1 a DISC D+I ide hore', () => {
  const p = position('disc', { D: 100, I: 100, S: 0, C: 0 })
  assert.equal(p.y, 1); assert.equal(p.x, 0)
  const q = position('disc', { D: 0, I: 0, S: 100, C: 100 })
  assert.equal(q.y, -1)
  for (const k of TEST_KEYS) { const r = position(k, {}); assert.ok(r.x >= -1 && r.x <= 1 && r.y >= -1 && r.y <= 1, k) }
})

test('tím: podobnosť 100 % pre rovnaké skóre, 0 % pre opačné; dvojice zoradené', () => {
  assert.equal(similarity('disc', { D: 50, I: 50, S: 50, C: 50 }, { D: 50, I: 50, S: 50, C: 50 }), 100)
  assert.equal(similarity('disc', { D: 0, I: 0, S: 0, C: 0 }, { D: 100, I: 100, S: 100, C: 100 }), 0)
  const list = [{ id: 'a', scores: { D: 90, I: 90, S: 20, C: 20 } }, { id: 'b', scores: { D: 85, I: 90, S: 25, C: 20 } }, { id: 'c', scores: { D: 10, I: 10, S: 90, C: 90 } }]
  const ps = pairs('disc', list)
  assert.equal(ps[0].a.id + ps[0].b.id, 'ab'); assert.ok(ps[ps.length - 1].sim < 30)
  assert.deepEqual(teamAverage('disc', list.slice(0, 2)), { D: 88, I: 90, S: 23, C: 20 })
})

test('tím: porovnanie, rada a zoskupenie podľa človeka', () => {
  const c = compare('disc', { D: 90, I: 50, S: 20, C: 20 }, { D: 20, I: 50, S: 25, C: 80 })
  assert.equal(c.same[0].d, 'I'); assert.equal(c.differ[0].d, 'D')
  const adv = advice('roly', { L: 10, T: 90, R: 70, Z: 20, A: 30, P: 40 })
  assert.equal(adv[0].d, 'T'); assert.ok(adv[0].text.length > 10)
  const people = byPerson([
    { user_id: 'u1', name: 'Zora', test_key: 'disc', created_at: '2026-01-01' },
    { user_id: 'u1', name: 'Zora', test_key: 'disc', created_at: '2026-02-01' },
    { user_id: 'u2', name: null, test_key: 'disc', created_at: '2026-01-01' },
  ])
  assert.equal(people.length, 2); assert.equal(people[1].name, 'Zora'); assert.equal(people[1].by.disc.created_at, '2026-02-01'); assert.equal(people[0].name, 'Kolega')
  assert.equal(initials('Simona Vargová'), 'SV')
})

import { partialScore, typeLabel } from '../lib/personality-tests.js'
test('priebežné skóre: nezodpovedané dimenzie sú null, zodpovedané sa počítajú', () => {
  const p = partialScore('disc', [5])
  assert.equal(p.D, 100); assert.equal(p.I, null)
  assert.equal(typeLabel('t16', 'ENTJ'), 'ENTJ · Veliteľ'); assert.equal(typeLabel('disc', 'X'), 'X')
})
