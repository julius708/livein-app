// Čisté pomôcky pre Guesty Reservations V3 (bez siete) – zdieľaný tvar medzi vyhľadávaním, načítaním podľa ID a hosťom.
// Staré /v1/reservations končia 1. 3. 2027; V3 vracia hosťa iba ako guestId, preto sa kontakt skladá z GET /v1/guests/{id}.
export const GUEST_FIELDS = 'fullName firstName lastName email emails phone phones'
export const V3 = '/v1/reservations-v3'

/** ID z reťazca alebo objektu ({ $oid } / { _id } / { id }). */
export const idOf = (v) => (v && typeof v === 'object' ? String(v.$oid || v._id || v.id || '') : String(v || ''))
/** Deň po dátume YYYY-MM-DD (V3 filtre majú len gte/lt pre príchod a gte/lte pre odchod). */
export function dayAfter(ymd) { const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`); if (Number.isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
/** Filtre „aktívne dnes“: príchod ≤ dnes a odchod > dnes, len potvrdené. */
export function activeFilters(listingId, today) {
  const next = dayAfter(today)
  return { 'filter[listingId]': String(listingId), 'filter[checkIn][lt]': next, 'filter[checkOut][gte]': next, 'filter[status]': 'confirmed', limit: 20 }
}
/** ID jednotky z výsledku V3 (vyhľadávanie alebo podľa ID): listingId, stay[0].listingId alebo stay[0].unitTypeId. */
export function listingIdOf(r) {
  if (!r) return ''
  const s = Array.isArray(r.stay) ? r.stay[0] : null
  return idOf(r.listingId || (s && (s.listingId || s.unitTypeId)) || r.unitTypeId || '')
}
/** Kontakt hosťa z GET /v1/guests/{id}: meno, hlavný e-mail a všetky e-maily (malé písmená, bez duplikátov). */
export function guestContact(g) {
  const o = g || {}
  const emails = [...new Set([o.email, ...(Array.isArray(o.emails) ? o.emails : [])].map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))]
  const name = String(o.fullName || [o.firstName, o.lastName].filter(Boolean).join(' ') || '').trim()
  return { name, firstName: String(o.firstName || '').trim(), email: emails[0] || null, emails }
}
/** Rezervácia v tvare, ktorý používa overenie hosťa (Sprievodca): ID, jednotka, stav, dátumy, kód, kontakt. */
export function shapeReservation(r, guest, fallbackListingId) {
  const c = guestContact(guest)
  return {
    id: idOf(r.reservationId || r._id), listingId: listingIdOf(r) || String(fallbackListingId || ''), status: String(r.status || ''),
    checkIn: r.checkInDateLocalized || String(r.checkIn || '').slice(0, 10), checkOut: r.checkOutDateLocalized || String(r.checkOut || '').slice(0, 10),
    confirmationCode: r.confirmationCode || '', guestName: c.name, guestEmail: c.email, guestEmails: c.emails,
  }
}
