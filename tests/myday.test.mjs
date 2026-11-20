import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCards, daySummary } from '../lib/myday.js'

const cleaner = { today: [{ id: 'u1', listing_name: 'Byt 1', status: 'todo' }, { id: 'u2', listing_name: 'Byt 2', status: 'in_progress' }, { id: 'u3', listing_name: 'Byt 3', status: 'done' }], tomorrow: [{}], fresh: 1 }
const manager = { unassigned: 3, total: 10, done: 4, inProgress: 2, alerts: 1, problems: 0, applications: 2 }
const hf = { arrivals: 5, departures: 4, tomorrow_arrivals: 6, guests_in_house: 30 }
const hw = { today_todo: 7, today_packed: 3, today_same_day: 1, tomorrow_total: 9 }
const ids = (cards) => cards.map((c) => c.id)

test('upratovačka vidí len svoju kartu a nové upratovania; hotové byty sa v zozname neukazujú', () => {
  const c = buildCards({ cleaner, hf, hw, leads: { fresh: 2, overdue: 1 }, maint: 4, mentions: 0 }, { roles: ['cleaning'], isAdmin: false })
  assert.deepEqual(ids(c), ['cleaner', 'laundry']) // cleaning vidí aj Práčovňu, nie príchody, leady ani údržbu
  const k = c[0]
  assert.deepEqual({ big: k.big.value, urgent: k.urgent }, { big: 2, urgent: true })
  assert.deepEqual(k.items.map((i) => i.text), ['Byt 1', 'Byt 2']); assert.equal(k.items[1].tag, 'prebieha')
  assert.ok(k.stats.some((s) => s.l === 'nové' && s.hot))
  assert.equal(k.cta.href, '/uprat?u=u2') // rozbehnutý byt má prednosť pred čakajúcim
  assert.match(k.cta.label, /Ďalší byt: Byt 2/)
})

test('hotové upratovanie dá zelený stav a bez nových nie je naliehavé', () => {
  const done = { today: [{ listing_name: 'A', status: 'done' }], tomorrow: [], fresh: 0 }
  const k = buildCards({ cleaner: done }, { roles: ['cleaning'], isAdmin: false })[0]
  assert.equal(k.urgent, false); assert.equal(k.big.label, 'všetko hotové')
  const none = buildCards({ cleaner: { today: [], tomorrow: [], fresh: 0 } }, { roles: ['cleaning'], isAdmin: false })[0]
  assert.equal(none.big.value, '–'); assert.equal(none.cta.href, '/uprat')
})

test('manažér: nepriradené byty, upozornenia a tlačidlo vedie k rozdeleniu; naliehavé karty idú hore', () => {
  const c = buildCards({ manager, hf, hw, leads: { fresh: 4, overdue: 0 }, maint: 0, mentions: 2 }, { roles: ['operations'], isAdmin: false })
  assert.deepEqual(ids(c), ['cleaning-manager', 'laundry', 'mentions', 'reservations']) // naliehavé: upratovanie, práčovňa, označenia; potom prehľady
  const m = c[0]
  assert.equal(m.big.value, 3); assert.equal(m.cta.href, '/upratovanie?tab=plan'); assert.ok(m.stats.some((s) => s.l === 'upozornení'))
  assert.ok(!ids(c).includes('leads')) // operácie leady nevidia
  const calm = buildCards({ manager: { ...manager, unassigned: 0, alerts: 0, problems: 0 } }, { roles: ['operations'], isAdmin: false })[0]
  assert.equal(calm.urgent, false); assert.equal(calm.cta.href, '/upratovanie')
})

test('admin vidí všetko dostupné, CRM len leady, bez údajov sa karta nevytvorí', () => {
  const all = buildCards({ manager, hf, hw, leads: { fresh: 1, overdue: 2 }, maint: 3, mentions: 0 }, { roles: ['admin'], isAdmin: true })
  assert.deepEqual(new Set(ids(all)), new Set(['cleaning-manager', 'reservations', 'laundry', 'leads', 'maint']))
  assert.equal(all[0].urgent, true)
  const crm = buildCards({ hf, hw, leads: { fresh: 5, overdue: 0 }, maint: 2 }, { roles: ['crm'], isAdmin: false })
  assert.deepEqual(ids(crm), ['leads'])
  assert.deepEqual(buildCards({}, { roles: ['admin'], isAdmin: true }), [])
  assert.deepEqual(buildCards({ maint: 0, mentions: 0 }, { roles: [], isAdmin: false }), [])
})

test('veta dňa: bez kariet, pokojný deň, naliehavé veci', () => {
  assert.match(daySummary([]), /nič konkrétne/)
  assert.match(daySummary([{ urgent: false }]), /Všetko je v poriadku/)
  assert.equal(daySummary([{ urgent: true }, { urgent: true }, { urgent: false }]), 'Čaká ťa 2 veci, ktoré treba pozrieť ako prvé.')
  assert.match(daySummary([{ urgent: true }]), /Čaká ťa 1 vec,/)
})
