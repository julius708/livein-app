import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanInquiry, budgetSummary } from '../lib/inv-inquiry.js'

test('dopyt: rozpočet bez určenia významu je „neznámy“, nie celková investícia', () => {
  const r = cleanInquiry({ budget_total: '200 000' })
  assert.equal(r.patch.budget_total, 200000); assert.equal(r.patch.budget_kind, 'unknown')
  assert.equal(budgetSummary(r.patch).ambiguous, true)
  assert.equal(cleanInquiry({ budget_total: 200000, budget_kind: 'equity' }).patch.budget_kind, 'equity')
})
test('dopyt: neznáme údaje ostanú null/prázdne, nie nula', () => {
  const p = cleanInquiry({ cities: 'Bratislava, Košice', equity: '', loan_planned: '', reno_willing: '', wants_management: 'true' }).patch
  assert.deepEqual(p.cities, ['Bratislava', 'Košice']); assert.equal(p.equity, null); assert.equal(p.loan_planned, null)
  assert.equal(p.reno_willing, null); assert.equal(p.wants_management, true)
})
test('dopyt: povinné a preferované vlastnosti sa nekryjú; nezaškrtnuté sa neukladajú', () => {
  const p = cleanInquiry({ must: { parking: true, elevator: false }, prefer: { parking: true, balcony: true } }).patch
  assert.deepEqual(p.must, { parking: true }); assert.deepEqual(p.prefer, { balcony: true })
})
test('dopyt: neplatné vstupy sa odmietnu', () => {
  for (const bad of [{ rooms: '0' }, { rooms: 'x' }, { types: 'garáž' }, { budget_total: 'abc' }, { budget_total: -5 }, { area_min: 80, area_max: 50 }, { status: 'hotovo' }, { purchase_by: '12.11.2026' }]) assert.ok(cleanInquiry(bad).error, JSON.stringify(bad))
})
test('dopyt: čiastočná úprava mení len zadané polia', () => {
  const p = cleanInquiry({ next_step: 'Zavolať' }, { partial: true }).patch
  assert.deepEqual(Object.keys(p), ['next_step'])
})
