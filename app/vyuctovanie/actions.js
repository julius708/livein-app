'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { canBilling, cleanPatch, autoStav, carryOver, priceRows, nextMonth, monthLabel, linenRows, linenNote, LINEN_PRESETS, CENNIK_KAT, validStav, isKosice, FIRM_DB, FIRM_CODE } from '@/lib/billing-core'

async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) { console.error('vyuctovanie action: no session'); return { error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' } }
  if (!canBilling(v.me)) { console.error('vyuctovanie action: no role'); return { error: 'Vyúčtovanie majiteľom je pre admina, asistentku vedenia a operácie.' } }
  return v
}
const who = (v) => v.user.email.toLowerCase()
const uuid = (x) => /^[0-9a-f-]{36}$/i.test(String(x || ''))
const refresh = () => revalidatePath('/vyuctovanie')

/** Obdobie musí byť otvorené, inak sa nič nemení. */
async function openPeriod(v, periodId) {
  const { data, error } = await v.s.from('billing_periods').select('id,month,status').eq('id', periodId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Obdobie neexistuje.' }
  if (data.status === 'closed') return { error: 'Obdobie je uzavreté. Admin ho môže znova otvoriť.' }
  return { period: data }
}

/** Uloží zmenu jedného riadku (so všetkými pravidlami: validácia, automatický stav). */
export async function saveItemAction(id, raw) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(id)) return { ok: false, error: 'Neplatný riadok.' }
  const c = cleanPatch(raw); if (c.error) return { ok: false, error: c.error }
  const { data: cur, error: e0 } = await v.s.from('billing_items').select('*').eq('id', id).maybeSingle()
  if (e0) return { ok: false, error: e0.message }
  if (!cur) return { ok: false, error: 'Riadok už neexistuje (niekto ho zmazal). Obnov stránku.' }
  const op = await openPeriod(v, cur.period_id); if (op.error) return { ok: false, error: op.error }
  if ('byt' in c.patch && isKosice(c.patch.byt)) return { ok: false, error: 'Košické byty sa tu nevyúčtúvajú.' }
  const patch = autoStav(cur, c.patch)
  const { data, error } = await v.s.from('billing_items').update({ ...patch, updated_by: who(v) }).eq('id', id).select('*').maybeSingle()
  if (error) { console.error('vyuctovanie save', error.message); return { ok: false, error: 'Neuložilo sa: ' + error.message } }
  refresh()
  return { ok: true, item: data }
}

/** Nový riadok: k bytu (kat, firma, časť) alebo bez bytu (nepriradené). */
export async function addItemAction(p) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(p && p.period_id)) return { ok: false, error: 'Neplatné obdobie.' }
  const op = await openPeriod(v, p.period_id); if (op.error) return { ok: false, error: op.error }
  const c = cleanPatch({ byt: p.byt || '', kat: p.kat || 'Poznámka z Účtovníctva', cast: p.cast || '', firma: p.firma || null, polozka: p.polozka || '', ks: p.ks === undefined ? 1 : p.ks, cena: p.cena ?? null, pozn: p.pozn || '', stav: p.stav || 'Doplniť sumu', typ: p.typ || null })
  if (c.error) return { ok: false, error: c.error }
  if (isKosice(c.patch.byt)) return { ok: false, error: 'Košické byty sa tu nevyúčtúvajú.' }
  const { data: last } = await v.s.from('billing_items').select('ord').eq('period_id', p.period_id).order('ord', { ascending: false }).limit(1)
  const ord = Math.floor(((last && last[0] && Number(last[0].ord)) || 0) + 1)
  const base = { period_id: p.period_id, ord, ...c.patch, created_by: who(v), updated_by: who(v) }
  const patch = autoStav({ stav: base.stav, ks: base.ks, cena: base.cena }, { ks: base.ks, cena: base.cena })
  const { data, error } = await v.s.from('billing_items').insert({ ...base, ...patch }).select('*').single()
  if (error) { console.error('vyuctovanie add', error.message); return { ok: false, error: 'Nepodarilo sa pridať: ' + error.message } }
  refresh()
  return { ok: true, item: data }
}

export async function deleteItemAction(id) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(id)) return { ok: false, error: 'Neplatný riadok.' }
  const { data: cur } = await v.s.from('billing_items').select('period_id').eq('id', id).maybeSingle()
  if (!cur) return { ok: true } // už je preč
  const op = await openPeriod(v, cur.period_id); if (op.error) return { ok: false, error: op.error }
  const { error } = await v.s.from('billing_items').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** Firma pre celý byt: všetky jeho riadky v období. Prázdna = dopočíta sa z Guesty. */
export async function setAptFirmAction({ period_id, byt, firma }) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(period_id) || !String(byt || '').trim()) return { ok: false, error: 'Chýba byt.' }
  if (firma && !FIRM_DB[FIRM_CODE[firma]]) return { ok: false, error: 'Neplatná firma.' }
  const op = await openPeriod(v, period_id); if (op.error) return { ok: false, error: op.error }
  const { data, error } = await v.s.from('billing_items').update({ firma: firma ? FIRM_DB[FIRM_CODE[firma]] : null, updated_by: who(v) }).eq('period_id', period_id).eq('byt', byt).select('id')
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, count: (data || []).length, firma: firma ? FIRM_DB[FIRM_CODE[firma]] : null }
}

/** Nový mesiac: ďalšie obdobie po poslednom, presun riadkov „Pravdepodobne [nový mesiac]“ a riadky cenníka. */
export async function newPeriodAction() {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const { data: last } = await v.s.from('billing_periods').select('id,month').order('month', { ascending: false }).limit(1)
  const prev = last && last[0]
  const month = prev ? nextMonth(prev.month) : `${new Date().toISOString().slice(0, 7)}-01`
  const { data: per, error } = await v.s.from('billing_periods').insert({ month, created_by: who(v) }).select('id,month').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? `Obdobie ${monthLabel(month)} už existuje.` : error.message }
  let moved = 0
  if (prev) {
    const { data: probable } = await v.s.from('billing_items').select('*').eq('period_id', prev.id).like('stav', 'Pravdepodobne %')
    for (const m of carryOver(probable || [], month)) {
      const { error: e1 } = await v.s.from('billing_items').update({ period_id: per.id, stav: m.stav, updated_by: who(v) }).eq('id', m.id)
      if (!e1) moved++
    }
  }
  const { data: pl } = await v.s.from('price_list').select('polozka,obchod,cena,poznamka,active')
  const rows = priceRows(pl || []).map((r) => ({ ...r, period_id: per.id, created_by: who(v), updated_by: who(v) }))
  if (rows.length) await v.s.from('billing_items').insert(rows)
  refresh()
  return { ok: true, id: per.id, month: per.month, moved, priceRows: rows.length }
}

/** Uzavrieť / znova otvoriť obdobie (len admin). */
export async function setPeriodStatusAction({ period_id, status }) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Obdobie uzatvára a otvára len admin.' }
  if (!uuid(period_id) || !['open', 'closed'].includes(status)) return { ok: false, error: 'Neplatná požiadavka.' }
  const { error } = await v.s.from('billing_periods').update({ status, closed_at: status === 'closed' ? new Date().toISOString() : null }).eq('id', period_id)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** Riadky z kalkulačky prádla: server ich prepočíta z kapacity, lôžok a toho, čo mal majiteľ (klient neposiela sumy). */
export async function addLinenAction({ period_id, byt, cast, firma, preset, beds, bathrooms, owned, apartments }) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const name = String(byt || '').trim().slice(0, 160)
  if (!uuid(period_id) || !name) return { ok: false, error: 'Vyber byt, ku ktorému sa prádlo pridá.' }
  if (isKosice(name)) return { ok: false, error: 'Košické byty sa tu nevyúčtúvajú.' }
  const op = await openPeriod(v, period_id); if (op.error) return { ok: false, error: op.error }
  const b = preset && LINEN_PRESETS[preset] ? LINEN_PRESETS[preset].beds : beds
  const opts = { beds: b, bathrooms, owned: owned || {}, apartments }
  const calc = linenRows(opts)
  if (!calc.rows.length) return { ok: false, error: 'Nie je čo účtovať: skontroluj lôžka a to, čo mal majiteľ.' }
  const note = linenNote(opts)
  const { data: last } = await v.s.from('billing_items').select('ord').eq('period_id', period_id).order('ord', { ascending: false }).limit(1)
  let ord = Math.floor((last && last[0] && Number(last[0].ord)) || 0)
  const c = cleanPatch({ cast: cast || '', firma: firma || null })
  if (c.error) return { ok: false, error: c.error }
  const rows = calc.rows.map((r) => ({ period_id, ord: ++ord, byt: name, cast: c.patch.cast || null, kat: 'Nový byt – zariadenie', polozka: r.polozka, ks: r.ks, cena: r.cena, stav: 'Suma OK', pozn: note, firma: c.patch.firma || null, typ: 'novy', created_by: who(v), updated_by: who(v) }))
  const { data, error } = await v.s.from('billing_items').insert(rows).select('*')
  if (error) return { ok: false, error: 'Nepodarilo sa pridať: ' + error.message }
  refresh()
  return { ok: true, items: data, totalC: calc.totalC }
}
