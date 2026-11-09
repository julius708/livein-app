import test from 'node:test'
import assert from 'node:assert/strict'
import { stripCodes, bilingual, sanitizeSections, completeness, draftFromGuesty, GUESTY_CUSTOM_FIELDS, containsCode } from '../lib/guide/content.js'

test('kódy a heslá sa nahradia zástupným textom', () => {
  assert.ok(!/2105/.test(stripCodes('Open it with code 2105 and take the chip.')))
  assert.ok(/kód dostanete/.test(stripCodes('Otvorte kódom 4433#', 'sk')))
  assert.ok(!/8899/.test(stripCodes('Zadajte 8899# na klávesnici')))
  assert.equal(stripCodes('Go to the entrance and ring the bell.'), 'Go to the entrance and ring the bell.')
  assert.ok(containsCode('kód: 1234')); assert.ok(!containsCode('vchod z ulice'))
})
test('jazyk sa odhadne, sekcie sa vyčistia, úplnosť sa počíta', () => {
  assert.deepEqual(bilingual('Prosím, nechajte kľúče v apartmáne.'), { sk: 'Prosím, nechajte kľúče v apartmáne.', en: '' })
  assert.deepEqual(bilingual('Leave the keys on the table.'), { sk: '', en: 'Leave the keys on the table.' })
  const s = sanitizeSections([{ key: 'House_Rules', title: { sk: 'Pravidlá', en: 'Rules' }, items: [{ title: { sk: 'Fajčenie' }, body: { sk: 'Zákaz, kód 9999' } }, { title: {}, body: {} }] }, { key: 'x', items: [] }])
  assert.equal(s.length, 1); assert.equal(s[0].key, 'house_rules'); assert.equal(s[0].items.length, 1); assert.ok(!/9999/.test(s[0].items[0].body.sk)); assert.equal(s[0].icon, '📋')
  const c = completeness({ unit: { address: 'A 1' }, card: { arrival: { sk: 'x' }, approved: true, sections: [{}, {}] }, wifi: true })
  assert.equal(c.score, 70); assert.deepEqual(c.missing, ['checkout', 'parking', 'help', 'gbp'])
  assert.equal(completeness({}).score, 0)
})
test('návrh z Guesty: adresa, časy, dvojjazyčné texty bez kódov, Wi-Fi, sekcie', () => {
  const l = { address: { full: 'Klariská 8, 811 03 Bratislava, Slovakia', lat: 48.1, lng: 17.1, city: 'Bratislava' }, defaultCheckInTime: '16:00', defaultCheckOutTime: '11:00',
    checkInInstructions: { primaryCheckIn: 'DOOR_CODE', notes: '1. Go to the address.\n2. Open the keysafe with code 2105 and take the chip.' }, checkOutInstructions: 'Return the chip to box 62.', parkingInstructions: 'Street parking, pay via EasyPark.',
    customFields: [{ fieldId: GUESTY_CUSTOM_FIELDS.checkin_sk, value: '1. Choďte na adresu.\n2. Otvorte schránku kódom 2105.' }, { fieldId: GUESTY_CUSTOM_FIELDS.checkout_sk, value: 'Pri odchode vráťte čip.' }, { fieldId: '6ab385c5bcf98e0011a9419d', value: 'Paplón: 3' }],
    amenities: ['Wifi', 'Kitchen'], accommodates: 4, bedrooms: 1, bathrooms: 1, wifiName: 'LIVEIN-8', wifiPassword: 'secret123', houseManual: 'IMPORTANT: arrival after 19:00 by e-mail.' }
  const d = draftFromGuesty(l, { customFieldIds: GUESTY_CUSTOM_FIELDS })
  assert.equal(d.address, 'Klariská 8, 811 03 Bratislava, Slovakia'); assert.equal(d.checkin_time, '16:00'); assert.equal(d.checkout_time, '11:00')
  assert.ok(!/2105/.test(d.arrival.sk) && !/2105/.test(d.arrival.en)); assert.ok(/Choďte/.test(d.arrival.sk)); assert.ok(/Go to/.test(d.arrival.en))
  assert.equal(d.checkout.sk, 'Pri odchode vráťte čip.'); assert.equal(d.parking.en, 'Street parking, pay via EasyPark.')
  assert.deepEqual(d.wifi, { ssid: 'LIVEIN-8', password: 'secret123' })
  assert.ok(d.sections.some((s) => s.key === 'apartment') && d.sections.some((s) => s.key === 'important'))
  assert.ok(!JSON.stringify(d.sections).includes('Paplón'))
})
