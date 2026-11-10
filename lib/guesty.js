// Guesty Open API pre hlavnú appku (rezervácie cez Reservations V3, staré /v1/reservations končia 1. 3. 2027): token zdieľaný s ostatnými appkami (guesty_state obnovuje Ring), inak vlastné prihlásenie cez GUESTY_CLIENT_ID/SECRET.
// Používa sa len na serveri. Nikdy neposiela do klienta nič okrem výsledku overenia.
import { adminClientAsync } from './supabase-admin'
import { V3, GUEST_FIELDS, activeFilters, listingIdOf, shapeReservation } from './guesty-v3'
const BASE = 'https://open-api.guesty.com'

export const guestyConfigured = () => !!(process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET) || true
// Guesty povoľuje len pár nových tokenov denne: nový sa vyžiada iba keď nie je v DB ani v pamäti procesu.
let mem = { token: null, expires: 0 }
async function token() {
  if (mem.token && mem.expires > Date.now() + 10 * 60e3) return mem.token
  const s = await adminClientAsync()
  const soon = new Date(Date.now() + 10 * 60e3).toISOString()
  const { data: st } = await s.from('guesty_state').select('access_token,expires_at').eq('id', 'main').maybeSingle()
  if (st && st.access_token && st.expires_at > soon) { mem = { token: st.access_token, expires: Date.parse(st.expires_at) }; return st.access_token }
  const { data: t } = await s.from('guesty_tokens').select('access_token,expires_at').gt('expires_at', soon).order('expires_at', { ascending: false }).limit(1).maybeSingle()
  if (t && t.access_token) { mem = { token: t.access_token, expires: Date.parse(t.expires_at) }; return t.access_token }
  if (process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET) {
    const r = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'open-api', client_id: process.env.GUESTY_CLIENT_ID, client_secret: process.env.GUESTY_CLIENT_SECRET }), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.access_token) { mem = { token: j.access_token, expires: Date.now() + (j.expires_in || 86400) * 1000 }; await s.from('guesty_state').upsert({ id: 'main', access_token: j.access_token, expires_at: new Date(Date.now() + (j.expires_in || 86400) * 1000).toISOString(), updated_at: new Date().toISOString() }); return j.access_token }
  }
  throw new Error('guesty_token_unavailable')
}
export async function gget(path, params = {}) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  const r = await fetch(url, { headers: { authorization: `Bearer ${await token()}`, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`guesty_${r.status}`)
  return j
}
/** Hosť podľa ID (V3 vracia iba guestId). Pri chybe prázdny objekt – overenie potom zlyhá na identite, nie na výnimke. */
async function guestById(id) {
  if (!id) return {}
  try { return await gget(`/v1/guests/${encodeURIComponent(id)}`, { fields: GUEST_FIELDS }) } catch (e) { console.error('[guesty] guest', String(e && e.message).slice(0, 40)); return {} }
}
/** Rezervácie podľa ID (max 10 naraz) – plný dokument V3 so stay[].unitTypeId. */
async function byIds(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))].slice(0, 10)
  if (!list.length) return []
  const j = await gget(`${V3}?${list.map((i) => `reservationIds[]=${encodeURIComponent(i)}`).join('&')}`)
  return Array.isArray(j) ? j : j.results || j.data || []
}
/** Rezervácia podľa potvrdzovacieho kódu (V3 search + hosť): iba polia potrebné na overenie. */
export async function reservationByCode(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9-]{4,24}$/.test(c)) return null
  const j = await gget(`${V3}/search`, { 'filter[confirmationCode]': c, limit: 5 })
  const r = (j.results || []).find((x) => String(x.confirmationCode || '').toUpperCase() === c)
  if (!r) return null
  let listingId = listingIdOf(r)
  if (!listingId) { const [full] = await byIds([r.reservationId]).catch(() => []); listingId = listingIdOf(full) }
  const out = shapeReservation(r, await guestById(r.guestId), listingId)
  return { id: out.id, listingId: out.listingId, status: out.status, checkIn: out.checkIn, checkOut: out.checkOut, guestEmail: out.guestEmail, guestEmails: out.guestEmails }
}
/** Aktívne potvrdené rezervácie jednotky (dnes medzi príchodom a odchodom) s kontaktom hosťa. */
export async function activeReservations(listingId, today) {
  const j = await gget(`${V3}/search`, activeFilters(listingId, today))
  const rows = j.results || []
  const guests = new Map(await Promise.all([...new Set(rows.map((r) => r.guestId).filter(Boolean))].map(async (id) => [id, await guestById(id)])))
  return rows.map((r) => shapeReservation(r, guests.get(r.guestId), listingId))
}
