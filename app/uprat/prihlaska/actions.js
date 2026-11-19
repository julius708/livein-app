'use server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/env'
import { MSG } from '@/lib/cl-server'

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
