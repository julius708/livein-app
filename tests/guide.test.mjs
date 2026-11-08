import test from 'node:test'
import assert from 'node:assert/strict'
import { randomCode, isCode, CODE_ALPHABET, guideUrl, reviewUrl, wifiDecision, pickReservation, rateLimited, anonLog, issuePlan, visibleEvents, effectiveRules, addressKey, matchCards } from '../lib/guide/core.js'

test('verejný kód: 8 znakov, bez 0/O/1/l/I, náhodný a unikátny', () => {
  const set = new Set()
  for (let i = 0; i < 2000; i++) { const c = randomCode(); assert.ok(isCode(c), c); assert.ok(![...c].some((ch) => '0O1lI'.includes(ch))); set.add(c) }
  assert.equal(set.size, 2000)
  assert.ok(!CODE_ALPHABET.includes('0') && !CODE_ALPHABET.includes('O') && !CODE_ALPHABET.includes('I'))
  assert.equal(guideUrl('https://app.live-in.international/', 'ABCDEFGH'), 'https://app.live-in.international/g/ABCDEFGH')
  assert.equal(reviewUrl('https://app.live-in.international', 'ABCDEFGH'), 'https://app.live-in.international/g/ABCDEFGH/recenzia')
})
test('Wi-Fi: správny hosť prejde (meno alebo e-mail), cudzia jednotka, neaktívny pobyt a iné meno nie', () => {
  const unit = { listing_id: 'L1' }
  const res = { id: 'r1', listingId: 'L1', status: 'confirmed', checkIn: '2026-11-07', checkOut: '2026-11-10', guestName: 'Ján Novák', guestEmail: 'xyz@guest.booking.com' }
  assert.equal(wifiDecision({ unit, reservation: res, name: 'jan novak', email: '', today: '2026-11-08' }).how, 'name')
  assert.equal(wifiDecision({ unit, reservation: res, name: 'Novák Ján', email: 'iny@example.com', today: '2026-11-08' }).how, 'name')
  assert.equal(wifiDecision({ unit, reservation: res, name: '', email: 'XYZ@guest.booking.com', today: '2026-11-08' }).how, 'email')
  assert.equal(wifiDecision({ unit, reservation: res, name: 'Novák', email: '', today: '2026-11-08' }).why, 'identity')
  assert.equal(wifiDecision({ unit, reservation: res, name: 'Peter Novák', email: '', today: '2026-11-08' }).why, 'identity')
  assert.equal(wifiDecision({ unit: { listing_id: 'L2' }, reservation: res, name: 'Ján Novák', today: '2026-11-08' }).why, 'other_unit')
  assert.equal(wifiDecision({ unit, reservation: res, name: 'Ján Novák', today: '2026-11-10' }).why, 'inactive')
  assert.equal(wifiDecision({ unit, reservation: { ...res, status: 'canceled' }, name: 'Ján Novák', today: '2026-11-08' }).why, 'status')
  assert.equal(wifiDecision({ unit, reservation: null, name: 'x y' }).ok, false)
  const other = { ...res, id: 'r2', guestName: 'Anna Horváthová' }
  assert.equal(pickReservation([other, res], { unit, name: 'Jan Novak', today: '2026-11-08' }).reservationId, 'r1')
  assert.equal(pickReservation([other], { unit, name: 'Jan Novak', today: '2026-11-08' }).ok, false)
})
test('limit pokusov podľa IP, rezervácie aj bytu; log bez PII', () => {
  assert.equal(rateLimited({ ip: 3, reservation: 1, unit: 5 }), false)
  assert.equal(rateLimited({ ip: 10 }), true); assert.equal(rateLimited({ reservation: 5 }), true); assert.equal(rateLimited({ unit: 40 }), true)
  const l = anonLog({ code: 'ABCDEFGH', outcome: 'success', at: 't' })
  assert.deepEqual(Object.keys(l).sort(), ['at', 'code', 'outcome'])
  assert.ok(!JSON.stringify(l).match(/@|heslo|password/i))
})
test('vydanie štítku: všetky podmienky, inak na kontrolu; opakovanie nevydá duplikát', () => {
  const unit = { listing_id: 'L1', listing_verified: true, address: 'Ulica 1', public_code: 'ABCDEFGH', gbp_url: 'https://g.page/r/x/review' }
  const ok = issuePlan({ unit, card: {}, support_phone: '+421 900 000 000', links: { guide_ok: true, review_ok: true }, existing: [] })
  assert.equal(ok.issue, true); assert.equal(ok.key, 'L1:1')
  const again = issuePlan({ unit, card: {}, support_phone: '+421 900 000 000', links: { guide_ok: true, review_ok: true }, existing: [{ listing_id: 'L1', template_version: 1, notified_at: 'x' }] })
  assert.equal(again.issue, false); assert.equal(again.status, 'issued'); assert.equal(again.notify, false)
  const bad = issuePlan({ unit: { ...unit, gbp_url: '' }, card: {}, support_phone: '', links: { guide_ok: true, review_ok: false }, existing: [] })
  assert.equal(bad.status, 'review'); assert.equal(bad.reasons.length, 3)
})
test('podujatia: skončené sa skryjú; pravidlá: výnimka bytu nahradí spoločné', () => {
  const ev = visibleEvents([{ title: 'a', starts_at: '2026-11-01', ends_at: '2026-11-02' }, { title: 'b', starts_at: '2026-12-01', ends_at: '2026-12-02' }], Date.parse('2026-11-08'))
  assert.deepEqual(ev.map((e) => e.title), ['b'])
  const common = [{ body: { sk: 'Nefajčiť.', en: 'No smoking.' } }, { body: { sk: 'Ticho po 22:00.', en: 'Quiet after 10 pm.' } }]
  assert.equal(effectiveRules(common, null, 'en'), 'No smoking.\nQuiet after 10 pm.')
  assert.equal(effectiveRules(common, { sk: 'Psy vítané.' }, 'sk'), 'Psy vítané.')
})
test('párovanie Prílohy A: jednoznačná adresa sa spáruje, viac jednotiek ide na kontrolu', () => {
  assert.equal(addressKey('Ferienčíkova 2437/16, 811 08 Bratislava - Old Town, Slovakia'), 'feriencikova 16')
  assert.equal(addressKey('Apartmánový Dom Žilinská, Žilinská 2, 811 06 Bratislava - Old Town, Slovakia'), 'zilinska 2')
  const apts = [{ id: 'A', a: 'Antolská 2, 851 05 Bratislava, Slovakia' }, { id: 'B1', a: 'Bottova 5, 811 09 Bratislava - Old Town, Slovakia' }, { id: 'B2', a: 'Bottova 5, 811 09 Bratislava, Slovakia' }]
  const cards = [{ address_full: 'Antolská 2, 851 05 Bratislava, Slovakia' }, { address_full: 'Bottova 5, 811 09 Bratislava I, Slovakia' }, { address_full: 'Neznáma 9, Bratislava' }]
  const r = matchCards(cards, apts)
  assert.deepEqual(r.map((x) => x.status).sort(), ['matched', 'review', 'unmatched'])
  assert.equal(r.find((x) => x.status === 'matched').listing_id, 'A')
})

test('štítok: logo priamo na zelenej bez bielej plochy, oba QR nesú len trvalé HTTPS odkazy s kódom', async () => {
  const { labelLayout, qrModules, renderLabel, LABEL } = await import('../lib/guide/label.js')
  for (const variant of ['standard', 'inverted']) {
    const L = labelLayout({ variant })
    assert.equal(L.bg.color, 'green'); assert.equal(L.logo.background, 'none')
    // biela plocha je len pod QR kódmi (štandardný variant), nikdy pod logom
    const whiteBoxes = L.qrs.filter((q) => q.box && q.box.color === 'white')
    assert.equal(whiteBoxes.length, variant === 'standard' ? 2 : 0)
    for (const q of L.qrs) assert.ok(q.y + q.size < L.logo.y, 'QR nezasahuje do loga')
  }
  assert.ok(Math.abs(LABEL.w - 150 * 72 / 25.4) < 0.01 && Math.abs(LABEL.h - 105 * 72 / 25.4) < 0.01)
  const r = await renderLabel({ address: 'Ukážková 12, Bratislava', name: 'UKÁŽKA', code: 'ABCDEFGH', supportPhone: '+421 900 000 000', baseUrl: 'https://app.live-in.international', sample: true })
  assert.deepEqual(r.urls, { guide: 'https://app.live-in.international/g/ABCDEFGH', review: 'https://app.live-in.international/g/ABCDEFGH/recenzia' })
  assert.ok(r.bytes.length > 5000 && String.fromCharCode(...r.bytes.slice(0, 5)) === '%PDF-')
  const m = qrModules(r.urls.guide); assert.ok(m.size >= 29 && m.dark.length > 200)
  // v PDF nie je žiadne heslo ani kód bytu okrem verejného kódu v URL
  const txt = Buffer.from(r.bytes).toString('latin1'); assert.ok(!/password|heslo/i.test(txt))
})

test('dotazník: 11 jazykov úplných, odpovede sa čistia na známe možnosti, darček v jazyku hosťa', async () => {
  const { LANGS, SURVEY, QUESTIONS, cleanAnswers, giftText } = await import('../lib/guide/survey.js')
  assert.ok(LANGS.length >= 10)
  for (const l of LANGS) { const s = SURVEY[l]; for (const q of QUESTIONS) { assert.ok(s.q[q.id], `${l} ${q.id}`); for (const o of q.options || []) assert.ok(s.o[o], `${l} ${o}`) } for (const k of Object.keys(SURVEY.en.ui)) assert.ok(s.ui[k], `${l} ui ${k}`) }
  const a = cleanAnswers({ country: '  Poland ', party: 'couple', purpose: 'hack', nights: 'n3_5', matters: ['wifi', 'x', 'wifi'], recommend: '5', age: 'a55', comment: 'x'.repeat(900), bogus: 1 })
  assert.deepEqual(a, { country: 'Poland', party: 'couple', nights: 'n3_5', matters: ['wifi'], age: 'a55', recommend: 5, comment: 'x'.repeat(500) })
  assert.deepEqual(cleanAnswers({ recommend: 9 }), {})
  assert.equal(giftText('de', { value: '10 %', url: 'https://booking.live-in.international', code: 'LIVEIN10' }), 'Code für 10 % Rabatt bei Direktbuchung auf booking.live-in.international: LIVEIN10')
})
