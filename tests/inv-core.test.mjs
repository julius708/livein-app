import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalUrl, listingIdentity, parseRooms, normalizeListing, validateListing, similarity, dedupeDecision, priceChange, freshness, isRecommendable, canInv, featuresFrom, propertySignature, MERGE_AUTO } from '../lib/inv-core.js'

test('odkaz: sledovacie parametre a www sa zahodia, identifikátor je posledné číslo', () => {
  assert.equal(canonicalUrl('https://www.Nehnutelnosti.sk/123456789/byt/?utm_source=fb&fbclid=1#x'), 'https://nehnutelnosti.sk/123456789/byt')
  assert.deepEqual(listingIdentity('https://www.reality.sk/byt/9876543/'), { source_key: 'reality.sk', external_id: '9876543', url: 'https://reality.sk/byt/9876543' })
  assert.equal(listingIdentity('nie je url'), null)
})
test('dispozícia z textu', () => { assert.equal(parseRooms('2-izbový byt'), 2); assert.equal(parseRooms('garsónka'), 1); assert.equal(parseRooms('3 izby'), 3); assert.equal(parseRooms('dom'), null) })
test('normalizácia: neznáme polia ostávajú null (nie nula), exteriér oddelene od interiéru', () => {
  const n = normalizeListing({ url: 'https://x.sk/inzerat/1234567', city: 'Bratislava', price: '195 000', area: '62,5', area_exterior: '8', disposition: '3 izby' })
  assert.equal(n.price, 195000); assert.equal(n.area_interior, 62.5); assert.equal(n.area_exterior, 8); assert.equal(n.bedrooms, 2)
  assert.equal(n.parking_mandatory, null); assert.equal(n.commission_in_price, null); assert.equal(n.floor, null)
  assert.equal(normalizeListing({ price: 0 }).price, null)
  assert.equal(n.features.balcony, true); assert.equal(n.features.elevator, null)
})
test('vlastnosti z vybavenia: nezmienené = neznáme, výslovné nie = false', () => {
  const f = featuresFrom(['Výťah', 'zariadený'], { parking: false })
  assert.equal(f.elevator, true); assert.equal(f.furnished, true); assert.equal(f.parking, false); assert.equal(f.aircon, null)
})
test('validácia: bez zdroja, mesta a ceny je chyba; odstránený inzerát cenu nepotrebuje', () => {
  assert.equal(validateListing(normalizeListing({})).length, 4)
  assert.equal(validateListing(normalizeListing({ source_key: 'a', external_id: '1', city: 'BA', listing_state: 'removed' })).length, 0)
})
const A = { city: 'Bratislava', address: 'Dunajská 12', area_interior: 62, rooms: 2, floor: 3, price: 195000 }
test('duplicita naprieč portálmi: rovnaký byt s mierne inou cenou a výmerou sa zlúči', () => {
  const d = dedupeDecision({ ...A, address: 'ul. Dunajská 12', area_interior: 62.4, price: 196000 }, [{ id: 'p1', ...A }])
  assert.equal(d.action, 'merge'); assert.equal(d.id, 'p1'); assert.ok(d.score >= MERGE_AUTO)
})
test('neistá zhoda (bez čísla domu a poschodia) sa len navrhne', () => {
  const d = dedupeDecision({ city: 'Bratislava', address: 'Dunajská', area_interior: 62, rooms: 2, price: 195000 }, [{ id: 'p1', ...A }])
  assert.equal(d.action, 'suggest')
})
test('iná dispozícia, iné mesto alebo výrazne iná výmera = nová nehnuteľnosť', () => {
  assert.equal(dedupeDecision({ ...A, rooms: 3 }, [{ id: 'p1', ...A }]).action, 'new')
  assert.equal(dedupeDecision({ ...A, city: 'Košice' }, [{ id: 'p1', ...A }]).action, 'new')
  assert.equal(dedupeDecision({ ...A, area_interior: 80 }, [{ id: 'p1', ...A }]).action, 'new')
})
test('GPS blízkosť zvýši zhodu', () => {
  const a = { city: 'Bratislava', area_interior: 50, rooms: 2, lat: 48.1486, lon: 17.1077 }
  assert.ok(similarity(a, { ...a, lat: 48.14862, lon: 17.10772 }).score >= 60)
})
test('zmena ceny: významná od 1 % alebo 1 000 €', () => {
  assert.equal(priceChange(200000, 200000).changed, false)
  assert.equal(priceChange(200000, 199000).significant, true)
  assert.equal(priceChange(1000000, 999500).significant, false)
  assert.ok(priceChange(200000, 190000).pct < 0)
})
test('aktuálnosť: kontrola zdroja a potvrdenie predajcom sú oddelené', () => {
  const now = Date.parse('2026-11-12T10:00:00Z')
  const f = freshness({ last_checked_at: '2026-11-11T10:00:00Z', last_confirmed_at: null }, now)
  assert.equal(f.source, 'fresh'); assert.equal(f.seller, 'never'); assert.equal(f.ok, true)
  assert.equal(freshness({ last_checked_at: '2026-10-01T00:00:00Z' }, now).source, 'old')
  assert.equal(freshness({}, now).source, 'never')
})
test('odporúčať sa dajú len aktuálne dostupné stavy; stiahnuté, predané a rezervované nie', () => {
  for (const s of ['new', 'review', 'active', 'confirmed', 'unknown']) assert.equal(isRecommendable(s), true)
  for (const s of ['reserved', 'sold', 'withdrawn']) assert.equal(isRecommendable(s), false)
})
test('prístup: len rola crm a aktívny používateľ', () => {
  assert.equal(canInv({ roles: ['crm'], active: true }), true)
  assert.equal(canInv({ roles: ['cleaning'], active: true }), false)
  assert.equal(canInv({ roles: ['crm'], active: false }), false)
  assert.equal(canInv(null), false)
})
test('odtlačok zhody sa mení so zmenou ceny alebo stavu', () => {
  const a = propertySignature({ price: 1, status: 'active' }, null), b = propertySignature({ price: 2, status: 'active' }, null), c = propertySignature({ price: 1, status: 'sold' }, null)
  assert.notEqual(a, b); assert.notEqual(a, c)
})
