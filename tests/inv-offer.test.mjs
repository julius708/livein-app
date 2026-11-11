import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOffer, introText, offerNotices, clientView } from '../lib/inv-offer.js'
import { computeInvestment } from '../lib/inv-calc.js'
import { evaluateMatch } from '../lib/inv-match.js'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const prop = { id: 'p1', status: 'active', city: 'Bratislava', district: 'Staré Mesto', address: 'Dunajská 12', type: 'byt', rooms: 3, bedrooms: 2, area_interior: 62, area_exterior: 6, price: 150000, parking_mandatory: false, commission_in_price: true, legal_costs: 4000, reno: 5000, furnishing: 4000, setup: 1000, reserve: 1000, monthly_fixed: 250, features: {}, last_checked_at: '2026-11-11T10:00:00Z', seller: 'Jana Predajcová +421900000000', notes_internal: 'Predajca tlačí na rýchly predaj' }
const inq = { id: 'q1', cities: ['Bratislava'], budget_total: 200000, budget_kind: 'total', goal: 'str' }
const mk = (p = prop) => { const calc = computeInvestment(p); const r = evaluateMatch({ inquiry: inq, property: p, calc, now: NOW }); return { match: { id: 'm1', score: r.score, category: r.category, decision: 'shortlist', calc_id: 'c1', result: r }, property: p, calc } }

test('ponuka: klientska časť má cenu, investíciu, scenáre s predpokladmi, riziká, dostupnosť a ďalší krok', async () => {
  const o = await buildOffer({ inquiry: inq, picks: [mk()], now: NOW })
  assert.equal(o.ok, true)
  const it = o.content.items[0]
  assert.equal(it.price, 150000); assert.equal(it.total_investment.known, 165000); assert.equal(it.total_investment.complete, true)
  assert.equal(it.scenarios.length, 3); assert.match(it.scenarios[0].assumptions, /obsadenosť/)
  assert.ok(it.assumptions.length > 0); assert.ok(it.risks.some((r) => /nepotvrdil predajca/.test(r)))
  assert.match(it.availability.text, /zatiaľ nepotvrdil/); assert.ok(it.next_step)
  assert.match(o.content.disclaimer, /nie sú prísľubom/)
})
test('interné poznámky, skóre a kontakt predajcu sú len v internej časti, nie v klientskom náhľade', async () => {
  const o = await buildOffer({ inquiry: inq, picks: [mk()], now: NOW })
  const view = JSON.stringify(clientView({ content: o.content, reviewed_at: null }))
  for (const secret of ['Jana Predajcová', 'tlačí na rýchly predaj', '+421900000000', 'rank_reason', '"score"']) assert.equal(view.includes(secret), false, secret)
  assert.ok(o.internal.items[0].notes.includes('tlačí')); assert.ok(o.internal.items[0].seller.includes('Jana'))
  assert.equal(JSON.stringify(o.content).includes('Jana Predajcová'), false)
})
test('chýbajúce náklady sa v ponuke vypíšu ako neznáme riziko, nie ako nula', async () => {
  const p = { ...prop, legal_costs: undefined, reno: undefined, furnishing: undefined, setup: undefined, reserve: undefined }
  const o = await buildOffer({ inquiry: inq, picks: [mk(p)], now: NOW })
  const it = o.content.items[0]
  assert.equal(it.total_investment.complete, false); assert.ok(it.total_investment.unknown.length >= 4)
  assert.ok(it.risks.some((r) => /Nie sú známe všetky náklady/.test(r)))
})
test('zamietnutá alebo nedostupná zhoda sa do ponuky nedostane; prázdny výber tiež nie', async () => {
  const a = mk(); a.match.decision = 'rejected'
  assert.equal((await buildOffer({ inquiry: inq, picks: [a] })).ok, false)
  const b = mk({ ...prop, status: 'sold' })
  assert.equal((await buildOffer({ inquiry: inq, picks: [b] })).ok, false)
  assert.equal((await buildOffer({ inquiry: inq, picks: [] })).ok, false)
})
test('AI text sa zahodí, ak obsahuje číslo, ktoré nie je vo faktoch, alebo prísľub výnosu', async () => {
  const items = (await buildOffer({ inquiry: inq, picks: [mk()], now: NOW })).content.items
  assert.equal((await introText({ items, inquiry: inq, ai: async () => 'Výnos 12 % ročne je istý.' })).ai, false)
  assert.equal((await introText({ items, inquiry: inq, ai: async () => 'Garantovaný výnos.' })).ai, false)
  const ok = await introText({ items, inquiry: inq, ai: async () => 'Byt na Dunajskej ulici vyhovuje vášmu mestu a rozpočtu.' })
  assert.equal(ok.ai, true)
  assert.equal((await introText({ items, inquiry: inq, ai: async () => { throw new Error('x') } })).ai, false)
})
test('ponuka si drží pôvodný výpočet a upozorní na novšie údaje, zmenu ceny a nedostupnosť', async () => {
  const o = await buildOffer({ inquiry: inq, picks: [mk()], now: NOW })
  assert.equal(o.calc_snapshot.p1.price, 150000)
  const n = offerNotices({ calc_snapshot: o.calc_snapshot }, { p1: { id: 'p1', price: 140000, calc_id: 'c2', status: 'reserved' } })
  assert.equal(n.length, 2); assert.match(n[0].text, /Cena sa .* zmenila/); assert.match(n[1].text, /rezervované/)
  assert.equal(offerNotices({ calc_snapshot: o.calc_snapshot }, { p1: { id: 'p1', price: 150000, calc_id: 'c1', status: 'active' } }).length, 0)
})
