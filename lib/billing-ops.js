// Vyúčtovanie majiteľom – operácie s dátami (jedno miesto pre tabuľku aj pre chat Pomocníka): validácia, pravidlá, zápis. Dostáva klienta `s` (s RLS) a e-mail autora.
import { cleanPatch, autoStav, isKosice, FIRM_DB, FIRM_CODE, num } from './billing-core.js'

export const uuid = (x) => /^[0-9a-f-]{36}$/i.test(String(x || ''))

/** Obdobie musí byť otvorené, inak sa nič nemení. */
export async function openPeriod(s, periodId) {
  const { data, error } = await s.from('billing_periods').select('id,month,status').eq('id', periodId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Obdobie neexistuje.' }
  if (data.status === 'closed') return { error: 'Obdobie je uzavreté. Admin ho môže znova otvoriť.' }
  return { period: data }
}

export async function opSaveItem(s, who, id, raw) {
  if (!uuid(id)) return { ok: false, error: 'Neplatný riadok.' }
  const c = cleanPatch(raw); if (c.error) return { ok: false, error: c.error }
  const { data: cur, error: e0 } = await s.from('billing_items').select('*').eq('id', id).maybeSingle()
  if (e0) return { ok: false, error: e0.message }
  if (!cur) return { ok: false, error: 'Riadok už neexistuje (niekto ho zmazal). Obnov stránku.' }
  const op = await openPeriod(s, cur.period_id); if (op.error) return { ok: false, error: op.error }
  if ('byt' in c.patch && isKosice(c.patch.byt)) return { ok: false, error: 'Košické byty sa tu nevyúčtúvajú.' }
  const patch = autoStav(cur, c.patch)
  const { data, error } = await s.from('billing_items').update({ ...patch, updated_by: who }).eq('id', id).select('*').maybeSingle()
  if (error) { console.error('vyuctovanie save', error.message); return { ok: false, error: 'Neuložilo sa: ' + error.message } }
  return { ok: true, item: data, before: cur }
}

/** Nový riadok: k bytu (kat, firma, časť) alebo bez bytu (nepriradené). */
export async function opAddItem(s, who, p) {
  if (!uuid(p && p.period_id)) return { ok: false, error: 'Neplatné obdobie.' }
  const op = await openPeriod(s, p.period_id); if (op.error) return { ok: false, error: op.error }
  const c = cleanPatch({ byt: p.byt || '', kat: p.kat || 'Poznámka z Účtovníctva', cast: p.cast || '', firma: p.firma || null, polozka: p.polozka || '', ks: p.ks === undefined ? 1 : p.ks, cena: p.cena ?? null, suma: p.suma ?? null, pozn: p.pozn || '', stav: p.stav || 'Doplniť sumu', typ: p.typ || null, zistit: p.zistit || '' })
  if (c.error) return { ok: false, error: c.error }
  if (isKosice(c.patch.byt)) return { ok: false, error: 'Košické byty sa tu nevyúčtúvajú.' }
  const { data: last } = await s.from('billing_items').select('ord').eq('period_id', p.period_id).order('ord', { ascending: false }).limit(1)
  const ord = Math.floor(((last && last[0] && Number(last[0].ord)) || 0) + 1)
  const base = { period_id: p.period_id, ord, ...c.patch, created_by: who, updated_by: who }
  const patch = autoStav({ stav: base.stav, ks: base.ks, cena: base.cena }, { ks: base.ks, cena: base.cena })
  const { data, error } = await s.from('billing_items').insert({ ...base, ...patch }).select('*').single()
  if (error) { console.error('vyuctovanie add', error.message); return { ok: false, error: 'Nepodarilo sa pridať: ' + error.message } }
  return { ok: true, item: data }
}

export async function opDeleteItem(s, who, id) {
  if (!uuid(id)) return { ok: false, error: 'Neplatný riadok.' }
  const { data: cur } = await s.from('billing_items').select('*').eq('id', id).maybeSingle()
  if (!cur) return { ok: true, gone: true }   // už je preč
  const op = await openPeriod(s, cur.period_id); if (op.error) return { ok: false, error: op.error }
  const { error } = await s.from('billing_items').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, before: cur }
}

/** Firma pre celý byt: všetky jeho riadky v období. Prázdna = dopočíta sa z Guesty. */
export async function opSetAptFirm(s, who, { period_id, byt, firma }) {
  if (!uuid(period_id) || !String(byt || '').trim()) return { ok: false, error: 'Chýba byt.' }
  if (firma && !FIRM_DB[FIRM_CODE[firma]]) return { ok: false, error: 'Neplatná firma.' }
  const op = await openPeriod(s, period_id); if (op.error) return { ok: false, error: op.error }
  const val = firma ? FIRM_DB[FIRM_CODE[firma]] : null
  const { data, error } = await s.from('billing_items').update({ firma: val, updated_by: who }).eq('period_id', period_id).eq('byt', byt).select('id')
  if (error) return { ok: false, error: error.message }
  return { ok: true, count: (data || []).length, firma: val }
}

/* ---------- cenník bežných položiek ---------- */
export function cleanPrice(raw, { partial = false } = {}) {
  const p = {}
  if (!partial || 'polozka' in raw) { const t = String(raw.polozka || '').trim().slice(0, 200); if (!t) return { error: 'Položka cenníka potrebuje názov.' }; p.polozka = t }
  if (!partial || 'obchod' in raw) p.obchod = String(raw.obchod || '').trim().slice(0, 80) || null
  if (!partial || 'poznamka' in raw) p.poznamka = String(raw.poznamka || '').trim().slice(0, 500) || null
  if (!partial || 'cena' in raw) { const n = raw.cena === '' || raw.cena == null ? null : num(raw.cena); if (raw.cena !== '' && raw.cena != null && (n == null || n < 0 || n > 1e6)) return { error: 'Cena nie je platné číslo.' }; p.cena = n }
  if ('active' in raw) p.active = !!raw.active
  return { patch: p }
}
export async function opAddPrice(s, who, raw) {
  const c = cleanPrice(raw); if (c.error) return { ok: false, error: c.error }
  const { data, error } = await s.from('price_list').insert({ ...c.patch, active: true }).select('*').single()
  return error ? { ok: false, error: error.message } : { ok: true, item: data }
}
export async function opUpdatePrice(s, who, id, raw) {
  if (!uuid(id)) return { ok: false, error: 'Neplatná položka cenníka.' }
  const c = cleanPrice(raw, { partial: true }); if (c.error) return { ok: false, error: c.error }
  const { data, error } = await s.from('price_list').update(c.patch).eq('id', id).select('*').maybeSingle()
  if (error) return { ok: false, error: error.message }
  return data ? { ok: true, item: data } : { ok: false, error: 'Položka cenníka neexistuje.' }
}
