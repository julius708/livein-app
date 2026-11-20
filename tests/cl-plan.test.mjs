import test from 'node:test'
import assert from 'node:assert/strict'
import { dayState, dayLoad, weekLoad, cellLoad, assignWarnings, recommend, canMove, avatarColor } from '../lib/cl-plan.js'

const S = (extra = {}) => ({ email: 'a@x', name: 'Anna', lat: 48.14, lng: 17.10, work_days: [1, 2, 3, 4, 5], days_off: [], max_per_day: 2, max_per_week: 3, max_distance_km: 0, excluded_listings: [], ...extra })
const T = (id, listing, date, extra = {}) => ({ id, listing_id: listing, date, status: 'todo', cleaner_email: null, ...extra })
const flat = { lat: 48.15, lng: 17.11 }

test('stav dňa: voľno, nepracuje, pracuje', () => {
  assert.equal(dayState(S({ days_off: ['2026-11-23'] }), '2026-11-23'), 'off')
  assert.equal(dayState(S(), '2026-11-22'), 'rest') // nedeľa
  assert.equal(dayState(S(), '2026-11-23'), 'ok') // pondelok
  assert.equal(dayState(S({ work_days: [] }), '2026-11-22'), 'ok') // prázdny zoznam = bez obmedzenia
  assert.equal(dayState(null, '2026-11-22'), 'ok')
})

test('zaťaženie: deň aj týždeň, zrušené a presúvaná úloha sa nepočítajú', () => {
  const tasks = [T('1', 'L1', '2026-11-23', { cleaner_email: 'a@x' }), T('2', 'L2', '2026-11-23', { cleaner_email: 'a@x' }), T('3', 'L3', '2026-11-24', { cleaner_email: 'a@x' }), T('4', 'L4', '2026-11-23', { cleaner_email: 'a@x', status: 'cancelled' }), T('5', 'L5', '2026-12-01', { cleaner_email: 'a@x' })]
  assert.equal(dayLoad(tasks, 'a@x', '2026-11-23'), 2)
  assert.equal(dayLoad(tasks, 'a@x', '2026-11-23', '1'), 1)
  assert.equal(weekLoad(tasks, 'a@x', '2026-11-25'), 3) // týždeň 23.–29. 11.
  assert.deepEqual(cellLoad(tasks, S(), '2026-11-23'), { n: 2, max: 2, level: 'full' })
  assert.equal(cellLoad([...tasks, T('6', 'L6', '2026-11-23', { cleaner_email: 'a@x' })], S(), '2026-11-23').level, 'over')
})

test('upozornenia pri priradení: voľno, deň mimo rozvrhu, vylúčený byt, limity, vzdialenosť', () => {
  const task = T('x', 'L9', '2026-11-23')
  assert.deepEqual(assignWarnings({ task, staff: S(), flat, tasks: [] }), [])
  assert.match(assignWarnings({ task, staff: S({ days_off: ['2026-11-23'] }), flat, tasks: [] })[0], /voľno/)
  assert.match(assignWarnings({ task: T('x', 'L9', '2026-11-22'), staff: S(), flat, tasks: [] })[0], /nepracuje/)
  assert.match(assignWarnings({ task, staff: S({ excluded_listings: ['L9'] }), flat, tasks: [] }).join(' '), /vylúčený/)
  const two = [T('1', 'L1', '2026-11-23', { cleaner_email: 'a@x' }), T('2', 'L2', '2026-11-23', { cleaner_email: 'a@x' })]
  assert.match(assignWarnings({ task, staff: S(), flat, tasks: two }).join(' '), /za deň, už má 2/)
  assert.equal(assignWarnings({ task: two[0], staff: S(), flat, tasks: two }).length, 0) // presun v rámci toho istého dňa sa nerátam dvakrát
  const three = [...two, T('3', 'L3', '2026-11-24', { cleaner_email: 'a@x' })]
  assert.match(assignWarnings({ task: T('x', 'L9', '2026-11-25'), staff: S(), flat, tasks: three }).join(' '), /za týždeň, už má 3/)
  assert.match(assignWarnings({ task, staff: S({ max_distance_km: 1 }), flat: { lat: 49.0, lng: 18.0 }, tasks: [] }).join(' '), /od jej bydliska/)
})

test('odporúčania: len bez upozornení, najbližšia prvá, bez adresy až na konci', () => {
  const task = T('x', 'L9', '2026-11-23')
  const near = S({ email: 'near@x', name: 'Blízka', lat: 48.151, lng: 17.111 })
  const far = S({ email: 'far@x', name: 'Ďaleká', lat: 48.4, lng: 17.4 })
  const noAddr = S({ email: 'na@x', name: 'Bez adresy', lat: null, lng: null })
  const off = S({ email: 'off@x', name: 'Voľno', days_off: ['2026-11-23'] })
  const r = recommend({ task, staffList: [far, noAddr, off, near], flat, tasks: [] })
  assert.deepEqual(r.map((x) => x.s.email), ['near@x', 'far@x', 'na@x'])
  assert.equal(recommend({ task, staffList: [far, near], flat, tasks: [] }, 1).length, 1)
})

test('presun: hotovú, zrušenú a rozbehnutú úlohu inej upratovačke nie', () => {
  assert.equal(canMove(T('1', 'L', 'd'), 'a@x').ok, true)
  assert.equal(canMove(T('1', 'L', 'd', { status: 'done' }), 'a@x').ok, false)
  assert.equal(canMove(T('1', 'L', 'd', { status: 'cancelled' }), 'a@x').ok, false)
  assert.equal(canMove(T('1', 'L', 'd', { status: 'in_progress', cleaner_email: 'a@x' }), 'b@x').ok, false)
  assert.equal(canMove(T('1', 'L', 'd', { status: 'in_progress', cleaner_email: 'a@x' }), 'a@x').ok, true)
  assert.equal(canMove(null, 'a@x').ok, false)
})

test('farba avatara je stabilná', () => {
  assert.equal(avatarColor('anna@x.sk'), avatarColor('anna@x.sk'))
  assert.match(avatarColor('x'), /^#[0-9A-F]{6}$/i)
})
