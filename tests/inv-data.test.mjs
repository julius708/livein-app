import test from 'node:test'
import assert from 'node:assert/strict'
import { buildScenario } from './helpers/scenario.mjs'
import { propertyList, propertyDetail, inquiryDetail } from '../lib/inv-data.js'
import { matchInquiry } from '../lib/inv-store.js'

test('ukážkový tok: zoznam, detail nehnuteľnosti a dopytu vrátia očakávané údaje', async () => {
  const { s, ids } = await buildScenario()
  const list = await propertyList(s)
  assert.equal(list.ready, true); assert.ok(list.props.length >= 7)
  const a = list.calcs[list.props.find((p) => p.id === ids.A).calc_id]
  assert.equal(a.complete, true); assert.ok(a.yield > 0); assert.equal(typeof a.quality, 'number')
  const c = list.calcs[list.props.find((p) => p.id === ids.C).calc_id]
  assert.equal(c.complete, false); assert.ok(c.unknown >= 4)
  const d = await propertyDetail(s, ids.A)
  assert.ok(d.calc.result.investment); assert.ok(d.hist.length >= 1); assert.ok(d.listings.length >= 1); assert.equal(d.matches.length, 1)
  assert.equal(d.candidates.length, 1)   // možný duplikát (druhý portál bez čísla domu)
  const q = await inquiryDetail(s, ids.q)
  assert.equal(q.lead.name, 'Testovací Klient')
  const cats = Object.fromEntries(['match', 'outside', 'unavailable'].map((k) => [k, q.matches.filter((m) => m.category === k).length]))
  assert.ok(cats.match >= 2); assert.ok(cats.outside >= 2); assert.equal(cats.unavailable, 1)   // predaný byt zostáva v histórii dopytu ako „už nedostupný“
})
test('dopyt: byt za 195 000 € s nákladmi 15 000 € je mimo podmienok, Petržalka vylúčená, Košice mimo mesta', async () => {
  const { s, ids } = await buildScenario()
  const q = await inquiryDetail(s, ids.q)
  const by = (pid) => q.matches.find((m) => m.property_id === pid)
  assert.equal(by(ids.B).category, 'outside'); assert.equal(by(ids.B).result.budget.status, 'over')
  assert.equal(by(ids.A).category, 'match'); assert.equal(by(ids.A).decision, 'shortlist')
  const outsideLabels = q.matches.filter((m) => m.category === 'outside').flatMap((m) => m.result.hard.filter((h) => h.state === 'fail').map((h) => h.key))
  assert.ok(outsideLabels.includes('excluded')); assert.ok(outsideLabels.includes('city'))
  assert.equal(by(ids.A).result.financing.loan, 120000)   // úver klienta: cashflow a vlastné zdroje sa posudzujú osobitne
  assert.equal(by(ids.A).result.financing.incomplete, true)   // kým firma nezadá sadzbu so zdrojom, cashflow po splátkach sa nevymýšľa
  assert.equal(by(ids.A).result.metrics_base.cashflow_year, null)
})
test('po zadaní sadzby so zdrojom a dátumom sa pri dopyte vypočíta splátka, úrok, istina a cashflow po splátkach', async () => {
  const { s, ids } = await buildScenario()
  s.db.tables.inv_settings = [{ key: 'calc', value: { mortgage: { rate_pct: 4, years: 25, rate_source: 'ponuka banky X', rate_date: '2026-11-10' } } }]
  await matchInquiry(s, ids.q, { now: Date.parse('2026-11-12T10:00:00Z') })
  const q = await inquiryDetail(s, ids.q)
  const m = q.matches.find((x) => x.property_id === ids.A)
  assert.ok(Math.abs(m.result.financing.payment - 633.41) < 0.02)   // 120 000 € / 4 % / 25 r. (nezávisle: 633,41 €)
  assert.ok(m.result.financing.interestYear1 > 0 && m.result.financing.principalYear1 > 0)
  assert.equal(m.result.financing.rate_documented, true)
  assert.ok(m.result.metrics_base.cashflow_year != null); assert.equal(m.result.metrics_base.equity, Math.round((165000 - 120000) * 100) / 100)
})
