import test from 'node:test'
import assert from 'node:assert/strict'
import { findApartment, runPriceTool, PRICE_TOOL } from '../lib/guru-price.js'
import { quote } from '../lib/price-calc.js'
import { APARTMENTS } from '../lib/price-calc-data.js'

test('byt sa nájde podľa časti názvu, diakritiky aj Guesty ID; nejednoznačné sa nehádá', () => {
  assert.equal(findApartment('antolska').apt.name, 'Antolská, Studio')
  assert.equal(findApartment('KE: Hlavná, Royal').apt.guestyId, '685925c5fed72600123166b1')
  assert.equal(findApartment('6ad9eddc12036300315cbcd3').apt.name, 'Antolská, Studio')
  const many = findApartment('Skypark')
  assert.ok(!many.apt && many.candidates.length >= 2 && many.candidates.length <= 10)
  assert.ok(findApartment('neexistujúci byt xyz').error)
  assert.ok(findApartment('').error)
})

test('price_quote dáva rovnaké čísla ako kalkulačka (dane zapnutá, 2 hostia)', () => {
  const apt = APARTMENTS.find((a) => a.name === 'Antolská, Studio')
  const r = runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', check_out: '2026-12-14', guests: 2 }, { today: '2026-11-18' })
  const q = quote({ apt, checkIn: '2026-12-11', checkOut: '2026-12-14', guests: 2, cleanings: 1, cityTaxOn: true, cityTaxRate: apt.cityTax })
  assert.equal(r.nights, 3)
  assert.equal(r.prices.strong.total_eur, Math.round(q.tiers[0].total))
  assert.equal(r.prices.mid.price_without_city_tax_eur, q.tiers[1].gross)
  assert.equal(r.prices.weak.owner_receives_total_eur, Math.round(q.tiers[2].owner))
  assert.equal(r.city_tax_included, true)
  assert.match(r.link, /^\/kalkulacka\?byt=6ad9eddc12036300315cbcd3&od=2026-12-11&do=2026-12-14&hostia=2$/)
})

test('price_quote: noci namiesto odchodu, daň sa pri 60+ nociach predvolene nepripočíta, neplatné vstupy dajú chybu', () => {
  const a = runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', nights: 2 })
  assert.equal(a.check_out, '2026-12-13')
  const long = runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', nights: 70 })
  assert.equal(long.city_tax_included, false)
  assert.equal(runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', nights: 70, city_tax: true }).city_tax_included, true)
  assert.ok(runPriceTool({ apartment: 'Antolská', check_in: 'zle' }).error)
  assert.ok(runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', check_out: '2026-12-10' }).error)
  assert.ok(runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', nights: 400 }).error)
  assert.ok(runPriceTool({ apartment: 'Skypark', check_in: '2026-12-11', nights: 2 }).candidates)
})

test('price_quote: viac hostí než kapacita sa zníži a upozorní; definícia nástroja je kompletná', () => {
  const apt = APARTMENTS.find((a) => a.name === 'Antolská, Studio')
  const r = runPriceTool({ apartment: 'Antolská', check_in: '2026-12-11', nights: 2, guests: 9 })
  assert.equal(r.guests, apt.cap)
  assert.match(r.guests_note, /kapacitu/)
  assert.equal(PRICE_TOOL.name, 'price_quote')
  assert.deepEqual(PRICE_TOOL.input_schema.required, ['apartment', 'check_in'])
})
