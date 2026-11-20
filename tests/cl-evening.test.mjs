import test from 'node:test'
import assert from 'node:assert/strict'
import { eveningPlan, assignmentItems } from '../lib/cl-evening.js'

const S = (email, extra = {}) => ({ email, name: email.split('@')[0], role: 'cleaner', active: true, lat: 48.14, lng: 17.10, work_days: [1, 2, 3, 4, 5, 6, 7], days_off: [], max_per_day: 3, max_per_week: 0, max_distance_km: 0, excluded_listings: [], preferred_localities: [], ...extra })
const T = (id, listing, date, extra = {}) => ({ id, listing_id: listing, listing_name: 'Byt ' + listing, date, status: 'todo', cleaner_email: null, ...extra })
const plan = (extra = {}) => ({
  staff: [S('anna@x'), S('beata@x'), S('boss@x', { role: 'manager' })],
  flats: [{ listing_id: 'L1', lat: 48.15, lng: 17.11, city: 'Bratislava' }, { listing_id: 'L2', lat: 48.16, lng: 17.12 }, { listing_id: 'L3', lat: 48.17, lng: 17.13 }],
  tasks: [T('1', 'L1', '2026-11-24'), T('2', 'L2', '2026-11-24'), T('3', 'L3', '2026-11-24', { cleaner_email: 'anna@x' }), T('4', 'L1', '2026-11-25')],
  history: [], settings: {}, ...extra,
})

test('večerný beh: návrh pre manažérov a pripomienky len tým, čo majú byty zajtra', () => {
  const r = eveningPlan({ plan: plan(), day: '2026-11-24' })
  assert.equal(r.counts.open, 2)
  assert.equal(r.proposal.assignments.length, 2)
  const mgr = r.items.filter((i) => i.tag === 'cl-proposal')
  assert.deepEqual(mgr.map((m) => m.email), ['boss@x']); assert.match(mgr[0].url, /\/upratovanie\?tab=plan&d=2026-11-24&auto=1/); assert.match(mgr[0].title, /je 2 byty bez upratovačky/)
  const rem = r.items.filter((i) => i.tag === 'cl-evening')
  assert.ok(rem.length >= 1 && rem.every((x) => ['anna@x', 'beata@x'].includes(x.email))) // pripomienka aj tej, ktorej návrh priradí, nie je (priradí sa až po potvrdení): len už priradené
  assert.deepEqual(rem.map((x) => x.email), ['anna@x'])
  assert.match(rem[0].title, /Zajtra máš 1 upratovanie/)
})

test('večerný beh: nastavenia vypnú návrh alebo pripomienky; nič na zajtra = nič neposlať', () => {
  const off = eveningPlan({ plan: plan({ settings: { notify: { evening_proposal: false, evening_reminder: false } } }), day: '2026-11-24' })
  assert.deepEqual(off.items, []); assert.equal(off.proposal, null)
  const onlyRem = eveningPlan({ plan: plan({ settings: { notify: { evening_proposal: false } } }), day: '2026-11-24' })
  assert.deepEqual(onlyRem.items.map((i) => i.tag), ['cl-evening'])
  const empty = eveningPlan({ plan: plan({ tasks: [] }), day: '2026-11-24' })
  assert.deepEqual(empty.items, []); assert.equal(empty.counts.open, 0)
  // hotové úlohy sa v pripomienke nespomínajú
  const done = eveningPlan({ plan: plan({ tasks: [T('3', 'L3', '2026-11-24', { cleaner_email: 'anna@x', status: 'done' })] }), day: '2026-11-24' })
  assert.deepEqual(done.items, [])
})

test('priradenie: jedna správa na upratovačku aj pri hromadnom priradení', () => {
  const tasks = [T('1', 'L1', '2026-11-24'), T('2', 'L2', '2026-11-24'), T('3', 'L3', '2026-11-25')]
  const items = assignmentItems(tasks, { 1: 'anna@x', 2: 'anna@x', 3: 'beata@x' })
  assert.equal(items.length, 2)
  assert.equal(items.find((i) => i.email === 'anna@x').title, 'Nové upratovania: 2'); assert.equal(items.find((i) => i.email === 'beata@x').title, 'Nové upratovanie')
  assert.deepEqual(assignmentItems(tasks, {}), [])
})
