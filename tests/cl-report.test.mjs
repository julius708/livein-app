import test from 'node:test'
import assert from 'node:assert/strict'
import { monthRange, prevMonth, monthLabel, reportFileName, reportModel, reportSheets, reportEmail, isMonth, isRangeYmd, rangeLabel, rangeFileName } from '../lib/cl-report.js'
import { buildXlsx } from '../lib/xlsx-lite.js'

const data = {
  staff: [{ email: 'a@x', name: 'Anna', role: 'cleaner', pay_type: 'hourly', hourly_rate_cents: 800, task_rate_cents: 0 }, { email: 'b@x', name: 'Beáta', role: 'cleaner', pay_type: 'per_task', hourly_rate_cents: 0, task_rate_cents: 3000 }, { email: 'c@x', name: 'Cecília', role: 'cleaner', pay_type: 'per_task', hourly_rate_cents: 0, task_rate_cents: 0 }],
  flats: [{ listing_id: 'L1', listing_name: 'Byt Jedna', pay_cents: null, est_minutes: 90 }, { listing_id: 'L2', listing_name: 'Byt Dva', pay_cents: 4500, est_minutes: 60 }],
  tasks: [
    { id: '1', listing_id: 'L1', listing_name: 'Byt Jedna', date: '2026-11-03', status: 'done', cleaner_email: 'a@x', started_at: '2026-11-03T08:00:00Z', finished_at: '2026-11-03T10:30:00Z', problem_text: 'Fén nefunguje', cleaner_note: 'ok' },
    { id: '2', listing_id: 'L2', listing_name: 'Byt Dva', date: '2026-11-04', status: 'done', cleaner_email: 'b@x', started_at: '2026-11-04T08:00:00Z', finished_at: '2026-11-04T09:00:00Z' },
    { id: '3', listing_id: 'L1', listing_name: 'Byt Jedna', date: '2026-11-05', status: 'done', cleaner_email: 'c@x', started_at: '2026-11-05T08:00:00Z', finished_at: '2026-11-05T09:00:00Z' },
    { id: '4', listing_id: 'L2', listing_name: 'Byt Dva', date: '2026-11-06', status: 'todo', cleaner_email: 'b@x' },
    { id: '5', listing_id: 'manual:x', listing_name: 'Kancelária', date: '2026-11-07', status: 'todo', cleaner_email: null, manual: true },
    { id: '6', listing_id: 'L1', listing_name: 'Byt Jedna', date: '2026-11-08', status: 'cancelled', cleaner_email: 'a@x' },
  ],
}

test('mesiac: rozsah, predošlý mesiac, názov súboru, kontrola formátu', () => {
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' })
  assert.equal(prevMonth('2026-01-01'), '2025-12'); assert.equal(prevMonth('2026-12-15'), '2026-11')
  assert.equal(monthLabel('2026-11'), 'november 2026'); assert.equal(reportFileName('2026-03'), 'Upratovanie_marec_2026.xlsx')
  assert.ok(isMonth('2026-11') && !isMonth('2026-13') && !isMonth('2026-1') && !isMonth(null))
})

test('model reportu: súčty po upratovačkách a bytoch, zrušené sa nepočítajú, chýbajúca sadzba zvlášť', () => {
  const m = reportModel(data, '2026-11')
  assert.equal(m.rows.length, 5) // bez zrušenej
  const by = Object.fromEntries(m.cleaners.map((c) => [c.name, c]))
  assert.deepEqual({ d: by['Anna'].done, c: by['Anna'].doneCents, min: by['Anna'].minutes, p: by['Anna'].problems }, { d: 1, c: 2000, min: 150, p: 1 }) // 2,5 h × 8 €
  assert.deepEqual({ d: by['Beáta'].done, c: by['Beáta'].doneCents, o: by['Beáta'].open, e: by['Beáta'].estCents }, { d: 1, c: 4500, o: 1, e: 4500 }) // cena bytu má prednosť
  assert.deepEqual({ d: by['Cecília'].done, m: by['Cecília'].missing, c: by['Cecília'].doneCents }, { d: 1, m: 1, c: 0 })
  assert.equal(by['Nepriradené'].open, 1)
  assert.equal(m.total.doneCents, 6500); assert.equal(m.total.done, 3); assert.equal(m.total.problems, 1)
  assert.equal(m.flats.find((f) => f.name === 'Byt Dva').cents, 4500)
  assert.equal(m.problems.length, 1)
})

test('hárky a .xlsx: tri hárky, hlavičky, súbor je platný zip', () => {
  const sheets = reportSheets(reportModel(data, '2026-11'))
  assert.deepEqual(sheets.map((s) => s.name), ['Súhrn', 'Úlohy', 'Podľa bytov'])
  assert.equal(sheets[1].rows.length, 1 + 5) // hlavička + úlohy
  const buf = buildXlsx(sheets)
  assert.equal(buf.readUInt32LE(0), 0x04034b50) // PK
  assert.ok(buf.length > 1000)
  const txt = buf.toString('latin1')
  assert.ok(txt.includes('xl/worksheets/sheet3.xml'))
})

test('e-mail: predmet, text aj html obsahujú mesiac, súčet a upozornenie na orientačné sumy; html je escapované', () => {
  const m = reportModel({ ...data, staff: [{ ...data.staff[0], name: 'An<na>' }, ...data.staff.slice(1)] }, '2026-11')
  const e = reportEmail(m)
  assert.equal(e.subject, 'Upratovanie: report za november 2026')
  assert.match(e.text, /Hotových upratovaní: 3/); assert.match(e.text, /orientačné/)
  assert.ok(e.html.includes('An&lt;na&gt;') && !e.html.includes('An<na>'))
  assert.ok(e.html.includes('65,00'))
})

test('obdobie od-do: kontrola, popis a názov súboru', () => {
  assert.ok(isRangeYmd('2026-11-01', '2026-11-15') && isRangeYmd('2026-11-15', '2026-11-15'))
  assert.ok(!isRangeYmd('2026-11-15', '2026-11-01') && !isRangeYmd('2026-11-01', '2027-12-31') && !isRangeYmd('x', '2026-11-01') && !isRangeYmd(null, null))
  assert.equal(rangeLabel('2026-11-01', '2026-11-15'), '1. 11. 2026 – 15. 11. 2026')
  assert.equal(rangeFileName('2026-11-01', '2026-11-15'), 'Upratovanie_2026-11-01_2026-11-15.xlsx')
  assert.equal(rangeFileName('2026-11-01', '2026-11-15', 'Beáta Čierna'), 'Upratovanie_2026-11-01_2026-11-15_Beata-Cierna.xlsx')
})

test('export jednej upratovačky: filter, checklist, fotky a recenzia hosťa v hárku Úlohy; priemer recenzií v súhrne', () => {
  const d = { ...data, tasks: data.tasks.map((t) => (t.id === '1' ? { ...t, items_total: 14, items_done: 12, photos_before: 2, photos_after: 3, photos_issue: 1, review_rating: 2, review_text: 'Špinavá kúpeľňa' } : t.id === '2' ? { ...t, items_total: 14, items_done: 14, photos_before: 1, photos_after: 1, review_rating: 5, review_text: '' } : t)) }
  const all = reportModel(d, '2026-11', { label: '1. 11. 2026 – 15. 11. 2026' })
  const anna = all.cleaners.find((c) => c.name === 'Anna')
  assert.deepEqual({ n: anna.ratings, sum: anna.ratingSum, low: anna.lowRatings }, { n: 1, sum: 2, low: 1 })
  const one = reportModel(d, '2026-11', { cleaner: 'a@x', label: 'x' })
  assert.equal(one.rows.length, 1); assert.equal(one.who, 'Anna'); assert.equal(one.total.doneCents, 2000)
  const sh = reportSheets(one)
  assert.equal(sh[0].rows[2].length, 11) // súhrn má stĺpce recenzií
  const head = sh[1].rows[0].map((c) => c.v)
  const row = sh[1].rows[1]
  assert.equal(row[head.indexOf('Checklist')], '12 / 14'); assert.equal(row[head.indexOf('Fotky po')], 3); assert.equal(row[head.indexOf('Fotky problém')], 1)
  assert.equal(row[head.indexOf('Recenzia hosťa')], 2); assert.equal(row[head.indexOf('Text recenzie')], 'Špinavá kúpeľňa')
  assert.equal(buildXlsx(sh).readUInt32LE(0), 0x04034b50)
})
