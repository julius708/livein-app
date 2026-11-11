import test from 'node:test'
import assert from 'node:assert/strict'
import { loanTerms, strMonth, breakEvenOccupancy, investmentTotal, computeInvestment, evaluateThresholds, seasonalMonths, ltrYear, benchAdr, mergeSettings, hashInputs } from '../lib/inv-calc.js'

// Kontrolné hodnoty sú vypočítané nezávisle (Python, ručný rozpis), nie týmto kódom.
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`)
const S = mergeSettings()

test('hypotéka 100 000 € / 4 % / 25 r.: splátka, úrok a istina za 1. rok', () => {
  const t = loanTerms({ loan: 100000, rate_pct: 4, years: 25 })
  near(t.payment, 527.84); near(t.interestYear1, 3956.73); near(t.principalYear1, 2377.31); near(t.annualDebt, 527.84 * 12, 0.1)
})
test('hypotéka 150 000 € / 6 % / 20 r. = 1 074,65 €', () => near(loanTerms({ loan: 150000, rate_pct: 6, years: 20 }).payment, 1074.65))
test('nulový úrok = rovnomerná splátka, úrok 0', () => {
  const t = loanTerms({ loan: 120000, rate_pct: 0, years: 20 })
  assert.equal(t.payment, 500); assert.equal(t.interestYear1, 0); assert.equal(t.principalYear1, 6000)
})
test('neznáma sadzba alebo splatnosť: splátka sa nevymýšľa (nie je 0)', () => {
  const t = loanTerms({ loan: 100000, rate_pct: null, years: 25 })
  assert.equal(t.incomplete, true); assert.equal(t.payment, undefined); assert.deepEqual(t.missing, ['rate_pct'])
  assert.deepEqual(loanTerms({ loan: 100000, rate_pct: 3, years: null }).missing, ['years'])
  assert.equal(loanTerms({ loan: 0, rate_pct: 3, years: 10 }).none, true)
})
test('krátkodobý prenájom: 100 €/noc, 72 %, pobyt 3, upratovanie 32,5, energie 200 → 1 200,80 €', () => {
  const m = strMonth({ adr: 100, occupancy: 72, own: 0, stay: 3, clean: 32.5, cleanPaid: 0, portal: 0, management: 17, vat: 5, software: 50, fixed: 200 })
  near(m.gross, 2160); near(m.management, 367.2); near(m.vat, 108); near(m.cleaning, 234); near(m.net, 1200.8)
})
test('bod zvratu obsadenosti (náklady 250 €/mes.) = 12,4 %', () => {
  const v = { adr: 100, occupancy: 72, own: 0, stay: 3, clean: 32.5, cleanPaid: 0, portal: 0, management: 17, vat: 5, software: 50, fixed: 200 }
  near(breakEvenOccupancy(v, 0), 12.4, 0.06)
  assert.equal(breakEvenOccupancy({ ...v, adr: 0 }, 0), null)
})
test('neznáme mesačné náklady nie sú nula: výsledok je predbežný a fixed_known=false', () => {
  const m = strMonth({ adr: 100, occupancy: 72, own: 0, stay: 3, clean: 32.5, cleanPaid: 0, portal: 0, management: 17, vat: 5, software: 50, fixed: null })
  assert.equal(m.fixed_known, false)
})
test('investícia: cena + náklady, parkovanie a provízia v cene sa nepripočítajú druhýkrát', () => {
  const t = investmentTotal({ price: 195000, parking_mandatory: true, parking_in_price: true, commission_in_price: true, legal_costs: 3000, reno: 5000, furnishing: 5000, setup: 1000, reserve: 1000 }, S)
  assert.equal(t.known_total, 210000); assert.equal(t.complete, true)
  assert.equal(t.items.find((i) => i.key === 'parking').amount, 0)
})
test('investícia: povinné parkovanie mimo ceny a provízia 3 % mimo ceny sa pripočítajú', () => {
  const t = investmentTotal({ price: 100000, parking_mandatory: true, parking_in_price: false, parking_price: 15000, commission_in_price: false, commission_pct: 3, legal_costs: 0, reno: 0, furnishing: 0, setup: 0, reserve: 0 }, S)
  assert.equal(t.known_total, 118000)
})
test('investícia: chýbajúce položky sú „neznáme“, nie nula, a celok nie je kompletný', () => {
  const t = investmentTotal({ price: 150000 }, S)
  assert.equal(t.complete, false)
  const keys = t.unknown.map((u) => u.key)
  for (const k of ['parking_mandatory', 'commission', 'legal', 'reno', 'furnishing', 'setup', 'reserve']) assert.ok(keys.includes(k), k)
  assert.equal(t.known_total, 150000)
})
test('provízia mimo ceny bez percenta ani sumy = neznáma', () => {
  const t = investmentTotal({ price: 100000, commission_in_price: false }, S)
  assert.ok(t.unknown.some((u) => u.key === 'commission'))
})
const FULL = { price: 195000, parking_mandatory: false, commission_in_price: true, legal_costs: 3000, reno: 5000, furnishing: 5000, setup: 1000, reserve: 1000, monthly_fixed: 250, city: 'Bratislava', district: 'Staré Mesto', bedrooms: 2, area_interior: 62 }
test('celý výpočet: financovanie, výnosy a cashflow', () => {
  const r = computeInvestment(FULL, { loan: 100000, rate_pct: 4, years: 25, rate_source: 'banka X', rate_date: '2026-11-01' })
  const b = r.metrics.base
  assert.equal(r.investment.known_total, 210000)
  near(b.debt_year, 6334.08, 0.1)
  near(b.cashflow_year, b.noi_year - b.debt_year, 0.01)
  near(b.cash_on_cash_pct, (b.cashflow_year / 110000) * 100, 0.001)
  near(b.yield_total_pct, (b.noi_year / 210000) * 100, 0.001)
  assert.equal(r.equity, 110000)
  assert.ok(b.break_even_occupancy_after_debt > b.break_even_occupancy)
  assert.ok(r.metrics.conservative.noi_year < b.noi_year && b.noi_year < r.metrics.optimistic.noi_year)
  assert.equal(r.financing.rate_documented, true)
})
test('sezónne mesiace sa sčítajú presne na ročný výsledok', () => {
  const m = seasonalMonths(12345.67)
  near(m.reduce((t, x) => t + x.value, 0), 12345.67, 0.0001)
  assert.equal(m.length, 12)
})
test('bez úveru sa financovanie nepočíta a cashflow po splátkach je neznáme (null)', () => {
  const r = computeInvestment(FULL, null)
  assert.equal(r.financing, null); assert.equal(r.metrics.base.cashflow_year, null); assert.equal(r.metrics.base.cash_on_cash_pct, null)
})
test('úver bez sadzby: výsledok označí chýbajúcu sadzbu, cashflow po splátkach nie je vymyslené', () => {
  const r = computeInvestment(FULL, { loan: 100000, years: 25 })
  assert.equal(r.financing.incomplete, true); assert.equal(r.metrics.base.cashflow_year, null)
  assert.ok(r.quality.missing.includes('loan_rate_pct'))
})
test('chýbajúce mesačné náklady: predbežný výsledok a nižšia kvalita, nie nula', () => {
  const full = computeInvestment(FULL), partial = computeInvestment({ ...FULL, monthly_fixed: null })
  assert.equal(partial.metrics.base.provisional, true); assert.equal(full.metrics.base.provisional, false)
  assert.ok(partial.quality.score < full.quality.score); assert.ok(partial.quality.missing.includes('monthly_fixed'))
})
test('neúplná investícia nie je „overená“ a metriky sú predbežné', () => {
  const r = computeInvestment({ price: 150000, city: 'Bratislava', bedrooms: 1 })
  assert.equal(r.investment.complete, false); assert.equal(r.metrics.base.provisional, true); assert.notEqual(r.quality.level, 'overena')
})
test('bez porovnateľných bytov (menej ako 3) sa cena nevymýšľa', () => {
  assert.equal(benchAdr({ city: 'Trnava', bedrooms: 2 }), null)
  const r = computeInvestment({ ...FULL, city: 'Trnava' })
  assert.equal(r.str.base.none, true); assert.equal(r.metrics.base, null); assert.ok(r.quality.missing.includes('str_adr'))
})
test('zadaná cena za noc prebije portfólio a má pôvod „ručne“', () => {
  const r = computeInvestment({ ...FULL, rental: { adr: 120 } })
  assert.equal(r.str.base.adr, 120)
  assert.equal(r.inputs.find((i) => i.key === 'str_adr').kind, 'manual')
})
test('portfólio: základ ceny nesie dátum a upozornenie na províziu portálu je zachované', () => {
  const r = computeInvestment(FULL)
  const adr = r.inputs.find((i) => i.key === 'str_adr')
  assert.equal(adr.kind, 'portfolio'); assert.match(adr.ref, /2026-10-12/)
  assert.ok(r.warnings.some((w) => /provízi/.test(w)))
  assert.ok(r.str.conservative.adr < r.str.base.adr)   // konzervatívny = historický základ bez prirážky
})
test('dlhodobý prenájom: nájomné, neobsadenosť, správa a náklady; bez vstupov = neznáme', () => {
  const l = ltrYear({ rent: 800, vacancy_pct: 5, management_pct: 8, owner_costs: 100 })
  near(l.gross, 9600); near(l.vacancy, 480); near(l.income, 9120); near(l.management, 729.6); near(l.net, 7190.4)
  const none = ltrYear({ rent: null }); assert.equal(none.none, true)
  const part = ltrYear({ rent: 800 }); assert.equal(part.complete, false); assert.deepEqual(part.missing, ['ltr_vacancy_pct', 'ltr_management_pct', 'ltr_owner_costs'])
})
test('režim dlhodobý prenájom nemá krátkodobé scenáre', () => {
  const r = computeInvestment({ ...FULL, rental_mode: 'ltr', rental: { ltr_rent: 800, ltr_vacancy_pct: 5, ltr_management_pct: 8, ltr_owner_costs: 100 } })
  assert.equal(Object.keys(r.str).length, 0); near(r.metrics.ltr.noi_year, 7190.4)
})
test('prahy: kým nie sú nastavené, stav je „čaká na nastavenie kritérií“', () => {
  const r = computeInvestment(FULL)
  assert.equal(evaluateThresholds(r, {}).status, 'awaiting_criteria')
  assert.equal(evaluateThresholds(r, { min_yield_total_pct: 99 }).status, 'below')
  assert.equal(evaluateThresholds(r, { min_yield_total_pct: 0.1 }).status, 'meets')
  assert.equal(evaluateThresholds(r, { min_cash_on_cash_pct: 1 }).status, 'unknown')   // bez úveru sa nedá posúdiť
})
test('odtlačok vstupov je stabilný a mení sa pri zmene ceny', () => {
  const a = computeInvestment(FULL), b = computeInvestment({ ...FULL }), c = computeInvestment({ ...FULL, price: 190000 })
  assert.equal(a.hash, b.hash); assert.notEqual(a.hash, c.hash)
  assert.equal(hashInputs({ a: 1, b: 2 }), hashInputs({ b: 2, a: 1 }))
})
