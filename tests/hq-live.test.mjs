// Ústredňa – skladanie živých údajov z existujúcich modulov appky. Syntetické vstupy; žiadna sieť ani databáza.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLive } from '../lib/hq-live-core.js'
import { mergeSources } from '../lib/hq-core.js'

const NOW = Date.parse('2026-11-12T10:00:00Z')   // 11:00 v Bratislave
const d = (x) => ({ data: x })
const RAW = {
  facts: d({ arrivals: 3, departures: 2, guests_in_house: 40, tomorrow_arrivals: 5, listings: 12, facts: { apartments_now: 137, apartments_start: 69, start_label: 'začiatok 2026', end_2026: '160 až 170', goal_2027: 345, goal: 1000, goal_year: 2031, pace_month: 15 } }),
  leadStats: d({ new7: 15, prev7: 6, recentNew: 14, oldNew: 823, clients: 55 }),
  activity: d({ active_users: 13, usage_apps: [{ app: 'app', views: 954, people: 13 }, { app: 'cs', views: 65, people: 4 }] }),
  dash: d({ occupancy: 74, booking_pct: 72, airbnb_pct: 25, next7_arrivals: 105, avg_stay: 4.4, month_nights: 2028, week: [{ day: '2026-11-12', arr: 3, dep: 2 }, { day: '2026-11-13', arr: 5, dep: 1 }], cities: [{ city: 'Mesto', guests: 38, staying: 20 }, { city: 'Iné', guests: 2, staying: 1 }], arrivals_list: [{ name: 'Skúšobný byt A', city: 'Mesto', guests: 2, nights: 3, source: 'Booking' }] }),
  work: d({ today_todo: 1, today_packed: 4, tomorrow_total: 6, today_same_day: 14, early_today: 1 }),
  numbers: d({ updated_at: '2026-11-12T09:20:00Z', stays_ytd: 500, stays_ytd_prev: 100, nights_ytd: 2000, nights_ytd_prev: 400, guests_since_2025: 1700, nights_month: 1860, nights_month_prev_year: 1137 }),
  leadCounts: d({ new: 2, contacted: 0, viewing: 1, offer: 0 }),
  overdue: d({ rows: [{ id: 'l1', name: 'Lead Jeden', city: 'Mesto', assigned_to: 'obchod@example.test', due_at: '2026-11-11T10:00:00Z' }], count: 1 }),
  taskLeads: d([{ id: 'l1', name: 'Lead Jeden', city: 'Mesto' }, { id: 'l2', name: 'Lead Dva', city: 'Mesto' }, { id: 'l3', name: 'Lead Tri', city: 'Mesto' }]),
  leadTasks: d([
    { id: 't1', lead_id: 'l3', kind: 'viewing', due_at: '2026-11-12T13:30:00Z', status: 'open', payload: { address: 'Skúšobná 1' } },
    { id: 't2', lead_id: 'l2', kind: 'viewing', due_at: '2026-11-15T09:00:00Z', status: 'open', payload: {} },
    { id: 't3', lead_id: 'l1', kind: 'viewing', due_at: '2026-11-10T09:00:00Z', status: 'open', payload: {} },
    { id: 't4', lead_id: 'l1', kind: 'custom', due_at: '2026-11-12T09:00:00Z', status: 'open', payload: {} },
    { id: 't5', lead_id: 'l2', kind: 'viewing', due_at: '2026-11-30T09:00:00Z', status: 'open', payload: {} },
  ]),
  crmSync: d({ last_run: '2026-11-12T09:55:00Z' }), queue: d([{ id: 1, last_error: null }]),
  maint: d([{ id: 'c1', ref: 'U-1', listing_name: 'Skúšobný byt A', category: 'voda', symptoms: 'kvapká', severity: 'critical', status: 'new', assignee_email: null }, { id: 'c2', listing_name: 'Skúšobný byt B', severity: 'low', status: 'in_progress', assignee_email: 'technik@example.test' }]),
  damages: d([{ gid: '1', name: 'x', listing: 'Skúšobný byt A', problem: 'rozbitý pohár', url: 'https://app.asana.com/0/0/1', section: 'Nové', due_on: '2026-11-05' }, { gid: '2', name: 'y', listing: 'Skúšobný byt B', url: 'https://app.asana.com/0/0/2', due_on: '2026-11-20' }]),
  economy: d({ updated_at: '2026-11-12T06:00:00Z', summary: { asOf: '2026-11-12', units: 100, month: { key: '2026-11', revenue: 250000, nights: 1800, occupancy: 71.5, adr: 139, revpan: 99, whole: true }, toDate: 96000, prev: { key: '2026-10', revenue: 200000 }, lastYear: null, next: { key: '2026-12', revenue: 120000 }, vsPrev: 25, vsLastYear: null, months: [{ key: '2026-10', revenue: 200000, kind: 'past' }, { key: '2026-11', revenue: 250000, kind: 'current' }, { key: '2026-12', revenue: 120000, kind: 'booked' }] } }),
  billing: d({ month: '2026-11', status: 'open', stats: { sumC: 123456, missing: 2, zistit: 1, patrik: 0, apts: 9 } }),
  invProps: d([{ status: 'active' }, { status: 'sold' }, { status: 'new' }]), invInq: d([{ status: 'new' }, { status: 'closed' }]),
  invSources: d([{ key: 'a', name: 'Zdroj A', enabled: true, last_ok_at: '2026-11-12T07:00:00Z' }]),
  ideas: d([{ status: 'new' }, { status: 'new' }, { status: 'selected' }, { status: 'script_done' }]),
  newsletter: d([{ subject: 'Skúšobný newsletter', sent_at: '2026-11-05T08:00:00Z', sent_count: 100 }]),
  kb: d([{ finished_at: '2026-11-12T06:25:00Z', ok: true }]),
  board: d([{ id: 1, text: 'Skúšobný oznam', author_name: 'Tester', date: '2026-11-12' }]),
}
const statusOf = (live, now = NOW) => Object.fromEntries(mergeSources(live.sources, { now }).map((s) => [s.key, s]))

test('prevádzka: príchody, hostia a opravy z existujúcich modulov; naliehavá údržba je signál', () => {
  const L = buildLive(RAW, NOW), o = L.areas.operations
  assert.deepEqual(o.metrics.map((m) => m.value), ['3', '2', '40', '2'])
  assert.match(o.metrics[2].note, /74 %/); assert.equal(o.lists[0].rows[0].title, 'Skúšobný byt A')
  assert.equal(o.lists[1].rows[0].tone, 'red'); assert.equal(o.lists[1].rows[0].href, '/udrzba/c1'); assert.match(o.lists[1].rows[0].sub, /bez riešiteľa/)
  assert.equal(o.lists[2].rows[0].external, true)
  assert.ok(L.signals.some((s) => /naliehavý prípad údržby/.test(s.title)))
  assert.match(L.overview.operations, /3 príchody, 2 odchody, 40 hostí/)
})

test('obhliadky a leady z CRM: dnešné, týždňové, po termíne a leady po lehote', () => {
  const L = buildLive(RAW, NOW), v = L.areas.visits
  assert.deepEqual(v.metrics.map((m) => m.value), ['2', '1', '1', '1'])   // 7 dní (t1, t2), dnes (t1), po termíne (t3), leady po lehote (l1)
  assert.equal(v.lists[0].rows.length, 3); assert.equal(v.lists[0].rows[0].badge, 'Dnes'); assert.match(v.lists[0].rows[0].title, /Lead Tri/); assert.equal(v.lists[0].rows[0].href, '/crm/lead/l3')
  assert.equal(v.lists[1].rows[0].badge, 'Po termíne')
  assert.equal(L.overview.calendarCount, 2); assert.equal(L.overview.calendarTitle, 'Dnes v kalendári'); assert.equal(L.overview.calendar[0].clock, '14:30')
  assert.ok(L.signals.some((s) => /1 lead čaká po lehote/.test(s.title))); assert.ok(L.signals.some((s) => /bez zapísaného výsledku/.test(s.title)))
  assert.deepEqual(L.areas.properties.metrics.map((m) => m.value), ['2', '0', '1', '0'])
  // počet po lehote je presný počet z databázy, nie dĺžka (obmedzeného) zoznamu
  const many = buildLive({ ...RAW, overdue: d({ rows: RAW.overdue.data.rows, count: 1234 }) }, NOW)
  assert.match(many.areas.visits.metrics[3].value, /1[\s\u00a0\u202f]?234/); assert.ok(many.signals.some((s) => /leadov čaká po lehote/.test(s.title)))
})

test('financie, marketing, správy a znalosti ukazujú len to, čo appka naozaj má', () => {
  const L = buildLive(RAW, NOW)
  assert.match(L.areas.finance.metrics[0].value, /1[\s  ]?235/); assert.equal(L.areas.finance.metrics[1].value, '2')
  assert.ok(L.signals.some((s) => /2 riadky bez sumy/.test(s.title)))
  assert.deepEqual(L.areas.marketing.metrics.slice(0, 3).map((m) => m.value), ['2', '1', '1'])
  assert.match(L.areas.marketing.notes[0], /nie sú k appke pripojené/)
  assert.equal(L.areas.messages.lists[0].rows[0].title, 'Skúšobný oznam'); assert.match(L.areas.messages.notes[0], /len odosielať/)
  assert.match(L.areas.knowledge.notes[0], /naposledy obnovila/)
})

test('stav zdrojov: naživo len s úspešným načítaním alebo časom synchronizácie; chýbajúce prepojenia sú nepripojené', () => {
  const s = statusOf(buildLive(RAW, NOW))
  for (const k of ['crm', 'maintenance', 'asana', 'hubspot', 'finance', 'invest-feed', 'content', 'kb']) assert.equal(s[k].status, 'live', k)
  assert.equal(s.hubspot.lastOkAt, '2026-11-12T09:55:00.000Z')
  assert.equal(s.guesty.status, 'live'); assert.equal(s.guesty.lastOkAt, '2026-11-12T09:20:00.000Z')   // čas posledného prepočtu čísel z rezervácií
  assert.equal(statusOf(buildLive({ ...RAW, numbers: { error: 'x' } }, NOW)).guesty.status, 'partial')   // bez časovej pečiatky len „čiastočne“
  assert.equal(s.pricelabs.status, 'partial'); assert.match(s.pricelabs.note, /nemá v appke vlastné prepojenie/)
  for (const k of ['gmail', 'outlook', 'whatsapp', 'calendar', 'social', 'voice']) assert.equal(s[k].status, 'off', k)
  // synchronizácia HubSpotu staršia než 48 hodín už nie je „naživo“
  assert.equal(statusOf(buildLive({ ...RAW, crmSync: d({ last_run: '2026-11-09T09:00:00Z' }) }, NOW)).hubspot.status, 'stale')
})

test('zlyhanie zdroja sa neukáže ako nula: hodnota je „–“ a zdroj má chybu', () => {
  const L = buildLive({ ...RAW, facts: { error: 'permission denied' }, dash: { error: 'x' }, leadCounts: { error: 'rls' }, overdue: { error: 'rls' }, leadTasks: { error: 'rls' }, maint: { error: 'timeout' }, damages: { data: null }, crmSync: { error: 'x' }, economy: { error: 'x' }, billing: { error: 'x' } }, NOW)
  assert.deepEqual(L.areas.operations.metrics.map((m) => m.value), ['–', '–', '–', '–'])
  assert.deepEqual(L.areas.visits.metrics.map((m) => m.value), ['–', '–', '–', '–'])
  assert.equal(L.areas.finance.metrics[0].value, '–'); assert.equal(L.overview.calendarCount, null); assert.equal(L.overview.operations, null)
  const s = statusOf(L)
  for (const k of ['guesty', 'crm', 'maintenance', 'finance']) assert.equal(s[k].status, 'error', k)
  assert.equal(s.asana.status, 'pending'); assert.equal(s.hubspot.status, 'pending'); assert.match(s.crm.lastError, /rls/)
  assert.equal(L.signals.length, 0)
  assert.doesNotThrow(() => buildLive({}, NOW))
})

test('grafy a živé čísla: len z toho, čo zdroje vrátili; mesiac vyúčtovania je čitateľný', () => {
  const L = buildLive({ ...RAW, billing: d({ month: '2026-10-01', status: 'open', stats: { sumC: 100, missing: 3, zistit: 0, patrik: 0, apts: 1 } }) }, NOW)
  assert.deepEqual(L.charts.week.map((x) => [x.arr, x.dep, x.today]), [[3, 2, true], [5, 1, false]])
  assert.deepEqual(L.charts.channels.map((c) => c.pct), [72, 25, 3]); assert.deepEqual(L.charts.cities.map((c) => c.value), [38, 2])
  assert.deepEqual(L.charts.funnel.map((f) => f.value), [14, 0, 1, 0]); assert.equal(L.charts.occupancy, 74)   // „Nový“ = len posledných 30 dní
  assert.equal(L.kpis.arrivals, 3); assert.equal(L.kpis.next7, 105); assert.equal(L.kpis.staysYtd, 500); assert.equal(L.kpis.overdueLeads, 1)
  assert.match(L.areas.finance.metrics[0].label, /október 2026/); assert.ok(L.signals.some((s) => /Vyúčtovanie október 2026: 3 riadky/.test(s.title)))
  const empty = buildLive({}, NOW)
  assert.equal(empty.charts.week, null); assert.equal(empty.charts.channels, null); assert.equal(empty.charts.funnel, null); assert.equal(empty.kpis.arrivals, null)
})

test('prehľad pre vedenie: peniaze, medziročný rast, portfólio voči cieľu, leady, dnešná prevádzka a tím', () => {
  const c = buildLive(RAW, NOW).ceo
  assert.deepEqual([c.money.revenue, c.money.toDate, c.money.vsPrev, c.money.vsLastYear, c.money.adr, c.money.next.revenue], [250000, 96000, 25, null, 139, 120000])
  assert.match(c.money.label, /november 2026/); assert.deepEqual(c.money.months.map((m) => m.kind), ['past', 'current', 'booked'])
  assert.deepEqual(c.nights, { month: 1860, lastYear: 1137, change: 64 })
  assert.deepEqual([c.growth.staysChange, c.growth.nightsChange, c.growth.guestsSince2025], [400, 400, 1700])
  assert.deepEqual([c.portfolio.now, c.portfolio.start, c.portfolio.target, c.portfolio.goal2027, c.portfolio.goal], [137, 69, 170, 345, 1000])
  assert.deepEqual(c.leads, { new7: 15, prev7: 6, change: 150, overdue: 1, recentNew: 14, oldNew: 823, clients: 55 })
  assert.deepEqual([c.ops.sameDay, c.ops.early, c.ops.tomorrowArrivals, c.ops.damagesOpen, c.ops.damagesOverdue, c.ops.repairsOpen], [14, 1, 5, 2, 1, 2])
  assert.equal(c.team.activeUsers, 13); assert.equal(c.team.apps[0].label, 'app')
  const L = buildLive(RAW, NOW)
  assert.ok(L.signals.some((s) => /1 škoda v Asane po termíne/.test(s.title)))
  assert.deepEqual([L.charts.funnel[0].label, L.charts.funnel[0].value], ['Nový (30 dní)', 14])   // staré odložené leady nenafukujú lievik
  const empty = buildLive({}, NOW).ceo
  assert.equal(empty.money, null); assert.equal(empty.nights, null); assert.equal(empty.portfolio, null); assert.equal(empty.leads, null); assert.equal(empty.team, null); assert.equal(empty.ops.sameDay, null)
  assert.equal(buildLive({ ...RAW, economy: d({ updated_at: '2026-11-12T06:00:00Z', summary: null }) }, NOW).ceo.money, null)   // podklad bez súhrnu nedá sumy
})
