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
