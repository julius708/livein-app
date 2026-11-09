'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { canKeys, applyTake, applyReturn, normalizeRows } from '@/lib/keys-core'
import { UNIT_COLS, syncKeyUnits } from '@/lib/keys-server'

async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Najprv sa prihlás.' }
  if (!canKeys(v.me)) return { error: 'Kľúče sú pre prevádzku, upratovanie a zákaznícky servis.' }
  return v
}
const who = (v) => v.user.email.toLowerCase()
const isListing = (x) => /^[0-9a-f]{24}$/i.test(String(x || ''))
const person = (p) => { const name = String((p && p.name) || '').trim().slice(0, 80); return name ? { name, email: p.email ? String(p.email).toLowerCase().slice(0, 120) : null } : null }
const src = (p) => (p && p.kiosk ? 'kiosk' : 'app')
const ymd = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null)
const refresh = () => { revalidatePath('/kluce'); revalidatePath('/kluce/kiosk'); revalidatePath('/kluce/historia'); revalidatePath('/kluce/sprava') }

/** Jeden pohyb (zobrať / vrátiť) nad jedným bytom s optimistickým zámkom na out_sets. */
async function move(v, { listing_id, action, sets = 1, p, package_id = null, package_date = null, note = null, source }) {
  const { data: u, error } = await v.s.from('key_units').select(UNIT_COLS).eq('listing_id', listing_id).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!u) return { ok: false, error: 'Byt nie je v evidencii kľúčov. Admin ho pridá v Správe (Načítať byty).' }
  const at = new Date().toISOString()
  const r = action === 'take' ? applyTake(u, p, sets, at) : applyReturn(u, p, sets)
  if (r.error) return { ok: false, error: `${u.listing_name}: ${r.error}` }
  const { data: m, error: e1 } = await v.s.from('key_moves').insert({ listing_id, listing_name: u.listing_name, hook_no: u.hook_no, action, sets: action === 'take' ? sets : r.returned, person_name: p.name, person_email: p.email, package_id, package_date, source, note: note || (r.mismatch ? 'vrátené bez záznamu o zobratí touto osobou' : null), created_by: who(v) }).select('id').single()
  if (e1) return { ok: false, error: e1.message }
  if (action === 'take') r.holders[r.holders.length - 1].move_id = m.id
  const { data: upd, error: e2 } = await v.s.from('key_units').update({ out_sets: r.out_sets, holders: r.holders, updated_by: who(v), updated_at: at }).eq('listing_id', listing_id).eq('out_sets', u.out_sets).select('listing_id')
  if (e2) return { ok: false, error: e2.message }
  if (!upd || !upd.length) { await v.s.from('key_moves').delete().eq('id', m.id); return { ok: false, error: `${u.listing_name}: niekto práve zmenil stav kľúčov, skús znova.` } }
  return { ok: true, listing_name: u.listing_name, hook_no: u.hook_no, out_sets: r.out_sets, mismatch: !!r.mismatch }
}

/** Zobrať kľúče: osoba + zoznam bytov [{listing_id, sets?, package_id?, package_date?}]. Spracuje všetky, vráti výsledky. */
export async function takeKeysAction(payload) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const p = person(payload && payload.person); if (!p) return { ok: false, error: 'Vyber, kto kľúče berie.' }
  const items = (Array.isArray(payload.items) ? payload.items : []).filter((i) => isListing(i.listing_id)).slice(0, 60)
  if (!items.length) return { ok: false, error: 'Vyber aspoň jeden byt.' }
  const results = []
  for (const i of items) results.push(await move(v, { listing_id: i.listing_id, action: 'take', sets: Math.min(20, Math.max(1, Number(i.sets) || 1)), p, package_id: /^[0-9a-f-]{36}$/i.test(String(i.package_id || '')) ? i.package_id : null, package_date: ymd(i.package_date), source: src(payload) }))
  refresh()
  const failed = results.filter((r) => !r.ok)
  return { ok: failed.length < results.length, done: results.filter((r) => r.ok).length, failed: failed.map((r) => r.error) }
}

/** Vrátiť kľúče: osoba + byty [{listing_id, sets?}]. */
export async function returnKeysAction(payload) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const p = person(payload && payload.person); if (!p) return { ok: false, error: 'Vyber, kto kľúče vracia.' }
  const items = (Array.isArray(payload.items) ? payload.items : []).filter((i) => isListing(i.listing_id)).slice(0, 60)
  if (!items.length) return { ok: false, error: 'Vyber aspoň jeden byt.' }
  const results = []
  for (const i of items) results.push(await move(v, { listing_id: i.listing_id, action: 'return', sets: Math.min(20, Math.max(1, Number(i.sets) || 1)), p, source: src(payload) }))
  refresh()
  const failed = results.filter((r) => !r.ok)
  return { ok: failed.length < results.length, done: results.filter((r) => r.ok).length, failed: failed.map((r) => r.error), mismatch: results.some((r) => r.ok && r.mismatch) }
}

/** Správa: pozícia a počet sád bytu (admin a prevádzka). */
export async function saveUnitAction(payload) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const id = payload && payload.listing_id; if (!isListing(id)) return { ok: false, error: 'Neplatný byt.' }
  const patch = { updated_by: who(v), updated_at: new Date().toISOString() }
  if ('hook_no' in payload) { const h = payload.hook_no === null || payload.hook_no === '' ? null : Number(payload.hook_no); if (h !== null && (!Number.isInteger(h) || h < 1 || h > 999)) return { ok: false, error: 'Pozícia musí byť číslo 1 až 999.' }; patch.hook_no = h }
  if ('sets' in payload) { const n = Number(payload.sets); if (!Number.isInteger(n) || n < 0 || n > 20) return { ok: false, error: 'Počet sád 0 až 20.' }; patch.sets = n }
  if ('active' in payload) patch.active = !!payload.active
  if ('note' in payload) patch.note = String(payload.note || '').slice(0, 300) || null
  if (patch.hook_no != null) {
    const { data: clash } = await v.s.from('key_units').select('listing_id,listing_name').eq('hook_no', patch.hook_no).neq('listing_id', id).maybeSingle()
    if (clash) return { ok: false, error: `Pozícia ${patch.hook_no} už patrí bytu ${clash.listing_name}. Najprv ju uvoľni.` }
  }
  const { error } = await v.s.from('key_units').update(patch).eq('listing_id', id)
  if (error) return { ok: false, error: error.message }
  refresh(); return { ok: true }
}

/** Správa: ručná náprava stavu (napr. kľúče sa našli) – vynuluje vonku a držiteľov, zapíše do histórie. Len admin. */
export async function resetUnitAction(payload) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Nápravu stavu robí admin.' }
  const id = payload && payload.listing_id; if (!isListing(id)) return { ok: false, error: 'Neplatný byt.' }
  const { data: u } = await v.s.from('key_units').select(UNIT_COLS).eq('listing_id', id).maybeSingle(); if (!u) return { ok: false, error: 'Byt nenájdený.' }
  await v.s.from('key_moves').insert({ listing_id: id, listing_name: u.listing_name, hook_no: u.hook_no, action: 'adjust', sets: u.out_sets, person_name: (v.me && v.me.name) || who(v), person_email: who(v), source: 'app', note: String((payload && payload.note) || 'náprava stavu adminom').slice(0, 300), created_by: who(v) })
  const { error } = await v.s.from('key_units').update({ out_sets: 0, holders: [], updated_by: who(v), updated_at: new Date().toISOString() }).eq('listing_id', id)
  if (error) return { ok: false, error: error.message }
  refresh(); return { ok: true }
}

/** Správa: rady (lišty) na stene – rozsahy pozícií. Len admin. */
export async function saveRowsAction(payload) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Rady na stene nastavuje admin.' }
  const rows = normalizeRows(payload && payload.rows)
  const hours = Math.min(168, Math.max(1, Number(payload && payload.overdueHours) || 24))
  const at = new Date().toISOString()
  const { error } = await v.s.from('key_settings').upsert([{ key: 'rows', value: rows, updated_by: who(v), updated_at: at }, { key: 'overdue_hours', value: hours, updated_by: who(v), updated_at: at }])
  if (error) return { ok: false, error: error.message }
  refresh(); return { ok: true, rows }
}

/** Správa: načítať byty z registra (nové dostanú 1 sadu, bez pozície). */
export async function syncUnitsAction() {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try { const r = await syncKeyUnits(v.s, who(v)); refresh(); return { ok: true, ...r } } catch (e) { return { ok: false, error: e.message } }
}
