import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, addDays, weekStart, weekDays, isoWeekday, isYmd, eurToCents, fmtEur, centsToInput, payForTask, payrollSummary, staffPatch, workedMinutes, taskView, progress, todayBa, dayLabel } from '../lib/cl-core.js'
import { proposeAssignments, localityMatch } from '../lib/cl-assign.js'
import { geocode, cleanAddress, parseNominatim } from '../lib/cl-geo.js'

test('dátumy: týždeň začína pondelkom, deň v týždni 1–7', () => {
  assert.equal(isoWeekday('2026-11-22'), 7) // nedeľa
  assert.equal(isoWeekday('2026-11-16'), 1)
  assert.equal(weekStart('2026-11-22'), '2026-11-16')
  assert.deepEqual(weekDays('2026-11-19'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.ok(isYmd('2026-02-28') && !isYmd('2026-02-30') && !isYmd('26-1-1') && !isYmd(null))
  assert.equal(todayBa(new Date('2026-11-19T23:30:00Z')), '2026-11-20') // Bratislava je už o deň ďalej
  assert.equal(dayLabel('2026-11-19'), 'Št 19. 11.')
})

test('vzdialenosť: Bratislava – Košice ~ 320 km, chýbajúce súradnice = null', () => {
  const d = distanceKm({ lat: 48.1486, lng: 17.1077 }, { lat: 48.7164, lng: 21.2611 })
  assert.ok(d > 300 && d < 340, String(d))
  assert.equal(distanceKm({ lat: 48, lng: 17 }, { lat: null, lng: null }), null)
  assert.equal(distanceKm(null, { lat: 1, lng: 1 }), null)
  assert.equal(distanceKm({ lat: 48, lng: 17 }, { lat: 48, lng: 17 }), 0)
})

test('eurá <-> centy', () => {
  assert.equal(eurToCents('8,5'), 850); assert.equal(eurToCents('12.50 €'), 1250); assert.equal(eurToCents(' 30 '), 3000)
  assert.equal(eurToCents(''), null); assert.equal(eurToCents('abc'), null); assert.equal(eurToCents('-3'), null); assert.equal(eurToCents('1,234'), null)
  assert.equal(fmtEur(1250).replace(/\s/g, ''), '12,50€'); assert.equal(fmtEur(null), '—')
  assert.equal(centsToInput(850), '8,50'); assert.equal(centsToInput(null), '')
})

test('cena práce: za hodinu z odpracovaného času, za upratovanie, cena bytu, ručná oprava', () => {
  const done = { status: 'done', listing_id: 'L1', started_at: '2026-11-20T08:00:00Z', finished_at: '2026-11-20T10:30:00Z' }
  assert.equal(workedMinutes(done), 150)
  assert.equal(workedMinutes({ started_at: '2026-11-20T08:00:00Z' }), null)
  const hourly = { pay_type: 'hourly', hourly_rate_cents: 800, task_rate_cents: 3000 }
  assert.deepEqual(payForTask(done, hourly, {}), { cents: 2000, source: 'hourly', minutes: 150 })
  const running = { status: 'in_progress', listing_id: 'L1', started_at: '2026-11-20T08:00:00Z' }
  assert.deepEqual(payForTask(running, hourly, { est_minutes: 60 }), { cents: 800, source: 'hourly_est', minutes: 60 })
  const perTask = { pay_type: 'per_task', hourly_rate_cents: 800, task_rate_cents: 3000 }
  assert.equal(payForTask(done, perTask, {}).cents, 3000)
  assert.equal(payForTask(done, perTask, { pay_cents: 4500 }).cents, 4500) // cena bytu má prednosť
  assert.equal(payForTask({ ...done, pay_override_cents: 5200 }, hourly, {}).cents, 5200) // ručná oprava je navrchu
  assert.equal(payForTask(done, { pay_type: 'per_task', task_rate_cents: 0 }, {}).cents, null) // sadzba nenastavená
  assert.equal(payForTask(done, null, {}).cents, null)
  // nezmyselný čas (koniec pred štartom) sa nepočíta ako záporná mzda
  assert.equal(workedMinutes({ started_at: '2026-11-20T10:00:00Z', finished_at: '2026-11-20T08:00:00Z' }), null)
  // 20 hodín sa zastropuje na 12
  assert.equal(workedMinutes({ started_at: '2026-11-20T00:00:00Z', finished_at: '2026-11-20T20:00:00Z' }), 720)
})

test('súhrn výplat: hotové idú na vyplatenie, ostatné do odhadu, chýbajúca sadzba sa ráta zvlášť', () => {
  const staff = [{ email: 'a@x', name: 'Anna', pay_type: 'per_task', task_rate_cents: 3000 }, { email: 'b@x', name: 'Beáta', pay_type: 'hourly', hourly_rate_cents: 800 }, { email: 'c@x', name: 'Cecília', pay_type: 'per_task', task_rate_cents: 0 }]
  const tasks = [
    { cleaner_email: 'a@x', status: 'done', listing_id: 'L1' }, { cleaner_email: 'a@x', status: 'todo', listing_id: 'L2' }, { cleaner_email: 'a@x', status: 'cancelled', listing_id: 'L3' },
    { cleaner_email: 'b@x', status: 'done', listing_id: 'L1', started_at: '2026-11-20T08:00:00Z', finished_at: '2026-11-20T09:30:00Z' },
    { cleaner_email: 'c@x', status: 'done', listing_id: 'L1' }, { cleaner_email: null, status: 'todo', listing_id: 'L1' },
  ]
  const r = payrollSummary(tasks, staff, {})
  const by = Object.fromEntries(r.list.map((x) => [x.email, x]))
  assert.deepEqual({ d: by['a@x'].done, dc: by['a@x'].doneCents, ec: by['a@x'].estCents }, { d: 1, dc: 3000, ec: 3000 })
  assert.deepEqual({ dc: by['b@x'].doneCents, m: by['b@x'].minutes }, { dc: 1200, m: 90 })
  assert.equal(by['c@x'].missing, 1)
  assert.equal(r.total.doneCents, 4200)
})

test('formulár tímu -> parameter pre databázu: eurá na centy, limity, dni, lokality', () => {
  const p = staffPatch({ email: ' Anna@X.sk ', max_per_day: '2', max_per_week: '99', max_distance_km: '15', work_days: [1, 2, 9, 2, '3'], days_off: '2026-12-24, 2026-12-25\nzle', preferred_localities: 'Petržalka, Ružinov', excluded_listings: 'L9', pay_type: 'hourly', hourly_rate: '8,5', task_rate: '', instructions: ' Len doobeda ' })
  assert.deepEqual(p, { email: 'anna@x.sk', max_per_day: 2, max_per_week: 60, max_distance_km: 15, work_days: [1, 2, 3], days_off: ['2026-12-24', '2026-12-25'], preferred_localities: ['Petržalka', 'Ružinov'], excluded_listings: ['L9'], pay_type: 'hourly', hourly_rate_cents: 850, instructions: 'Len doobeda' })
  assert.deepEqual(staffPatch({ email: 'a@x.sk' }), { email: 'a@x.sk' }) // nič vyplnené = nič sa nemení
  assert.equal(staffPatch({ email: 'a@x', max_per_day: '0' }).max_per_day, 1) // minimum 1
  assert.equal(staffPatch({ email: 'a@x', pay_type: 'zadarmo' }).pay_type, undefined)
})

test('zobrazenie úlohy a postup checklistu', () => {
  const v = taskView({ people: 2, pack_note: 'kľúč', snapshot: { capsules: [{ type: 'Nespresso', n: 2 }, { type: 'X', n: 0 }], checklist: ['a'] } })
  assert.deepEqual({ p: v.people, c: v.capsuleCount, l: v.capsules.length, n: v.note }, { p: 2, c: 2, l: 1, n: 'kľúč' })
  assert.deepEqual(progress([{ done: true }, { done: false }, { done: true }, { done: true }]), { done: 3, n: 4, pct: 75 })
  assert.deepEqual(progress([]), { done: 0, n: 0, pct: 0 })
})

// ---------------------------------------------------------------- priraďovanie

const BA = (dlat, dlng) => ({ lat: 48.14 + dlat, lng: 17.10 + dlng })
const staff = (email, extra = {}) => ({ email, name: email.split('@')[0], active: true, role: 'cleaner', work_days: [1, 2, 3, 4, 5, 6, 7], days_off: [], preferred_localities: [], excluded_listings: [], max_per_day: 4, max_per_week: 0, max_distance_km: 0, ...BA(0, 0), ...extra })
const flats = { L1: { ...BA(0.01, 0.01), city: 'Bratislava', address: 'Hlavná 1' }, L2: { ...BA(0.30, 0.30), city: 'Trnava', address: 'Trhová 2' }, L3: { ...BA(0.011, 0.012), city: 'Bratislava - Petržalka', address: 'Pri jazere 3' } }
const T = (id, listing, date = '2026-11-23') => ({ id, listing_id: listing, date })

test('priradenie: bližšia upratovačka má prednosť, dôvod je po slovensky', () => {
  const r = proposeAssignments({ tasks: [T('t1', 'L1')], staff: [staff('far@x', { ...BA(0.5, 0.5) }), staff('near@x', { ...BA(0.005, 0.005) })], flats })
  assert.equal(r.assignments[0].email, 'near@x')
  assert.match(r.assignments[0].reason, /najbližšie/)
  assert.ok(r.assignments[0].km < 2)
})

test('priradenie: každá upratovačka má vlastný limit bytov za deň (jedna 2, druhá 4)', () => {
  const tasks = ['L1', 'L3', 'L1b', 'L3b', 'L1c', 'L3c'].map((l, i) => T('t' + i, l.replace(/[bc]$/, ''), '2026-11-23')).map((t, i) => ({ ...t, listing_id: i % 2 ? 'L3' : 'L1', id: 't' + i }))
  // úlohy majú rôzne ID, ale v jednom dni a byte môže byť len jedna → použijeme tri rôzne byty rozšírením
  const fl = { ...flats, L4: { ...BA(0.012, 0.01) }, L5: { ...BA(0.013, 0.01) }, L6: { ...BA(0.014, 0.01) } }
  const ts = ['L1', 'L3', 'L4', 'L5', 'L6', 'L2'].map((l, i) => T('t' + i, l))
  const r = proposeAssignments({ tasks: ts, staff: [staff('two@x', { max_per_day: 2 }), staff('four@x', { max_per_day: 4, ...BA(0.4, 0.4) })], flats: fl, options: { balance: 0 } })
  const n = (e) => r.assignments.filter((a) => a.email === e).length
  assert.ok(n('two@x') <= 2, 'two ' + n('two@x'))
  assert.ok(n('four@x') <= 4)
  assert.equal(r.assignments.length + r.unassigned.length, 6)
  assert.equal(r.assignments.length, 6) // 2 + 4 = 6 sa vojde
  void tasks
})

test('priradenie: týždenný limit, dni voľna, pracovné dni, vylúčený byt, maximálna vzdialenosť', () => {
  const base = { flats }
  // týždenný limit 1: druhý byt v tom istom týždni ide inej
  let r = proposeAssignments({ ...base, tasks: [T('a', 'L1', '2026-11-23'), T('b', 'L3', '2026-11-24')], staff: [staff('w1@x', { max_per_week: 1 }), staff('other@x', { ...BA(0.2, 0.2) })] })
  assert.deepEqual(r.assignments.map((x) => x.email).sort(), ['other@x', 'w1@x'])
  // dni voľna a pracovné dni
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1', '2026-11-23')], staff: [staff('off@x', { days_off: ['2026-11-23'] })] })
  assert.equal(r.assignments.length, 0); assert.match(r.unassigned[0].reason, /nikto nepracuje/)
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1', '2026-11-22')], staff: [staff('mf@x', { work_days: [1, 2, 3, 4, 5] })] }) // nedeľa
  assert.equal(r.assignments.length, 0)
  // vylúčený byt
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1')], staff: [staff('ex@x', { excluded_listings: ['L1'] })] })
  assert.match(r.unassigned[0].reason, /nemá žiadna upratovačka povolený/)
  // maximálna vzdialenosť 5 km: Trnava je ďaleko, Bratislava blízko
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1'), T('b', 'L2')], staff: [staff('km@x', { max_distance_km: 5 })] })
  assert.deepEqual(r.assignments.map((x) => x.listing_id), ['L1']); assert.match(r.unassigned[0].reason, /ďalej/)
  // plno
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1'), T('b', 'L3')], staff: [staff('full@x', { max_per_day: 1 })] })
  assert.equal(r.assignments.length, 1); assert.match(r.unassigned[0].reason, /plno/)
  // neaktívna a manažérka sa nepriradia
  r = proposeAssignments({ ...base, tasks: [T('a', 'L1')], staff: [staff('inactive@x', { active: false }), staff('boss@x', { role: 'manager' })] })
  assert.match(r.unassigned[0].reason, /žiadna aktívna/)
})

test('priradenie: už priradené byty sa počítajú do limitu a do zhluku, rotácia a lokalita menia poradie', () => {
  // Anna už má v ten deň 1 byt a limit 1 -> ide Beáte
  let r = proposeAssignments({ flats, tasks: [T('a', 'L3')], staff: [staff('anna@x', { max_per_day: 1 }), staff('beata@x', { ...BA(0.3, 0.3) })], assigned: [{ listing_id: 'L1', date: '2026-11-23', cleaner_email: 'anna@x', status: 'todo' }] })
  assert.equal(r.assignments[0].email, 'beata@x')
  // zhluk: Beáta býva ďaleko, ale v ten deň už upratuje pri L3 -> L1 dostane ona
  r = proposeAssignments({ flats, tasks: [T('a', 'L1')], staff: [staff('anna@x', { ...BA(0.06, 0.06) }), staff('beata@x', { ...BA(0.12, 0.12) })], assigned: [{ listing_id: 'L3', date: '2026-11-23', cleaner_email: 'beata@x', status: 'todo' }], options: { balance: 0 } })
  assert.equal(r.assignments[0].email, 'beata@x'); assert.match(r.assignments[0].reason, /už upratuje neďaleko/)
  // rotácia: obe sú rovnako blízko, Anna tu nedávno robila -> ide Beáta
  r = proposeAssignments({ flats, tasks: [T('a', 'L1')], staff: [staff('anna@x'), staff('beata@x', { lat: 48.14, lng: 17.0999999 })], history: [{ listing_id: 'L1', date: '2026-11-10', cleaner_email: 'anna@x' }], options: { balance: 0 } })
  assert.equal(r.assignments[0].email, 'beata@x')
  // bez rotácie (0) rozhoduje len vzdialenosť
  r = proposeAssignments({ flats, tasks: [T('a', 'L1')], staff: [staff('anna@x'), staff('beata@x', { lat: 48.14, lng: 17.0999999 })], history: [{ listing_id: 'L1', date: '2026-11-10', cleaner_email: 'anna@x' }], options: { balance: 0, rotation: 0 } })
  assert.equal(r.assignments[0].email, 'anna@x')
  // uprednostnená lokalita: Petržalka vyhrá aj keď je o niečo ďalej
  r = proposeAssignments({ flats, tasks: [T('a', 'L3')], staff: [staff('near@x', { ...BA(0.011, 0.011) }), staff('pref@x', { ...BA(0.05, 0.05), preferred_localities: ['Petržalka'] })], options: { balance: 0 } })
  assert.equal(r.assignments[0].email, 'pref@x'); assert.match(r.assignments[0].reason, /lokalita Petržalka/)
  assert.equal(localityMatch({ city: 'Bratislava - Petržalka' }, ['petrzalka']), 'petrzalka') // bez diakritiky a veľkosti písmen
})

test('priradenie: vyrovnáva záťaž a bez adresy nezlyhá; je deterministické', () => {
  const fl = { A: { ...BA(0.01, 0) }, B: { ...BA(0.011, 0) }, C: { ...BA(0.012, 0) }, D: { ...BA(0.013, 0) } }
  const ts = ['A', 'B', 'C', 'D'].map((l, i) => T('t' + i, l))
  const st = [staff('a@x', { ...BA(0, 0) }), staff('b@x', { ...BA(0, 0.001) })]
  const r1 = proposeAssignments({ flats: fl, tasks: ts, staff: st, options: { balance: 1 } })
  const cnt = (r, e) => r.assignments.filter((x) => x.email === e).length
  assert.equal(cnt(r1, 'a@x'), 2); assert.equal(cnt(r1, 'b@x'), 2)
  assert.deepEqual(proposeAssignments({ flats: fl, tasks: ts, staff: st, options: { balance: 1 } }), r1)
  const r2 = proposeAssignments({ flats: { A: {} }, tasks: [T('x', 'A')], staff: [staff('noaddr@x', { lat: null, lng: null })] })
  assert.equal(r2.assignments[0].km, null); assert.match(r2.assignments[0].reason, /bez adresy/)
})

// ---------------------------------------------------------------- geokódovanie

test('geokódovanie: čistenie adresy, spracovanie odpovede, chyby siete', async () => {
  assert.equal(cleanAddress(' Hlavná  1 ', 'Bratislava'), 'Hlavná 1, Bratislava')
  assert.equal(cleanAddress('Hlavná 1, Bratislava', 'Bratislava'), 'Hlavná 1, Bratislava')
  assert.equal(cleanAddress('', ''), '')
  assert.deepEqual(parseNominatim([{ lat: '48.1', lon: '17.1', display_name: 'X' }]), { lat: 48.1, lng: 17.1, label: 'X' })
  assert.equal(parseNominatim([{ lat: 'x', lon: '1' }]), null); assert.equal(parseNominatim([]), null)
  const seen = []
  const ok = await geocode('Hlavná 1', 'Bratislava', async (url, init) => { seen.push({ url, ua: init.headers['User-Agent'] }); return { ok: true, json: async () => [{ lat: '48.15', lon: '17.11', display_name: 'Hlavná 1' }] } })
  assert.equal(ok.ok, true); assert.ok(seen[0].url.includes('Hlavn%C3%A1%201%2C%20Bratislava')); assert.equal(seen[0].ua, 'livein-upratovanie/1.0')
  assert.equal((await geocode('x', '', async () => { throw new Error('nope') })).status, 'too_short')
  assert.equal((await geocode('Hlavná 1', 'Bratislava', async () => { throw new Error('offline') })).status, 'network')
  assert.equal((await geocode('Hlavná 1', 'Bratislava', async () => ({ ok: false, status: 429 }))).status, 'http_429')
  assert.equal((await geocode('Hlavná 1', 'Bratislava', async () => ({ ok: true, json: async () => [] }))).status, 'not_found')
})
