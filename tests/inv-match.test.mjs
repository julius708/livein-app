import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateMatch, budgetCheck, rankMatches, matchSignature } from '../lib/inv-match.js'
import { computeInvestment } from '../lib/inv-calc.js'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const fresh = '2026-11-11T10:00:00Z'
const base = { city: 'Bratislava', district: 'Staré Mesto', bedrooms: 2, area_interior: 62, parking_mandatory: false, commission_in_price: true, monthly_fixed: 200 }
const full = (price, extra = {}) => ({ ...base, price, legal_costs: 5000, reno: 5000, furnishing: 4000, setup: 500, reserve: 500, ...extra })
const prop = (o = {}) => ({ id: 'p', status: 'active', city: 'Bratislava', district: 'Staré Mesto', type: 'byt', rooms: 3, area_interior: 62, price: 195000, features: {}, last_checked_at: fresh, ...o })
const Q = { cities: ['Bratislava'], budget_total: 200000, budget_kind: 'total' }
const ev = (q, p, c, extra = {}) => evaluateMatch({ inquiry: q, property: p, calc: c, now: NOW, ...extra })

test('rozpočet 200 000 € celkom: byt za 195 000 € s ďalšími nákladmi 15 000 € NIE je v rozpočte', () => {
  const c = computeInvestment({ ...base, price: 195000, legal_costs: 5000, reno: 5000, furnishing: 4000, setup: 500, reserve: 500 })
  assert.equal(c.investment.known_total, 210000)
  const m = ev(Q, prop(), c)
  assert.equal(m.budget.status, 'over'); assert.equal(m.budget.over_by, 10000)
  assert.equal(m.category, 'outside'); assert.match(m.rank_reason, /Mimo podmienok/)
  assert.equal(m.hard.find((h) => h.key === 'budget').state, 'fail')
})
test('byt za 180 000 € s plne známymi nákladmi 15 000 € vyhovuje rozpočtu', () => {
  const c = computeInvestment(full(180000, { legal_costs: 5000, reno: 5000, furnishing: 4000, setup: 500, reserve: 500 }))
  const m = ev(Q, prop({ price: 180000 }), c)
  assert.equal(m.budget.status, 'within'); assert.equal(m.category, 'match'); assert.equal(m.budget.margin, 5000)
})
test('chýbajúce náklady: v rozpočte podľa známych nákladov, ale „neoverené“ a vypísané ako neznáme', () => {
  const c = computeInvestment({ ...base, price: 180000 })
  const m = ev(Q, prop({ price: 180000 }), c)
  assert.equal(m.budget.status, 'unverified'); assert.ok(m.budget.unknown.length >= 4)
  assert.equal(m.category, 'match'); assert.ok(m.unknown_count >= 1)
  assert.match(m.next_step, /Doplniť chýbajúce náklady/)
})
test('aj pri neznámych nákladoch: ak už známe náklady presahujú rozpočet, je to prekročenie', () => {
  const c = computeInvestment({ ...base, price: 205000 })
  assert.equal(ev(Q, prop({ price: 205000 }), c).budget.status, 'over')
})
test('„200 000 €“ ako vlastné zdroje: celková kapacita = vlastné zdroje + úver; potrebné vlastné zdroje sa posudzujú osobitne', () => {
  const c = computeInvestment(full(300000, { legal_costs: 6000, reno: 0, furnishing: 0, setup: 0, reserve: 0 }))   // spolu 306 000
  const q = { cities: ['Bratislava'], budget_kind: 'equity', equity: 200000, loan_planned: 120000 }
  const b = budgetCheck(q, c)
  assert.equal(b.cap, 320000); assert.equal(b.status, 'within'); assert.equal(b.required_equity, 186000); assert.equal(b.equity_status, 'ok')
  const b2 = budgetCheck({ ...q, loan_planned: 80000 }, c)
  assert.equal(b2.status, 'over')   // 306 000 > 280 000
  // celková investícia 320 000 €, ale klient má len 100 000 € vlastných zdrojov a plánuje úver 160 000 €: celok sa vojde, vlastné zdroje nie
  const q3 = { cities: ['Bratislava'], budget_kind: 'total', budget_total: 320000, equity: 100000, loan_planned: 160000 }
  const b3 = budgetCheck(q3, c)
  assert.equal(b3.status, 'within'); assert.equal(b3.equity_status, 'short'); assert.equal(b3.required_equity, 146000)
  const m3 = ev(q3, prop({ price: 300000 }), c)
  assert.equal(m3.category, 'outside'); assert.equal(m3.hard.find((h) => h.key === 'equity').state, 'fail'); assert.equal(m3.hard.find((h) => h.key === 'budget').state, 'pass')
})
test('rozpočet bez významu sumy alebo bez úveru pri „len vlastné zdroje“ sa nehádže na nulu: je neznámy', () => {
  const c = computeInvestment(full(100000))
  assert.equal(budgetCheck({ budget_total: 200000, budget_kind: 'unknown' }, c).status, 'unknown')
  assert.equal(budgetCheck({ budget_kind: 'equity', equity: 100000 }, c).status, 'unknown')
  assert.equal(budgetCheck({}, c).status, 'unknown')
})
test('limit kúpnej ceny je samostatná povinná podmienka', () => {
  const c = computeInvestment(full(150000))
  const m = ev({ ...Q, price_cap: 140000 }, prop({ price: 150000 }), c)
  assert.equal(m.hard.find((h) => h.key === 'price_cap').state, 'fail'); assert.equal(m.category, 'outside')
})
test('povinné podmienky: mesto, vylúčená lokalita, dispozícia, výmera len interiér', () => {
  const c = computeInvestment(full(150000))
  assert.equal(ev({ cities: ['Košice'] }, prop(), c).category, 'outside')
  assert.equal(ev({ excluded_areas: ['Staré Mesto'] }, prop(), c).category, 'outside')
  assert.equal(ev({ rooms: [2] }, prop(), c).category, 'outside')
  assert.equal(ev({ rooms: [2, 3] }, prop(), c).category, 'match')
  assert.equal(ev({ area_min: 60 }, prop({ area_interior: 55, area_exterior: 20 }), c).category, 'outside')   // balkón sa nezapočíta
  assert.equal(ev({ area_min: 60 }, prop({ area_interior: null }), c).hard.find((h) => h.key === 'area').state, 'unknown')
})
test('povinné vs. preferované: nemožno overiť ≠ nesplnené; preferencia nikdy nevyradí', () => {
  const c = computeInvestment(full(150000))
  const m = ev({ must: { parking: true }, prefer: { elevator: true } }, prop({ features: { parking: null, elevator: false } }), c)
  assert.equal(m.hard.find((h) => h.key === 'must_parking').state, 'unknown'); assert.equal(m.category, 'match')
  assert.equal(m.preferences.find((x) => x.key === 'pref_elevator').state, 'fail')
  assert.equal(ev({ must: { parking: true } }, prop({ features: { parking: false } }), c).category, 'outside')
})
test('poradie: vyššie skóre pre viac splnených preferencií; zhody pred mimo podmienok', () => {
  const c = computeInvestment(full(150000))
  const q = { prefer: { elevator: true, balcony: true } }
  const a = ev(q, prop({ id: 'a', features: { elevator: true, balcony: true } }), c), b = ev(q, prop({ id: 'b', features: { elevator: true, balcony: false } }), c)
  assert.ok(a.score > b.score)
  const out = ev({ cities: ['Košice'] }, prop(), c)
  const sorted = rankMatches([{ ...out, id: 'out' }, { ...b, id: 'b' }, { ...a, id: 'a' }])
  assert.deepEqual(sorted.map((x) => x.id), ['a', 'b', 'out'])
})
test('nedostupné stavy (rezervované, predané, stiahnuté) nie sú v aktívnych odporúčaniach', () => {
  const c = computeInvestment(full(150000))
  for (const s of ['reserved', 'sold', 'withdrawn']) assert.equal(ev(Q, prop({ status: s }), c).category, 'unavailable')
  assert.equal(ev(Q, prop({ status: 'unknown' }), c).category, 'match')   // neznáma dostupnosť sa ukáže, ale označí
})
test('ekonomika je oddelená: bez prahov „čaká na nastavenie kritérií“, zhoda s klientom je nezávislá', () => {
  const c = computeInvestment(full(150000))
  const m = ev(Q, prop({ price: 150000 }), c)
  assert.equal(m.economics.status, 'awaiting_criteria')
  const m2 = ev(Q, prop({ price: 150000 }), c, { thresholds: { min_yield_total_pct: 50 } })
  assert.equal(m2.economics.status, 'below'); assert.equal(m2.category, 'match')   // ekonomika nevyraďuje zhodu
})
test('neaktuálny zdroj znižuje skóre a odporúčaný ďalší krok je skontrolovať zdroj', () => {
  const c = computeInvestment(full(150000))
  const a = ev(Q, prop({ price: 150000 }), c), old = ev(Q, prop({ price: 150000, last_checked_at: '2026-09-01T00:00:00Z' }), c)
  assert.ok(old.score < a.score); assert.match(old.next_step, /Skontrolovať zdroj/)
})
test('podpis zhody sa mení pri zmene ceny alebo stavu rozpočtu', () => {
  const c1 = computeInvestment(full(190000)), c2 = computeInvestment(full(150000))
  const m1 = ev(Q, prop({ price: 190000 }), c1), m2 = ev(Q, prop({ price: 150000 }), c2)
  assert.notEqual(matchSignature({ ...m1, fail_count: m1.fail_count }, { price: 190000, status: 'active' }), matchSignature(m2, { price: 150000, status: 'active' }))
})
