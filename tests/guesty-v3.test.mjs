import test from 'node:test'
import assert from 'node:assert/strict'
import { dayAfter, activeFilters, listingIdOf, guestContact, shapeReservation, idOf } from '../lib/guesty-v3.js'

test('dayAfter posúva deň aj cez koniec mesiaca a roka', () => {
  assert.equal(dayAfter('2026-11-10'), '2026-11-11')
  assert.equal(dayAfter('2026-12-31'), '2027-01-01')
  assert.equal(dayAfter('zle'), '')
})
test('activeFilters: príchod ≤ dnes, odchod > dnes, len potvrdené', () => {
  const f = activeFilters('abc', '2026-11-10')
  assert.equal(f['filter[listingId]'], 'abc')
  assert.equal(f['filter[checkIn][lt]'], '2026-11-11')
  assert.equal(f['filter[checkOut][gte]'], '2026-11-11')
  assert.equal(f['filter[status]'], 'confirmed')
})
test('listingIdOf berie listingId, stay.listingId alebo stay.unitTypeId', () => {
  assert.equal(listingIdOf({ listingId: 'L1' }), 'L1')
  assert.equal(listingIdOf({ stay: [{ listingId: 'L2' }] }), 'L2')
  assert.equal(listingIdOf({ stay: [{ unitTypeId: { $oid: 'L3' } }] }), 'L3')
  assert.equal(listingIdOf({}), '')
  assert.equal(idOf({ _id: 'x' }), 'x')
})
test('guestContact zjednotí e-maily a meno', () => {
  const c = guestContact({ firstName: 'Anna', lastName: 'Nováková', email: 'Anna@Example.com', emails: ['anna@example.com', 'druhy@example.com'] })
  assert.equal(c.name, 'Anna Nováková')
  assert.equal(c.email, 'anna@example.com')
  assert.deepEqual(c.emails, ['anna@example.com', 'druhy@example.com'])
  assert.deepEqual(guestContact(null), { name: '', firstName: '', email: null, emails: [] })
})
test('shapeReservation dáva tvar pre overenie hosťa', () => {
  const r = shapeReservation({ reservationId: 'R1', status: 'confirmed', checkInDateLocalized: '2026-11-10', checkOutDateLocalized: '2026-11-12', confirmationCode: 'ABC123' }, { fullName: 'Jan Kowalski', emails: ['jan@example.com'] }, 'L9')
  assert.deepEqual(r, { id: 'R1', listingId: 'L9', status: 'confirmed', checkIn: '2026-11-10', checkOut: '2026-11-12', confirmationCode: 'ABC123', guestName: 'Jan Kowalski', guestEmail: 'jan@example.com', guestEmails: ['jan@example.com'] })
  const byIds = shapeReservation({ _id: 'R2', status: 'confirmed', stay: [{ unitTypeId: 'L5', checkInDateLocalized: '2026-01-01', checkOutDateLocalized: '2026-01-03' }], checkIn: '2026-01-01T13:00:00.000Z', checkOut: '2026-01-03T09:00:00.000Z' }, null)
  assert.equal(byIds.listingId, 'L5'); assert.equal(byIds.checkIn, '2026-01-01'); assert.equal(byIds.checkOut, '2026-01-03')
})
