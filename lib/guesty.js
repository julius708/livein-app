// Guesty Open API pre hlavnú appku: token zdieľaný s ostatnými appkami (guesty_state obnovuje Ring), inak vlastné prihlásenie cez GUESTY_CLIENT_ID/SECRET.
// Používa sa len na serveri. Nikdy neposiela do klienta nič okrem výsledku overenia.
import { adminClientAsync } from './supabase-admin'
const BASE = 'https://open-api.guesty.com'

export const guestyConfigured = () => !!(process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET) || true
async function token() {
  const s = await adminClientAsync()
  const soon = new Date(Date.now() + 10 * 60e3).toISOString()
  const { data: st } = await s.from('guesty_state').select('access_token,expires_at').eq('id', 'main').maybeSingle()
  if (st && st.access_token && st.expires_at > soon) return st.access_token
  const { data: t } = await s.from('guesty_tokens').select('access_token,expires_at').gt('expires_at', soon).order('expires_at', { ascending: false }).limit(1).maybeSingle()
  if (t && t.access_token) return t.access_token
  if (process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET) {
    const r = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'open-api', client_id: process.env.GUESTY_CLIENT_ID, client_secret: process.env.GUESTY_CLIENT_SECRET }), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.access_token) { await s.from('guesty_state').upsert({ id: 'main', access_token: j.access_token, expires_at: new Date(Date.now() + (j.expires_in || 86400) * 1000).toISOString(), updated_at: new Date().toISOString() }); return j.access_token }
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
/** Rezervácia podľa potvrdzovacieho kódu: iba polia potrebné na overenie. */
export async function reservationByCode(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9-]{4,24}$/.test(c)) return null
  const j = await gget('/v1/reservations', { fields: 'status listingId checkInDateLocalized checkOutDateLocalized confirmationCode guest.email guest.emails', filters: [{ field: 'confirmationCode', operator: '$eq', value: c }], limit: 2 })
  const r = (j.results || []).find((x) => String(x.confirmationCode || '').toUpperCase() === c)
  if (!r) return null
  return { id: r._id, listingId: r.listingId, status: r.status, checkIn: r.checkInDateLocalized, checkOut: r.checkOutDateLocalized, guestEmail: r.guest && r.guest.email, guestEmails: (r.guest && r.guest.emails) || [] }
}
