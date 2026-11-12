// Ústredňa – finančný prehľad z podkladu Ekonomiky. Syntetický snímok, žiadne firemné čísla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { economySummary } from '../lib/hq-economy.js'

const DAY = 86400000
function snapshot() {
  const rangeFrom = '2026-09-01', futureTo = '2026-12-31', n = Math.round((Date.parse(futureTo) - Date.parse(rangeFrom)) / DAY) + 1
  const day = (s) => Math.round((Date.parse(s) - Date.parse(rangeFrom)) / DAY)
  const mk = (id, active, cents) => { const revenueCents = new Array(n).fill(0), nightFlags = new Array(n).fill(0), arrivals = new Array(n).fill(0), cancelledArrivals = new Array(n).fill(0); for (let i = 0; i < n; i++) { const m = new Date(Date.parse(rangeFrom) + i * DAY).toISOString().slice(5, 7); if (cents[m]) { revenueCents[i] = cents[m]; nightFlags[i] = 1 } } return { id, name: id, city: 'Mesto', active, capacity: 2, bedrooms: 1, revenueCents, nightFlags, arrivals, cancelledArrivals, channelDays: {} } }
  return { rangeFrom, futureTo, asOf: '2026-11-12', historicalTo: '2026-11-11', listings: [mk('a', true, { '10': 10000, '11': 20000, '12': 5000 }), mk('b', true, { '11': 10000 }), mk('c', false, { '11': 99900 })], day }
}

test('prehľad mesiaca: výnos, noci, obsadenosť, porovnanie s minulým mesiacom; neaktívne byty sa nerátajú', () => {
  const e = economySummary(snapshot())
  assert.equal(e.units, 2)
  assert.equal(e.month.key, '2026-11'); assert.equal(e.month.revenue, 30 * 200 + 30 * 100); assert.equal(e.month.nights, 60); assert.equal(e.month.occupancy, 100); assert.equal(e.month.adr, 150)
  assert.equal(e.toDate, 12 * 300)                                  // 1.–12. 11.
  assert.equal(e.prev.revenue, 31 * 100); assert.equal(e.vsPrev, Math.round(((9000 - 3100) / 3100) * 100))
  assert.equal(e.next.revenue, 31 * 50); assert.equal(e.lastYear, null); assert.equal(e.vsLastYear, null)   // rok dozadu snímok nepokrýva
  assert.deepEqual(e.months.map((m) => [m.key, m.kind]), [['2026-09', 'past'], ['2026-10', 'past'], ['2026-11', 'current'], ['2026-12', 'booked']])
  assert.equal(e.months[0].revenue, 0); assert.equal(e.months[0].occupancy, 0)
})

test('neúplný alebo prázdny snímok nedá žiadne čísla', () => {
  assert.equal(economySummary(null), null); assert.equal(economySummary({}), null)
  const s = snapshot(); s.listings.forEach((p) => { p.active = false })
  assert.equal(economySummary(s), null)
  const late = snapshot(); late.asOf = '2027-03-01'
  assert.equal(economySummary(late), null)
})
