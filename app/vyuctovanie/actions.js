'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { canBilling, cleanPatch, carryOver, priceRows, nextMonth, monthLabel, linenRows, linenNote, LINEN_PRESETS, isKosice } from '@/lib/billing-core'
import { chatTurn, applyActions, loadItems, loadPrices } from '@/lib/billing-chat'
import { opSaveItem, opAddItem, opDeleteItem, opSetAptFirm, openPeriod, uuid } from '@/lib/billing-ops'

async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) { console.error('vyuctovanie action: no session'); return { error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' } }
  if (!canBilling(v.me)) { console.error('vyuctovanie action: no role'); return { error: 'Vyúčtovanie majiteľom je pre admina, asistentku vedenia a operácie.' } }
  return v
}
const who = (v) => v.user.email.toLowerCase()
const refresh = () => revalidatePath('/vyuctovanie')

export async function saveItemAction(id, raw) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const r = await opSaveItem(v.s, who(v), id, raw)
  if (r.ok) refresh()
  return r.ok ? { ok: true, item: r.item } : r
}
export async function addItemAction(p) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const r = await opAddItem(v.s, who(v), p)
  if (r.ok) refresh()
  return r
}
export async function deleteItemAction(id) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const r = await opDeleteItem(v.s, who(v), id)
  if (r.ok) refresh()
  return r.ok ? { ok: true } : r
}
export async function setAptFirmAction(p) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const r = await opSetAptFirm(v.s, who(v), p)
  if (r.ok) refresh()
  return r
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
  const op = await openPeriod(v.s, period_id); if (op.error) return { ok: false, error: op.error }
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

/* ---------- chat Pomocník: rozhovor a potvrdenie zmien ---------- */
export async function billingChatAction({ period_id, messages, focus }) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(period_id)) return { ok: false, error: 'Neplatné obdobie.' }
  if (Array.isArray(messages) && messages.length > 60) return { ok: false, error: 'Rozhovor je príliš dlhý, začni nový.' }
  try {
    const { data: period } = await v.s.from('billing_periods').select('id,month,status').eq('id', period_id).maybeSingle()
    if (!period) return { ok: false, error: 'Obdobie neexistuje.' }
    return await chatTurn({ s: v.s, key: process.env.ANTHROPIC_API_KEY, period, messages, focus: Array.isArray(focus) ? focus.map(String).slice(0, 8) : [], me: { name: v.me && v.me.name } })
  } catch (e) { console.error('vyuctovanie chat', String(e && e.message).slice(0, 160)); return { ok: false, error: 'Pomocník momentálne nefunguje. Skús znova.' } }
}
/** Používateľ potvrdil návrhy v okne: každý sa znova overí na serveri a až potom vykoná. */
export async function applyChatActionsAction({ period_id, actions }) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!uuid(period_id) || !Array.isArray(actions) || !actions.length) return { ok: false, error: 'Nie je čo vykonať.' }
  try {
    const results = await applyActions(v.s, who(v), period_id, actions, { me: { name: v.me && v.me.name } })
    refresh()
    return { ok: true, results, done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length }
  } catch (e) { console.error('vyuctovanie chat apply', String(e && e.message).slice(0, 160)); return { ok: false, error: 'Zmeny sa nepodarilo vykonať.' } }
}
