import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canBilling, num, lineCents, lineTotal, counted, missingAmount, eurC, decStr, isProbable, probableStav, nextMonth, monthLabel, monthName, stavyFor, validStav, stavClass, katOrder,
  firmFromTags, guestyFirmList, autoFirm, firmOf, aptFirm, isKosice, isNew, castOf, groupOf, aptCard, buildGroups, billingStats, matchItem,
  cleanPatch, autoStav, carryOver, priceRows, splitShop, linenNeeds, linenRows, LINEN_PRESETS, exportSheets, exportFileName, asanaUrl, APTS,
} from '../lib/billing-core.js'

const it = (o = {}) => ({ byt: 'Test 1', kat: 'Iné', polozka: 'x', ks: 1, cena: 10, suma: null, stav: 'Suma OK', ord: 1, ...o })

test('roly: vyúčtovanie vidí admin, asistentka a operácie', () => {
  assert.ok(canBilling({ active: true, roles: ['assistant'] })); assert.ok(canBilling({ roles: ['admin'] })); assert.ok(canBilling({ roles: ['operations', 'cleaning'] }))
  assert.ok(!canBilling({ roles: ['cleaning'] })); assert.ok(!canBilling({ roles: ['crm'] })); assert.ok(!canBilling(null)); assert.ok(!canBilling({ active: false, roles: ['admin'] }))
})
test('suma riadku = ks × cena; ak niektorá chýba, použije sa suma; centy bez driftu', () => {
  assert.equal(lineCents(it({ ks: 3, cena: 4.99 })), 1497)
  assert.equal(lineCents(it({ ks: 0.5, cena: 3.25 })), 163)
  assert.equal(lineCents(it({ ks: 2, cena: '16,5' })), 3300)
  assert.equal(lineCents(it({ ks: null, cena: 5, suma: 12.34 })), 1234)
  assert.equal(lineCents(it({ ks: 2, cena: null, suma: 7 })), 700)
  assert.equal(lineCents(it({ ks: 2, cena: null, suma: null })), null)
  assert.equal(lineCents(it({ ks: 0, cena: 9 })), 0)
  assert.equal(lineTotal(it({ ks: 1, cena: 0.1 })) + lineTotal(it({ ks: 1, cena: 0.2 })), 0.30000000000000004) // preto sa sčítava v centoch
  assert.equal(num('1 234,5'), 1234.5); assert.equal(num(''), null); assert.equal(num('abc'), null)
})
test('do súčtu sa nezapočítavajú Neúčtovať, Cenník, Pravdepodobne … a Nepriradené k bytu', () => {
  for (const s of ['Neúčtovať', 'Cenník (bežná cena)', 'Nepriradené k bytu', 'Pravdepodobne november', 'Pravdepodobne január']) assert.equal(counted(it({ stav: s })), false, s)
  for (const s of ['Suma OK', 'Doplniť sumu', 'Čaká na Patrika (cena opravy)', 'Skontrolovať duplicitu']) assert.equal(counted(it({ stav: s })), true, s)
  const items = [it({ ks: 1, cena: 100 }), it({ stav: 'Neúčtovať', ks: 1, cena: 50 }), it({ stav: 'Pravdepodobne november', ks: 1, cena: 70 }), it({ stav: 'Doplniť sumu', ks: null, cena: null, suma: null })]
  const st = billingStats(items)
  assert.equal(st.sumC, 10000); assert.equal(st.missing, 1)
})
test('riadok, ktorý sa počíta a nemá sumu, je „bez sumy“; neúčtovaný nie je', () => {
  assert.equal(missingAmount(it({ ks: null, cena: null, suma: null, stav: 'Doplniť sumu' })), true)
  assert.equal(missingAmount(it({ ks: null, cena: null, suma: null, stav: 'Neúčtovať' })), false)
  assert.equal(missingAmount(it({ ks: 1, cena: 5 })), false)
})
test('mesiace a stav „Pravdepodobne [ďalší mesiac]“ vrátane prelomu roka', () => {
  assert.equal(nextMonth('2026-10-01'), '2026-11-01'); assert.equal(nextMonth('2026-12-01'), '2027-01-01')
  assert.equal(probableStav('2026-10-01'), 'Pravdepodobne november'); assert.equal(probableStav('2026-12-01'), 'Pravdepodobne január')
  assert.equal(monthLabel('2026-10-01'), 'október 2026'); assert.equal(monthName('2027-03-01'), 'marec')
  assert.deepEqual(stavyFor('2026-10-01').slice(4, 7), ['Nepriradené k bytu', 'Pravdepodobne november', 'Neúčtovať'])
  assert.ok(validStav('Pravdepodobne apríl')); assert.ok(!validStav('Pravdepodobne')); assert.ok(!validStav('hocičo'))
  assert.equal(stavClass('Pravdepodobne máj'), 's-nov'); assert.equal(stavClass('Suma OK'), 's-ok'); assert.ok(isProbable('Pravdepodobne máj'))
})
test('formát sumy a čísla do poľa', () => {
  assert.equal(eurC(123456), '1 234,56 €'); assert.equal(eurC(0), '0,00 €'); assert.equal(eurC(-5), '−0,05 €'); assert.equal(eurC(938996), '9 389,96 €')
  assert.equal(decStr(12.5), '12,50'); assert.equal(decStr(null), ''); assert.equal(decStr('3'), '3,00')
})

// ——— firma bytu ———
test('firma z Guesty tagov (aj „LIVE - IN Slovakia“) a bez Košíc', () => {
  assert.equal(firmFromTags(['parking', 'LIVE-IN Management s.r.o.']), 'M'); assert.equal(firmFromTags(['LIVE-IN International s.r.o.']), 'I')
  assert.equal(firmFromTags(['LIVE - IN Slovakia s.r.o.']), 'S'); assert.equal(firmFromTags(['pet friendly']), ''); assert.equal(firmFromTags(null), '')
  const list = guestyFirmList([{ name: 'Antolská, Studio', tags: ['LIVE-IN Management s.r.o.'] }, { name: 'KE: Hlavná', tags: ['LIVE-IN Management s.r.o.'] }, { name: 'Bez firmy', tags: [] }, { name: 'Košice byt', city: 'Košice', tags: ['LIVE-IN Management s.r.o.'] }])
  assert.deepEqual(list, [['Antolská, Studio', 'M']])
  assert.ok(isKosice('KE: Hlavná')); assert.ok(isKosice('x', 'Košice - Staré Mesto')); assert.ok(!isKosice('Kopčianka, Haven', 'Bratislava'))
})
test('firma riadku: zadaná má prednosť, potom Guesty, potom zoznam z prototypu, inak „x“', () => {
  const guesty = [['Heuhaus A, Central', 'M'], ['Nová ulica 5', 'I']]
  assert.equal(firmOf({ byt: 'Nová ulica 5', firma: 'Slovakia' }, { guesty }), 'S')
  assert.equal(firmOf({ byt: 'Nová ulica 5' }, { guesty }), 'I')
  assert.equal(firmOf({ byt: 'Eurovea 1' }, { guesty: [] }), 'S')
  assert.equal(firmOf({ byt: 'Eurovea 3' }, {}), 'S')
  assert.equal(firmOf({ byt: 'Ventúrska A' }, {}), 'I'); assert.equal(firmOf({ byt: 'Dunajská 3, Modern' }, {}), 'I'); assert.equal(firmOf({ byt: 'Dunajská C' }, {}), 'M')
  assert.equal(firmOf({ byt: 'Neexistujúca 99' }, {}), 'x'); assert.equal(firmOf({ byt: '' }, {}), 'x')
  assert.equal(firmOf({ byt: 'Eurovea' }, {}), 'x') // nejednoznačné: Eurovea je pri viacerých bytoch inej firmy
  assert.equal(autoFirm('Žižkova Riverside', APTS), 'I')
})
test('firma celého bytu: prvá výslovne zadaná, inak z názvu', () => {
  assert.equal(aptFirm([it({ byt: 'Zámocká' }), it({ byt: 'Zámocká', firma: 'Management' })], {}), 'M')
  assert.equal(aptFirm([it({ byt: 'Zámocká' })], {}), 'I')
  assert.equal(aptFirm([], {}), 'x')
})

// ——— skupiny, karty, medzisúčty ———
test('zaradenie riadkov: nové byty, existujúce, cenník bez súčtu, nepriradené', () => {
  assert.equal(groupOf(it({ byt: 'Klariská 12' })), 'N'); assert.equal(groupOf(it({ byt: 'Vysoká', typ: 'novy' })), 'N'); assert.equal(groupOf(it({ byt: 'Vysoká', kat: 'Nový byt – zariadenie' })), 'N')
  assert.equal(groupOf(it({ byt: 'Klariská 12', typ: 'existujuci' })), 'E'); assert.equal(groupOf(it({ byt: 'Vysoká' })), 'E')
  assert.equal(groupOf(it({ byt: '', kat: 'Všeobecné položky do bytov' })), 'B'); assert.equal(groupOf(it({ byt: '', kat: 'Poznámka z Účtovníctva' })), 'O')
  assert.ok(isNew(it({ byt: 'x', kat: 'Modrá guľa – 3 nové byty (október)' })))
})
test('poradie kategórií: známe podľa zoznamu, skupina nových bytov tretia, ostatné nakoniec', () => {
  assert.equal(katOrder('Nový byt – zariadenie'), 0); assert.equal(katOrder('Modrá guľa – 3 nové byty (október)'), 2); assert.equal(katOrder('Klariská – 2 nové byty (november)'), 2); assert.equal(katOrder('Neznáma'), 99)
})
test('medzisúčty častí bytu a Kristína Dicer podľa predpony položky', () => {
  const mg = [
    it({ byt: 'Modrá guľa (Suché mýto 4)', cast: '3. poschodie (A3.3)', ks: 1, cena: 1000 }), it({ byt: 'Modrá guľa (Suché mýto 4)', cast: '3. poschodie (A3.3)', ks: 2, cena: 90.7 }),
    it({ byt: 'Modrá guľa (Suché mýto 4)', cast: '5. poschodie (A5.3)', ks: 1, cena: 1586.41 }), it({ byt: 'Modrá guľa (Suché mýto 4)', cast: '2. poschodie', ks: 1, cena: 120 }),
    it({ byt: 'Modrá guľa (Suché mýto 4)', ks: 1, cena: 49.96 }), it({ byt: 'Modrá guľa (Suché mýto 4)', ks: 1, cena: 500, stav: 'Neúčtovať' }),
  ]
  const a = aptCard('Modrá guľa (Suché mýto 4)', 'N', mg, {})
  assert.deepEqual(a.subs.map((s) => [s.name, s.sumC]), [['2. poschodie', 12000], ['3. poschodie (A3.3)', 118140], ['5. poschodie (A5.3)', 158641], ['Spoločné / neurčený byt', 4996]])
  assert.equal(a.sumC, 12000 + 118140 + 158641 + 4996)
  const d = [it({ byt: 'Kristína Dicer (Záhradnícka 52 + Miletičova 38)', polozka: 'Záhradnícka 52: Prvotné upratovanie', ks: 1, cena: 30 }), it({ byt: 'Kristína Dicer (Záhradnícka 52 + Miletičova 38)', polozka: 'Miletičova 38 – 1. posch.: lampa', ks: 1, cena: 10 }), it({ byt: 'Kristína Dicer (Záhradnícka 52 + Miletičova 38)', polozka: 'Bez dvojbodky', ks: 1, cena: 5 })]
  assert.equal(castOf(d[0]), 'Záhradnícka 52'); assert.equal(castOf(d[2]), '')
  const c = aptCard('Kristína Dicer', 'N', d, {})
  assert.deepEqual(c.subs.map((x) => x.name), ['Miletičova 38 – 1. posch.', 'Záhradnícka 52', 'Spoločné / neurčený byt'])
})
test('karta bytu: počty bez sumy, čaká na Patrika, treba zistiť; riadky podľa kategórie a poradia', () => {
  const items = [it({ ord: 3, kat: 'Iné' }), it({ ord: 2, kat: 'Nový byt – zariadenie', stav: 'Čaká na Patrika (cena opravy)', ks: null, cena: null }), it({ ord: 1, kat: 'Nový byt – zariadenie', zistit: 'Max' }), it({ ord: 4, ks: null, cena: null, suma: null, stav: 'Doplniť sumu' })]
  const c = aptCard('Test 1', 'E', items, {})
  assert.deepEqual(c.items.map((x) => x.ord), [1, 2, 3, 4]); assert.equal(c.miss, 2); assert.equal(c.patrik, 1); assert.equal(c.zistit, 1); assert.equal(c.count, 4); assert.equal(c.subs, null)
})
test('skupiny: poradie a cenník bez súčtu, košické byty sa nedostanú ani do skupín cez filter', () => {
  const items = [it({ byt: 'Klariská 12' }), it({ byt: 'Vysoká' }), it({ byt: '', kat: 'Všeobecné položky do bytov', stav: 'Cenník (bežná cena)', ks: 1, cena: 62.9 }), it({ byt: '', kat: 'Iné' })]
  const g = buildGroups(items, {})
  assert.deepEqual([g.N.length, g.E.length, g.B.length, g.O.length], [1, 1, 1, 1]); assert.equal(g.B[0].name, 'BEŽNÉ POLOŽKY NA BYTY'); assert.equal(g.B[0].sumC, 0); assert.equal(g.B[0].firm, null)
  assert.equal(billingStats(items).apts, 2)
})
test('filter: hľadanie, firma a stav', () => {
  const x = it({ byt: 'Zámocká', polozka: 'Lampa', pozn: 'od Juliusa', stav: 'Doplniť sumu' })
  assert.ok(matchItem(x, { q: 'JULIUS' }, {})); assert.ok(!matchItem(x, { q: 'stôl' }, {})); assert.ok(matchItem(x, { firma: 'I' }, {})); assert.ok(!matchItem(x, { firma: 'M' }, {}))
  assert.ok(!matchItem(x, { stav: 'Suma OK' }, {})); assert.ok(matchItem(x, { stav: 'Doplniť sumu' }, {})); assert.ok(!matchItem(it({ byt: '' }), { firma: 'M' }, {}))
})

// ——— úpravy riadku ———
test('validácia úprav: čísla, stav, firma, dátum, neznáme polia', () => {
  assert.deepEqual(cleanPatch({ ks: '2', cena: '16,5', polozka: '  Vankúš  ', hocico: 1 }).patch, { ks: 2, cena: 16.5, polozka: 'Vankúš' })
  assert.equal(cleanPatch({ cena: 'abc' }).error !== undefined, true); assert.equal(cleanPatch({ stav: 'nič' }).error !== undefined, true); assert.equal(cleanPatch({ ks: 1e9 }).error !== undefined, true)
  assert.equal(cleanPatch({ firma: 'Management' }).patch.firma, 'Management'); assert.equal(cleanPatch({ firma: 'M' }).patch.firma, 'Management'); assert.equal(cleanPatch({ firma: '' }).patch.firma, null); assert.ok(cleanPatch({ firma: 'Iná' }).error)
  assert.equal(cleanPatch({ datum: '2026-10-05' }).patch.datum, '2026-10-05'); assert.ok(cleanPatch({ datum: '5.10.2026' }).error); assert.equal(cleanPatch({ datum: '' }).patch.datum, null)
  assert.deepEqual(cleanPatch({ foto: ['a', '', 'b'] }).patch.foto, ['a', 'b']); assert.equal(cleanPatch({ ks: '' }).patch.ks, null); assert.equal(cleanPatch({ stav: 'Pravdepodobne marec' }).patch.stav, 'Pravdepodobne marec')
  assert.equal(cleanPatch({ pozn: '' }).patch.pozn, null)
})
test('automatický stav: ks + cena prepne „Doplniť sumu“ na „Suma OK“; zadaná suma tiež, okrem duplicity a neúčtovať', () => {
  assert.equal(autoStav({ stav: 'Doplniť sumu', ks: 1, cena: null }, { cena: 5 }).stav, 'Suma OK')
  assert.equal(autoStav({ stav: 'Doplniť sumu', ks: null, cena: null }, { cena: 5 }).stav, undefined)
  assert.equal(autoStav({ stav: 'Čaká na Patrika (cena opravy)', ks: 1, cena: null }, { cena: 5 }).stav, undefined)
  assert.equal(autoStav({ stav: 'Doplniť sumu' }, { suma: 12.3, cena: null }).stav, 'Suma OK')
  assert.equal(autoStav({ stav: 'Skontrolovať duplicitu' }, { suma: 12.3, cena: null }).stav, undefined)
  assert.equal(autoStav({ stav: 'Doplniť sumu' }, { stav: 'Neúčtovať', cena: 5 }).stav, 'Neúčtovať')
})

// ——— nový mesiac ———
test('prenos do ďalšieho mesiaca: len „Pravdepodobne [nový mesiac]“, stav podľa známej sumy', () => {
  const items = [
    { id: 'a', stav: 'Pravdepodobne november', ks: 1, cena: 20 }, { id: 'b', stav: 'Pravdepodobne november', ks: null, cena: null, suma: null },
    { id: 'c', stav: 'Pravdepodobne december', ks: 1, cena: 5 }, { id: 'd', stav: 'Suma OK', ks: 1, cena: 5 }, { id: 'e', stav: 'Neúčtovať' },
  ]
  assert.deepEqual(carryOver(items, '2026-11-01'), [{ id: 'a', stav: 'Suma OK' }, { id: 'b', stav: 'Doplniť sumu' }])
  assert.deepEqual(carryOver(items, '2026-12-01'), [{ id: 'c', stav: 'Suma OK' }])
  assert.deepEqual(carryOver(items, '2027-01-01'), [])
})
test('cenník: riadky pre nové obdobie z aktívnych položiek a rozdelenie obchodu', () => {
  const rows = priceRows([{ polozka: 'Sprchová hlavica s hadicou', obchod: 'OBI', cena: 6.14, active: true }, { polozka: 'Vysávač', obchod: null, cena: 62.9 }, { polozka: 'Vyradené', cena: 1, active: false }])
  assert.equal(rows.length, 2); assert.equal(rows[0].polozka, 'Sprchová hlavica s hadicou (OBI)'); assert.equal(rows[0].stav, 'Cenník (bežná cena)'); assert.equal(rows[0].byt, ''); assert.equal(rows[1].polozka, 'Vysávač')
  assert.deepEqual(splitShop('Dávkovač mydla (Jysk)'), { polozka: 'Dávkovač mydla', obchod: 'Jysk' }); assert.deepEqual(splitShop('Vysávač Kärcher'), { polozka: 'Vysávač Kärcher', obchod: null })
})

// ——— kalkulačka prádla ———
test('prádlo: byt pre 4 osoby (A + C) = 465,43 €, byt pre 2 osoby (B) = 304,12 €', () => {
  assert.equal(linenRows({ ...LINEN_PRESETS['4'], bathrooms: 1 }).perApartmentC, 46543)
  assert.equal(linenRows({ ...LINEN_PRESETS['2'], bathrooms: 1 }).perApartmentC, 30412)
  assert.equal(linenNeeds({ beds: { A: 1, C: 1 }, bathrooms: 1 }).bathmat, 3); assert.equal(linenNeeds({ beds: { A: 1, C: 1 }, bathrooms: 2 }).bathmat, 6)
})
test('prádlo: odpočíta sa to, čo mal majiteľ (Modrá guľa: 2 veľké paplóny a 2 vankúše → 381,93 € na byt)', () => {
  const r = linenRows({ ...LINEN_PRESETS['4'], bathrooms: 1, owned: { duvetL: 2, pillow: 2 } })
  assert.equal(r.perApartmentC, 38193)
  const three = linenRows({ ...LINEN_PRESETS['4'], bathrooms: 1, owned: { duvetL: 2, pillow: 2 }, apartments: 3 })
  assert.equal(three.totalC, 38193 * 3); assert.equal(three.rows.find((x) => x.id === 'sheet').ks, 15)
  assert.ok(!three.rows.some((x) => x.id === 'duvetL')); assert.equal(three.rows.find((x) => x.id === 'pillow').ks, 6)
  assert.equal(linenRows({ ...LINEN_PRESETS['2'], owned: { pillow: 99 } }).rows.find((x) => x.id === 'pillow'), undefined) // nikdy záporné množstvo
  assert.equal(linenRows({ beds: { A: 0, B: 0, C: 0 }, bathrooms: 0 }).totalC, 0)
})
test('prádlo: položky riadkov majú jasný popis a súčet riadkov = súčet na byt', () => {
  const r = linenRows({ ...LINEN_PRESETS['4'], bathrooms: 1 })
  assert.ok(r.rows.every((x) => x.polozka.startsWith('Prádlo Horeca: ') && x.ks > 0 && x.cena > 0)); assert.equal(r.rows.reduce((t, x) => t + x.sumC, 0), r.totalC)
})

// ——— export ———
test('export: hárky „Prehľad“ a „Položky po bytoch“, súčet bez cenníka, časti bytu', () => {
  const items = [
    it({ byt: 'Klariská 12', firma: 'Management', ks: 2, cena: 10 }),
    it({ byt: 'Modrá guľa (Suché mýto 4)', typ: 'novy', cast: '2. poschodie', ks: 1, cena: 120 }), it({ byt: 'Modrá guľa (Suché mýto 4)', typ: 'novy', ks: 1, cena: 30 }),
    it({ byt: 'Vysoká', ks: 1, cena: 5.5 }), it({ byt: '', kat: 'Všeobecné položky do bytov', stav: 'Cenník (bežná cena)', ks: 1, cena: 62.9, polozka: 'Vysávač' }),
  ]
  const [ov, po] = exportSheets('2026-10-01', items, {})
  assert.equal(ov.name, 'Prehľad'); assert.equal(po.name, 'Položky po bytoch'); assert.equal(po.freeze, true)
  assert.equal(ov.rows[0][0].v, 'Vyúčtovanie október 2026 – prehľad po bytoch')
  assert.deepEqual(ov.rows[2].map((c) => c.v), ['Typ', 'Byt', 'Firma', 'Suma €', 'Položiek', 'Bez sumy', 'Čaká na Patrika', 'Treba zistiť'])
  const last = ov.rows[ov.rows.length - 1]; assert.equal(last[1].v, 'SPOLU (bez cenníka)'); assert.equal(last[3].v, 20 + 150 + 5.5)
  assert.ok(ov.rows.some((r) => r[1] === '   ↳ 2. poschodie')); assert.ok(ov.rows.some((r) => r[1] === '   ↳ Spoločné / neurčený byt'))
  assert.ok(po.rows.some((r) => r[0] && String(r[0].v).startsWith('BEŽNÉ POLOŽKY NA BYTY'))); assert.ok(po.rows.some((r) => r[0] && String(r[0].v).startsWith('Klariská 12  (LIVE-IN Management)')))
  assert.equal(exportFileName('2026-10-01'), 'Vyuctovanie_oktober_2026.xlsx'); assert.equal(exportFileName('2027-02-01'), 'Vyuctovanie_februar_2027.xlsx')
  assert.equal(asanaUrl('123'), 'https://app.asana.com/0/0/123'); assert.equal(asanaUrl('https://app.asana.com/x'), 'https://app.asana.com/x'); assert.equal(asanaUrl(''), '')
})

// ——— akceptačné kritériá na skutočnej zálohe (spúšťa sa len lokálne: VYUCT_JSON=/cesta/zaloha.json npm test) ———
test('záloha október 2026: kontrolné súčty zo zadania', { skip: !process.env.VYUCT_JSON }, () => {
  const rows = JSON.parse(readFileSync(process.env.VYUCT_JSON, 'utf8')).map((r) => ({ ...r, cast: r.cast || null }))
  assert.equal(rows.length, 239)
  const g = buildGroups(rows, {})
  const find = (n) => [...g.N, ...g.E].find((a) => a.name.startsWith(n))
  const mg = find('Modrá guľa'); assert.equal(mg.sumC, 428218)
  assert.deepEqual(Object.fromEntries(mg.subs.map((s) => [s.name, s.sumC])), { '2. poschodie': 12000, '3. poschodie (A3.3)': 118140, '5. poschodie (A5.3)': 158641, '6. poschodie (A6.3)': 134441, 'Spoločné / neurčený byt': 4996 })
  assert.equal(find('Kristína Dicer').sumC, 72529)
  assert.equal(billingStats(rows).sumC, 939996)
  assert.equal(g.B[0].sumC, 0); assert.equal(g.B[0].count, 18)
  assert.equal(rows.filter((r) => isKosice(r.byt)).length, 0)
})
