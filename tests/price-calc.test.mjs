import test from 'node:test'
import assert from 'node:assert/strict'
import * as P from '../lib/price-calc.js'
import { APARTMENTS, PRICE_DATA_DATE, CITY_NAMES } from '../lib/price-calc-data.js'

// Referenčný výpočet: doslovný prepis vzorcov z kalkulačky od Niny (18. 11. 2026), nezávislý od lib/price-calc.js.
function ref(a, n, g, k, rate, taxOn) {
  const cl = a.cleaning * k, sup = 0.7 * g * n, v = 5 / 105, L = a.commission
  let ca, cb
  switch (a.model) {
    case 'H': [ca, cb] = [1 - L - v, cl * v - cl - sup]; break
    case 'C': [ca, cb] = [1 - L, -cl - sup]; break
    case 'S': [ca, cb] = [1, -cl]; break
    case 'R': [ca, cb] = [1 - v, cl * v - cl - sup]; break
  }
  const tax = taxOn ? rate * g * n : 0
  const weak = Math.ceil((a.weakMin * n - cb) / ca)
  const disc = n >= 28 ? a.monthlyDisc : n >= 7 ? a.weeklyDisc : 0
  const fee = Math.max(0, a.extraFee || 0), inc = a.includedGuests || a.cap
  const xtra = fee * Math.max(0, g - inc) * n
  let strong = a.basePrice ? Math.ceil(a.basePrice * n * (1 - disc / 100) + xtra + a.cleaning * k) : Math.ceil(weak * 1.5 + xtra)
  if (strong < weak * 1.15) strong = Math.ceil(weak * 1.15)
  const mid = Math.ceil((weak + strong) / 2)
  return { weak, mid, strong, tax, own: (G) => ca * G + cb }
}

const base = (apt, over = {}) => ({ apt, checkIn: '2026-12-11', checkOut: '2026-12-14', guests: 2, cleanings: 1, cityTaxOn: true, cityTaxRate: apt.cityTax, ...over })
const byName = (s) => APARTMENTS.find((a) => a.name.startsWith(s))

test('dáta: 138 bytov, jedinečné názvy, platné modely a čísla', () => {
  assert.equal(APARTMENTS.length, 138)
  assert.equal(PRICE_DATA_DATE, '2026-11-18')
  assert.equal(new Set(APARTMENTS.map((a) => a.name)).size, 138)
  for (const a of APARTMENTS) {
    assert.ok(['H', 'C', 'S', 'R'].includes(a.model), a.name)
    assert.ok(a.cap >= 1 && Number.isInteger(a.cap), a.name)
    assert.ok(a.commission >= 0 && a.commission < 1, a.name)
    assert.ok(a.weakMin === (a.model === 'R' ? 25 : 30) || a.weakMin > 0, a.name)
    assert.ok(a.cityTax >= 0 && CITY_NAMES[a.city], a.name)
    assert.ok(a.includedGuests >= 1 && a.includedGuests <= a.cap, a.name)
  }
  assert.equal(APARTMENTS.filter((a) => a.basePrice == null).length, 1)
  assert.equal(APARTMENTS.filter((a) => a.extraFee < 0).length, 4)
})

test('zhoda s kalkulačkou od Niny: všetky byty × pobyty × hostia × upratovania × daň', () => {
  let checked = 0
  for (const a of APARTMENTS) {
    for (const n of [1, 2, 3, 6, 7, 14, 27, 28, 45, 61]) {
      for (let g = 1; g <= a.cap; g++) {
        for (const k of [1, 3]) {
          for (const taxOn of [true, false]) {
            const checkOut = P.addDaysIso('2026-12-11', n)
            const q = P.quote(base(a, { checkOut, guests: g, cleanings: k, cityTaxOn: taxOn }))
            const r = ref(a, n, g, k, a.cityTax, taxOn)
            assert.ok(q.ok)
            const [s, m, w] = q.tiers
            assert.equal(s.gross, r.strong, `${a.name} n=${n} g=${g}`)
            assert.equal(m.gross, r.mid)
            assert.equal(w.gross, r.weak)
            assert.ok(Math.abs(q.tax - r.tax) < 1e-9)
            assert.ok(Math.abs(s.owner - r.own(r.strong)) < 1e-9)
            assert.ok(Math.abs(w.owner - r.own(r.weak)) < 1e-9)
            assert.ok(Math.abs(w.total - (r.weak + r.tax)) < 1e-9)
            checked++
          }
        }
      }
    }
  }
  assert.ok(checked > 5000)
})

test('slabá cena dáva majiteľovi aspoň minimum, o 1 € menej už nie', () => {
  for (const a of APARTMENTS) {
    for (const n of [1, 3, 10]) {
      const q = P.quote(base(a, { checkOut: P.addDaysIso('2026-12-11', n), guests: Math.min(2, a.cap) }))
      const weak = q.tiers[2]
      assert.ok(weak.owner / n >= a.weakMin - 1e-9, `${a.name} n=${n}: ${weak.owner / n}`)
      assert.ok(q.ownerOf(weak.gross - 1) / n < a.weakMin + 1e-9, `${a.name} n=${n} minus 1`)
    }
  }
})

test('poradie cien: silná ≥ stredná ≥ slabá, silná aspoň 115 % slabej', () => {
  for (const a of APARTMENTS) {
    for (const n of [1, 2, 5, 8, 30]) {
      const q = P.quote(base(a, { checkOut: P.addDaysIso('2026-12-11', n), guests: 1 }))
      const [s, m, w] = q.tiers
      assert.ok(s.gross >= m.gross && m.gross >= w.gross, a.name)
      assert.ok(s.gross >= w.gross * 1.15 - 1e-9, a.name)
    }
  }
})

test('ručný príklad: Antolská (H, provízia 17 %), 3 noci, 2 hostia, 1 upratovanie, mestská daň 3 €/os./noc', () => {
  const a = byName('Antolská')
  const q = P.quote(base(a, { checkOut: '2026-12-14' }))
  // cb = 30·(5/105) − 30 − 0,7·2·3 = 1,4286 − 30 − 4,2 = −32,7714; ca = 1 − 0,17 − 0,047619 = 0,782381
  // slabá = ceil((30·3 + 32,7714) / 0,782381) = ceil(157,0…) 
  assert.equal(q.tiers[2].gross, Math.ceil((90 + 32.77142857142857) / 0.7823809523809524))
  assert.equal(q.tax, 3 * 2 * 3)
  assert.equal(q.tiers[2].total, q.tiers[2].gross + 18)
  assert.equal(q.nights, 3)
})

test('týždenná a mesačná zľava sa uplatní od 7. a 28. noci', () => {
  const a = byName('Chalupkova') // base 97, týždenná 5 %, mesačná 10 %
  const g = (n) => P.quote(base(a, { checkOut: P.addDaysIso('2026-12-11', n), guests: 1, cityTaxOn: false })).tiers[0].gross
  assert.equal(g(6), Math.ceil(97 * 6 + 0 + 40))
  assert.equal(g(7), Math.ceil(97 * 7 * 0.95 + 40))
  assert.equal(g(28), Math.ceil(97 * 28 * 0.9 + 40))
})

test('príplatok za extra osobu: počíta sa od (osôb v cene + 1)', () => {
  const a = APARTMENTS.find((x) => x.extraFee > 0 && x.includedGuests < x.cap)
  const n = 2
  const q1 = P.quote(base(a, { checkOut: '2026-12-13', guests: a.includedGuests }))
  const q2 = P.quote(base(a, { checkOut: '2026-12-13', guests: a.includedGuests + 1 }))
  assert.equal(q1.explain.extra.total, 0)
  assert.equal(q2.explain.extra.total, a.extraFee * n)
  assert.equal(q2.tiers[0].extraTotal, a.extraFee * n)
  assert.equal(q2.tiers[2].extraTotal, 0) // slabá cena je z minima majiteľa, nie z cenníka
})

test('chýbajúce údaje: nenastavený príplatok a chýbajúca základná cena sa nehádajú, upozornia', () => {
  const noFee = APARTMENTS.find((a) => a.extraFee < 0)
  assert.ok(P.quote(base(noFee)).warnings.some((w) => w.code === 'fee_unset'))
  const noBase = byName('Baštová')
  const q = P.quote(base(noBase))
  assert.ok(q.warnings.some((w) => w.code === 'no_base'))
  assert.equal(q.tiers[0].gross, Math.ceil(q.tiers[2].gross * 1.5 + 0)) // 1,5 × slabá
})

test('vstupy: neplatné dátumy a počty nikdy nevyrobia NaN', () => {
  const a = byName('Antolská')
  assert.deepEqual(P.quote(base(a, { checkOut: '2026-12-11' })), { ok: false, error: 'Odchod musí byť po príchode.' })
  assert.equal(P.quote(base(a, { checkIn: 'x' })).ok, false)
  assert.equal(P.quote({ ...base(a), apt: null }).ok, false)
  const q = P.quote(base(a, { guests: 99, cleanings: -5, cityTaxRate: 'abc' }))
  assert.equal(q.guests, a.cap)
  assert.equal(q.cleanings, 1)
  assert.equal(q.taxRate, a.cityTax)
  for (const t of q.tiers) for (const v of [t.gross, t.total, t.perNight, t.owner, t.ownerPerNight]) assert.ok(Number.isFinite(v))
  assert.equal(P.quote(base(a, { guests: 0 })).guests, 1)
})

test('slabé obdobie: október, november, január, február; varovanie mimo neho', () => {
  assert.equal(P.weakShare('2026-11-10', 3), 1)
  assert.equal(P.weakShare('2026-07-10', 3), 0)
  assert.equal(P.weakShare('2026-12-30', 4), 2 / 4) // 30., 31. dec (nie) + 1., 2. jan (áno)
  const a = byName('Antolská')
  assert.ok(P.quote(base(a, { checkIn: '2026-07-10', checkOut: '2026-07-12' })).warnings.some((w) => w.code === 'not_weak_period'))
  assert.ok(!P.quote(base(a, { checkIn: '2026-11-10', checkOut: '2026-11-12' })).warnings.some((w) => w.code === 'not_weak_period'))
})

test('počet nocí: preskakuje letný čas a neplatné dátumy dajú 0', () => {
  assert.equal(P.nightsBetween('2026-03-27', '2026-03-30'), 3) // zmena času 29. 3.
  assert.equal(P.nightsBetween('2026-10-24', '2026-10-27'), 3) // zmena času 25. 10.
  assert.equal(P.nightsBetween('2026-02-30', '2026-03-02'), 0)
  assert.equal(P.nightsBetween('', '2026-03-02'), 0)
})

test('kontrola ceny z Guesty: úrovne a minimum', () => {
  const a = byName('Antolská')
  const q = P.quote(base(a, { checkOut: '2026-12-14' }))
  const [s, m, w] = q.tiers
  assert.equal(P.checkGuestyPrice(q, s.total).level, 'strong')
  assert.equal(P.checkGuestyPrice(q, m.total).level, 'mid')
  assert.equal(P.checkGuestyPrice(q, w.total).level, 'weak')
  const bad = P.checkGuestyPrice(q, w.total - 1)
  assert.equal(bad.level, 'bad')
  assert.equal(bad.minimum, w.gross + q.tax)
  assert.equal(P.checkGuestyPrice(q, 0), null)
  assert.equal(P.checkGuestyPrice(q, ''), null)
})

test('R2R: príspevok na nájom a minimum 25 €', () => {
  const a = APARTMENTS.find((x) => x.model === 'R')
  const q = P.quote(base(a))
  assert.equal(q.ownerLabel, 'Príspevok na nájom')
  assert.equal(a.weakMin, 25)
  assert.match(q.tiers[2].hint, /25 €/)
})

test('formátovanie a text ponuky pre hosťa (bez údajov o majiteľovi)', () => {
  assert.equal(P.fmtEur(1234.4), '1 234 €')
  assert.equal(P.fmtEur(-5), '−5 €')
  assert.equal(P.fmtEur1(12.34), '12,3 €')
  assert.equal(P.nightsWord(1) + P.nightsWord(3) + P.nightsWord(5), 'nocnocinocí')
  const a = byName('Antolská')
  const q = P.quote(base(a, { checkOut: '2026-12-14' }))
  const t = P.guestOffer(q, 'mid', '2026-12-11', '2026-12-14', 'sk')
  assert.match(t, /Antolská, Studio: 11\. 12\. 2026 – 14\. 12\. 2026, 3 noci, 2 hostia\./)
  assert.match(t, /vrátane mestskej dane/)
  assert.ok(!/majiteľ|provízia|slab|siln|stredn/i.test(t))
  assert.match(P.guestOffer(q, 'mid', '2026-12-11', '2026-12-14', 'en'), /3 nights, 2 guests/)
  assert.equal(P.guestOffer({ ok: false }, 'mid', 'a', 'b'), '')
})

test('Guesty ID: každý byt ho má, je jedinečné a má 24 hex znakov', () => {
  const ids = APARTMENTS.map((a) => a.guestyId)
  assert.ok(ids.every((id) => /^[0-9a-f]{24}$/.test(id)))
  assert.equal(new Set(ids).size, 138)
  assert.equal(byName('Antolská').guestyId, '6ad9eddc12036300315cbcd3')
})

test('odkaz na rezerváciu v CS: ubytovanie + upratovanie = cena bez dane z kalkulačky, daň navrch', () => {
  const a = byName('Antolská')
  const q = P.quote(base(a, { checkOut: '2026-12-14' }))
  for (const key of ['strong', 'mid', 'weak']) {
    const href = P.reservationLink(q, key, '2026-12-11', '2026-12-14')
    const u = new URL(href, 'https://x')
    assert.equal(u.pathname, '/cs/rezervacia')
    assert.equal(u.searchParams.get('listing'), a.guestyId)
    assert.equal(u.searchParams.get('od'), '2026-12-11')
    assert.equal(u.searchParams.get('do'), '2026-12-14')
    assert.equal(u.searchParams.get('hostia'), '2')
    const t = q.tiers.find((x) => x.key === key)
    assert.equal(Number(u.searchParams.get('cena')) + Number(u.searchParams.get('upratovanie')), t.gross)
    assert.equal(Number(u.searchParams.get('upratovanie')), a.cleaning)
    assert.equal(Number(u.searchParams.get('dan')), q.tax)
  }
  assert.equal(new URL(P.reservationLink(q, 'mid', '2026-12-11', '2026-12-14'), 'https://x').searchParams.get('ponuka'), 'Stredná')
  assert.equal(P.reservationLink({ ok: false }, 'mid', 'a', 'b'), null)
  assert.equal(P.reservationLink(q, 'nope', '2026-12-11', '2026-12-14'), null)
  // bez ID bytu alebo keď po odpočítaní upratovania nezostane kladné ubytovanie, tlačidlo sa nenabíja
  assert.equal(P.reservationLink({ ...q, apt: { ...a, guestyId: null } }, 'mid', 'a', 'b'), null)
  assert.equal(P.reservationLink({ ...q, apt: { ...a, cleaning: 9999 } }, 'mid', '2026-12-11', '2026-12-14'), null)
})

test('odkaz na dostupnosť a počiatočný výber z adresy', () => {
  assert.equal(P.availabilityLink('2026-12-11', '2026-12-14', 3), '/cs/volne?od=2026-12-11&do=2026-12-14&hostia=3')
  assert.equal(P.availabilityLink('x', '2026-12-14', 3), null)
  const a = byName('Antolská')
  const i = APARTMENTS.indexOf(a)
  const today = '2026-11-18'
  assert.deepEqual(P.parseInitial(APARTMENTS, { byt: a.guestyId, od: '2026-12-01', do: '2026-12-05', hostia: '3' }, today), { aptIdx: i, checkIn: '2026-12-01', checkOut: '2026-12-05', guests: 3 })
  assert.equal(P.parseInitial(APARTMENTS, { byt: a.name }, today).aptIdx, i)
  // neplatné alebo minulé vstupy sa ticho zahodia (kalkulačka použije predvolené)
  assert.deepEqual(P.parseInitial(APARTMENTS, { byt: 'neznámy', od: '2020-01-01', do: 'x', hostia: '-2' }, today), { aptIdx: null, checkIn: null, checkOut: null, guests: null })
  assert.equal(P.parseInitial(APARTMENTS, { od: '2026-12-05', do: '2026-12-01' }, today).checkOut, null)
  assert.equal(P.parseInitial(APARTMENTS, { byt: ['a', 'b'] }, today).aptIdx, null)
})
