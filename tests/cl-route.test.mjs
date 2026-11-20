import test from 'node:test'
import assert from 'node:assert/strict'
import { orderStops, routeStats, travelMinutes, fmtDuration, googleRouteUrl, appleStopUrl, daySupplies, dayWorkMinutes } from '../lib/cl-route.js'

const P = (id, lat, lng, extra = {}) => ({ id, lat, lng, ...extra })
const home = { lat: 48.10, lng: 17.10 }

test('poradie: vždy najbližšia ďalšia zastávka, bez súradníc na koniec', () => {
  const a = P('a', 48.101, 17.101), b = P('b', 48.30, 17.30), c = P('c', 48.11, 17.11), x = { id: 'x' }
  assert.deepEqual(orderStops(home, [b, x, c, a]).map((s) => s.id), ['a', 'c', 'b', 'x'])
  assert.deepEqual(orderStops(null, [b, a, c]).map((s) => s.id), ['b', 'c', 'a']) // bez bydliska začína prvou zastávkou
  assert.deepEqual(orderStops(home, []), [])
  assert.deepEqual(orderStops(home, [x]).map((s) => s.id), ['x'])
})

test('trasa: dĺžka po úsekoch, späť domov, odhad času', () => {
  const o = [P('a', 48.101, 17.101), P('c', 48.11, 17.11)]
  const st = routeStats(home, o)
  assert.equal(st.legs.length, 2); assert.ok(st.km > 1 && st.km < 3)
  assert.ok(routeStats(home, o, { back: true }).km > st.km)
  assert.deepEqual(routeStats(null, [P('a', 1, 1)]), { km: 0, legs: [] })
  assert.equal(travelMinutes(10), 32); assert.equal(travelMinutes(0), 0)
  assert.equal(fmtDuration(45), '45 min'); assert.equal(fmtDuration(120), '2 h'); assert.equal(fmtDuration(150), '2 h 30 min')
})

test('odkazy do máp: Google s medzizastávkami a limitom, Apple pre jednu zastávku', () => {
  const o = [P('a', 48.1, 17.1), P('b', 48.2, 17.2), P('c', 48.3, 17.3)]
  const u = new URL(googleRouteUrl(home, o))
  assert.equal(u.searchParams.get('destination'), '48.3,17.3'); assert.equal(u.searchParams.get('waypoints'), '48.1,17.1|48.2,17.2'); assert.equal(u.searchParams.get('origin'), '48.1,17.1')
  assert.equal(googleRouteUrl(null, []), null)
  const many = Array.from({ length: 14 }, (_, i) => P('s' + i, 48 + i / 100, 17))
  assert.equal(new URL(googleRouteUrl(home, many)).searchParams.get('waypoints').split('|').length, 9)
  const byAddr = new URL(googleRouteUrl(null, [{ address: 'Hlavná 1', city: 'Bratislava' }]))
  assert.equal(byAddr.searchParams.get('destination'), 'Hlavná 1, Bratislava'); assert.equal(byAddr.searchParams.get('origin'), null)
  assert.match(appleStopUrl({ lat: 48.1, lng: 17.1, name: 'Byt 1' }), /ll=48\.1,17\.1&q=Byt%201/)
  assert.equal(appleStopUrl({}), null)
})

test('čo si zobrať: súčty kapsúl a bielizne, hostia, odhad práce', () => {
  const t = (id, snap, people) => ({ id, listing_id: id, people, snapshot: snap })
  const tasks = [t('L1', { capsules: [{ type: 'Nespresso', n: 2 }], linen: [{ label: 'Plachta', n: 3 }, { label: 'Vankúš', n: 6 }] }, 2), t('L2', { capsules: [{ type: 'Nespresso', n: 3 }, { type: 'Dolce Gusto', n: 1 }], linen: [{ label: 'Plachta', n: 2 }] }, 3), t('L3', {}, null)]
  const s = daySupplies(tasks)
  assert.deepEqual(s.capsules, [{ label: 'Dolce Gusto', n: 1 }, { label: 'Nespresso', n: 5 }])
  assert.deepEqual(s.linen, [{ label: 'Plachta', n: 5 }, { label: 'Vankúš', n: 6 }])
  assert.equal(s.people, 5)
  assert.equal(dayWorkMinutes(tasks, { L1: { est_minutes: 60 }, L2: { est_minutes: 100 } }), 60 + 100 + 90)
})
