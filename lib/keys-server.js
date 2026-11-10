import 'server-only'
import { adminClientAsync } from './supabase-admin'
import { normalizeRows, personOptions, dayList, sortUnits } from './keys-core'

export const UNIT_COLS = 'listing_id,listing_name,hook_no,sets,out_sets,holders,active,note,manual,address,detail,updated_at'

/** Dnešný dátum v Bratislave (YYYY-MM-DD) a posun o n dní. */
export function ymdBa(offset = 0, now = new Date()) {
  const d = new Date(now.getTime() + offset * 86400e3)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export async function keysSettings(s) {
  const { data } = await s.from('key_settings').select('key,value')
  const m = {}; for (const r of data || []) m[r.key] = r.value
  return { rows: normalizeRows(m.rows), overdueHours: Number(m.overdue_hours) || 24, persons: normalizePersons(m.persons) }
}

/** Mená v ponuke „Kto“: pevný zoznam z nastavení (Július, 9. 11. 2026); prázdny zoznam = odvodiť z účtov. */
export function normalizePersons(v) {
  const out = []; const seen = new Set()
  for (const x of Array.isArray(v) ? v : []) { const n = String(typeof x === 'string' ? x : (x && x.name) || '').trim().slice(0, 40); if (!n || seen.has(n.toLowerCase())) continue; seen.add(n.toLowerCase()); out.push({ name: n, email: null }) }
  return out
}

export async function keysUnits(s) {
  const { data, error } = await s.from('key_units').select(UNIT_COLS).order('hook_no', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return sortUnits(data || [])
}

/** Osoby do ponuky „kto berie“: účty appky + profily Práčovne (servisný klient, len mená). */
export async function keysPersons(fixed = []) {
  if (fixed && fixed.length) return fixed
  try {
    const a = await adminClientAsync()
    const [{ data: users }, { data: profiles }] = await Promise.all([
      a.from('app_users').select('name,email,roles').eq('active', true),
      a.from('profiles').select('display_name').eq('active', true),
    ])
    return personOptions(users || [], profiles || [])
  } catch { return [] }
}

/** Balíky Práčovne (tašky) na dané dni → zoznam kľúčov podľa tašiek. */
export async function keysDays(units, days = [ymdBa(0), ymdBa(1)]) {
  try {
    const a = await adminClientAsync()
    const { data } = await a.from('packages').select('id,listing_id,listing_name,date,status,hidden,same_day,packed_by_name').in('date', days).eq('hidden', false).neq('status', 'cancelled')
    return days.map((d) => ({ date: d, items: dayList((data || []).filter((p) => p.date === d), units) }))
  } catch { return days.map((d) => ({ date: d, items: [] })) }
}

/** Aktívne byty z registra, ktoré ešte nie sú v evidencii kľúčov → doplnia sa (bez pozície, 1 sada). Vráti počet nových. */
export async function syncKeyUnits(s, who) {
  const a = await adminClientAsync()
  const [{ data: listings }, { data: have }] = await Promise.all([
    a.from('listings').select('guesty_id,name,title,city,active').eq('active', true).limit(2000),
    s.from('key_units').select('listing_id,listing_name,active,manual'),
  ])
  const byId = new Map((have || []).map((u) => [u.listing_id, u]))
  const ins = [], upd = []
  // Na stene v Bratislave visia len bratislavské byty (Július, 9. 11. 2026): Košice, Trnava a ostatné mestá sa do evidencie nepridávajú.
  const isBa = (l) => /bratislav/i.test(String(l.city || '')) && !/^(KE|TT):/.test(String(l.name || ''))
  for (const l of listings || []) {
    const name = String(l.name || l.title || '').trim(); if (!name) continue
    const u = byId.get(l.guesty_id)
    if (!u) { if (isBa(l)) ins.push({ listing_id: l.guesty_id, listing_name: name, sets: 1, updated_by: who }) }
    else if (u.listing_name !== name) upd.push({ listing_id: l.guesty_id, listing_name: name })
  }
  if (ins.length) { const { error } = await s.from('key_units').insert(ins); if (error) throw new Error(error.message) }
  for (const u of upd) await s.from('key_units').update({ listing_name: u.listing_name, updated_at: new Date().toISOString() }).eq('listing_id', u.listing_id)
  // byty, ktoré v registri už nie sú aktívne → neaktívne (ostávajú v histórii)
  const activeIds = new Set((listings || []).map((l) => l.guesty_id))
  const gone = (have || []).filter((u) => u.active && !u.manual && !activeIds.has(u.listing_id)).map((u) => u.listing_id)
  if (gone.length) await s.from('key_units').update({ active: false, updated_at: new Date().toISOString() }).in('listing_id', gone)
  return { added: ins.length, renamed: upd.length, deactivated: gone.length }
}
