'use server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/env'
import { MSG } from '@/lib/cl-server'
import { geocode } from '@/lib/cl-geo'

/** Verejná prihláška upratovačky (bez prihlásenia). Databáza overí údaje, skrytú pascu pre roboty a obmedzí počet pokusov. */
export async function applyAction(form) {
  const f = form || {}
  const c = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.rpc('cl_apply', {
    p_name: String(f.name || '').slice(0, 120), p_email: String(f.email || '').slice(0, 160), p_phone: String(f.phone || '').slice(0, 40),
    p_address: String(f.address || '').slice(0, 220), p_city: String(f.city || '').slice(0, 100), p_note: String(f.note || '').slice(0, 600), p_hp: String(f.website || '').slice(0, 200),
  })
  if (error) {
    console.error('upratovanie apply', error.code, error.message)
    return { ok: false, error: 'Prihlášku sa nepodarilo odoslať. Skús to neskôr.' }
  }
  if (data && data.ok) return { ok: true }
  return { ok: false, error: MSG[data && data.status] || 'Prihlášku sa nepodarilo odoslať.' }
}

const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })

/** Meno k pozvánke (na pozdrav); null, keď odkaz nie je platný. */
export async function inviteInfo(token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) return null
  const { data, error } = await anon().rpc('cl_invite_info', { p_token: token })
  return !error && data && data.ok ? { name: data.name } : null
}

/** Upratovačka vyplní z pozvánky osobné údaje. Adresu skúsime nájsť na mape (ak sa nenájde, uloží sa bez súradníc a manažérka ju doplní). */
export async function completeProfileAction(form) {
  const f = form || {}
  if (!/^[0-9a-f-]{36}$/i.test(String(f.token || ''))) return { ok: false, error: MSG.invalid_token }
  let lat = null, lng = null
  if (!String(f.website || '').trim()) {
    const g = await geocode(f.address, f.city)
    if (g.ok) { lat = g.lat; lng = g.lng }
  }
  const { data, error } = await anon().rpc('cl_complete_profile', {
    p_token: f.token, p_phone: String(f.phone || '').slice(0, 40), p_address: String(f.address || '').slice(0, 220), p_city: String(f.city || '').slice(0, 100),
    p_note: String(f.note || '').slice(0, 600), p_lat: lat, p_lng: lng, p_hp: String(f.website || '').slice(0, 200),
  })
  if (error) { console.error('upratovanie profile', error.code, error.message); return { ok: false, error: 'Údaje sa nepodarilo uložiť. Skús to neskôr.' } }
  if (data && data.ok) return { ok: true, mapped: lat != null }
  return { ok: false, error: MSG[data && data.status] || 'Údaje sa nepodarilo uložiť. Skontroluj telefón a adresu.' }
}
