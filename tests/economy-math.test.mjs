import test from 'node:test'
import assert from 'node:assert/strict'
import * as M from '../lib/economy-math.js'

const D = { rangeFrom: '2026-01-01', historicalTo: '2026-01-10', asOf: '2026-01-11', futureTo: '2026-01-20' }
const p = (over = {}) => ({ id: 'a', name: 'Byt A', city: 'Bratislava I', title: '', capacity: 4, active: true, overlaps: 0,
  revenueCents: Array.from({ length: 20 }, (_, i) => (i < 10 ? 10000 : 5000)), nightFlags: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : 0)),
  arrivals: Array.from({ length: 20 }, (_, i) => (i % 5 === 0 ? 1 : 0)), cancelledArrivals: Array.from({ length: 20 }, (_, i) => (i === 3 ? 1 : 0)),
  channelDays: { '0|Booking.com': 10000, '1|airbnb': 10000, '15|airbnb': 5000 }, ...over })

test('range a preset', () => {
  assert.deepEqual(M.range(D, '2026-01-01', '2026-01-10'), [0, 9])
  assert.equal(M.range(D, '2026-01-05', '2026-01-02'), null)
  assert.equal(M.range(D, '2025-12-31', '2026-01-02'), null)
  assert.deepEqual(M.preset(D, 'history'), [0, 9])
  assert.deepEqual(M.preset(D, 'future'), [10, 19])
  assert.deepEqual(M.previous(D, [5, 9]), [0, 4])
  assert.equal(M.previous(D, [0, 9]), null)
  assert.deepEqual(M.previous(D, [3, 9]), [0, 2])
})

test('stats, totals, obsadenosť', () => {
  const r = M.stats(p(), [0, 9])
  assert.equal(r.revenue, 1000); assert.equal(r.nights, 5); assert.equal(r.adr, 200); assert.equal(r.arrivals, 2); assert.equal(r.cancelled, 1)
  assert.equal(Math.round(r.storno), 33); assert.equal(r.occupancy, 50); assert.equal(r.value, 50)
  const t = M.totals([r, M.stats(p({ id: 'b' }), [0, 9])])
  assert.equal(t.revenue, 2000); assert.equal(t.occupancy, 50); assert.equal(t.revpan, 100); assert.equal(t.units, 2)
})

test('kanály, rady a mesiace', () => {
  const rows = [M.stats(p(), [0, 19])]
  assert.deepEqual(M.channels(rows, [0, 9]), { 'Booking.com': 10000, airbnb: 10000 })
  assert.deepEqual(M.channels(rows, [10, 19]), { airbnb: 5000 })
  const s = M.series(rows, [0, 19], 7, false)
  assert.equal(s.length, 3); assert.equal(s[0].cents, 70000); assert.equal(s[2].days, 6)
  const m = M.monthly(D, rows, [0, 19])
  assert.equal(m.length, 1); assert.equal(m[0].key, '2026-01'); assert.equal(m[0].revenue, 1500); assert.equal(m[0].occupancy, 50)
})

test('filtre a mestá', () => {
  assert.equal(M.cityOf({ city: 'Bratislava - Old Town' }), 'Bratislava'); assert.equal(M.cityOf({ city: 'Old Town, Košice' }), 'Košice'); assert.equal(M.cityOf({ city: 'Trnava' }), 'Trnava')
  const f = { ...M.EMPTY_FILTERS }
  assert.equal(M.matches(p(), f), true)
  assert.equal(M.matches(p({ active: false }), f), false)
  assert.equal(M.matches(p({ active: false }), { ...f, scope: 'all' }), true)
  assert.equal(M.matches(p(), { ...f, q: 'byt a' }), true); assert.equal(M.matches(p(), { ...f, q: 'xyz' }), false)
  assert.equal(M.matches(p(), { ...f, city: 'Košice' }), false)
  assert.equal(M.matches(p({ overlaps: 2 }), { ...f, quality: 'overlap' }), true); assert.equal(M.matches(p(), { ...f, quality: 'overlap' }), false)
})

test('simulácia je deterministická a ohraničená', () => {
  const a = M.simulate(1000, 2000, M.DEFAULT_FORECAST), b = M.simulate(1000, 2000, M.DEFAULT_FORECAST)
  assert.equal(a.p50, b.p50); assert.ok(a.p10 <= a.p50 && a.p50 <= a.p90); assert.equal(a.values.length, 2000)
  assert.equal(a.retained, 950); assert.equal(a.extra, 500); assert.equal(a.base, 1450)
})

test('banka a csv', () => {
  const b = { rows: [{ entity: 'X', account: '0001', from: '2026-01-01', to: '2026-01-31', openingCents: 0, closingCents: 100, creditCents: 300, debitCents: 200, count: 3, infoCount: 0, differenceCents: 0 }, { entity: 'X', account: '0002', from: '2026-02-01', to: '2026-02-28', openingCents: 100, closingCents: 50, creditCents: 50, debitCents: 100, count: 2, infoCount: 0, differenceCents: 0 }] }
  const m = M.bankMonths(b, { entity: 'X', from: '2026-01', to: '2026-02' })
  assert.equal(m.list.length, 2); assert.equal(m.credit, 350); assert.equal(m.closing, 50)
  assert.equal(M.bankMonths(b, { entity: 'X', account: '0001', from: '2026-01', to: '2026-02' }).list.length, 1)
  const c = M.csv(['a', 'b'], [['=x', 1]])
  assert.ok(c.includes('"\'=x";"1"'))
})
