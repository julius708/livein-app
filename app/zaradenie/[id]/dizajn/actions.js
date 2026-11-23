'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { hfSubmit, hfStatus, hfConfigured } from '@/lib/onb-higgsfield'
import { buildPrompt, CREDITS_PER_IMAGE, STYLES, ROOMS } from '@/lib/onb-design'

const MODEL = process.env.HF_MODEL || 'alibaba/qwen-image-3/edit'
const BUCKET = 'onboarding'
async function ctx() { const v = await getViewer(); if (!v.user || !v.me) throw new Error('Nie si prihlásený/á.'); return v }
const back = (id) => { revalidatePath(`/zaradenie/${id}/dizajn`); revalidatePath(`/zaradenie/${id}`); revalidatePath('/zaradenie') }

export async function setDesignMeta(prev, formData) {
  const { s } = await ctx()
  const id = String(formData.get('id') || '')
  const p = {}
  if (formData.has('budget_eur')) p.budget_eur = String(formData.get('budget_eur') || '')
  if (formData.has('design_style')) p.design_style = String(formData.get('design_style') || '')
  const { error } = await s.rpc('onb_unit_design_set', { p_id: id, p })
  if (error) return { ok: false, error: error.message }
  back(id); return { ok: true, n: Date.now() }
}

/** Nahrá fotku miestnosti (už zmenšenú v prehliadači) do úložiska a založí miestnosť. */
export async function addRoom(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || ''), roomType = String(formData.get('room_type') || 'ostatne'), label = String(formData.get('label') || '').slice(0, 60)
  const file = formData.get('photo')
  if (!file || typeof file === 'string' || !file.size) return { ok: false, error: 'Vyber fotku miestnosti.' }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'Fotka je príliš veľká (max 8 MB).' }
  if (!ROOMS[roomType]) return { ok: false, error: 'Neznáma miestnosť.' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${unitId}/rooms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const up = await s.storage.from(BUCKET).upload(path, buf, { contentType: file.type || 'image/jpeg', upsert: false })
  if (up.error) return { ok: false, error: `Nahratie zlyhalo: ${up.error.message}` }
  const { error } = await s.rpc('onb_room_add', { p: { unit_id: unitId, room_type: roomType, label, photo_path: path } })
  if (error) return { ok: false, error: error.message }
  back(unitId); return { ok: true, n: Date.now() }
}

/** Miestnosť sa len skryje, fotka a návrhy ostávajú v histórii. */
export async function hideRoom(formData) {
  const { s } = await ctx()
  const id = String(formData.get('room_id') || ''), unitId = String(formData.get('unit_id') || '')
  const { error } = await s.rpc('onb_room_hide', { p_id: id })
  if (error) return { ok: false, error: error.message }
  back(unitId); return { ok: true }
}

function creditsUsed(rooms) { return rooms.flatMap((r) => r.designs).filter((d) => d.status !== 'failed').reduce((a, d) => a + Number(d.credits || 0), 0) }

/** Vygeneruje dva návrhy (A a B) pre miestnosť vo zvolenom štýle bytu. */
export async function generatePair(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || ''), roomId = String(formData.get('room_id') || '')
  if (!hfConfigured()) return { ok: false, error: 'Higgsfield nie je pripojený (HF_API_KEY).' }
  const [{ data: u }, { data: rooms }] = await Promise.all([s.rpc('onb_unit_get', { p_id: unitId }), s.rpc('onb_rooms', { p_unit_id: unitId })])
  if (!u || !u.id) return { ok: false, error: 'Byt sa nenašiel.' }
  if (!u.budget_eur) return { ok: false, error: 'Najprv zadaj rozpočet na zariadenie bytu.' }
  if (!u.design_style || !STYLES[u.design_style]) return { ok: false, error: 'Najprv vyber štýl.' }
  const room = (rooms || []).find((r) => r.id === roomId)
  if (!room) return { ok: false, error: 'Miestnosť sa nenašla.' }
  const used = creditsUsed(rooms || []), need = 2 * CREDITS_PER_IMAGE
  if (used + need > Number(u.design_credits_cap || 60)) return { ok: false, error: `Strop kreditov pre tento byt (${u.design_credits_cap}) by sa prekročil: minuté ${used}, treba ${need}. Zvýšiť ho môže admin v nastaveniach bytu.` }
  const signed = await s.storage.from(BUCKET).createSignedUrl(room.photo_path, 3600)
  if (signed.error || !signed.data?.signedUrl) return { ok: false, error: 'Fotku sa nepodarilo sprístupniť pre generovanie.' }
  const round = Math.max(0, ...room.designs.map((d) => d.round || 0)) + 1
  const hook = process.env.HF_WEBHOOK_KEY ? `https://app.live-in.international/zaradenie/api/hf/webhook?k=${process.env.HF_WEBHOOK_KEY}` : null
  let firstErr = ''
  for (const variant of ['A', 'B']) {
    const prompt = buildPrompt(room.room_type, u.design_style, variant)
    let reqId = null, status = 'queued', err = null
    try {
      const r = await hfSubmit(MODEL, submitArgs(prompt, signed.data.signedUrl), hook)
      reqId = r.request_id || r.id || null
      if (!reqId) { status = 'failed'; err = `Neznáma odpoveď: ${JSON.stringify(r).slice(0, 200)}` }
    } catch (e) { status = 'failed'; err = e.message; firstErr = firstErr || e.message }
    await s.rpc('onb_design_add', { p: { unit_id: unitId, room_id: roomId, style: u.design_style, variant, round, prompt, model: MODEL, request_id: reqId, status, credits: status === 'failed' ? 0 : CREDITS_PER_IMAGE } })
  }
  back(unitId)
  return firstErr ? { ok: false, error: `Higgsfield odmietol požiadavku: ${firstErr}` } : { ok: true, n: Date.now() }
}

/** Parametre pre model (upravuje sa podľa dokumentácie Higgsfield Cloud API). */
function submitArgs(prompt, imageUrl) {
  const shape = process.env.HF_ARGS_SHAPE || 'image_urls'
  if (shape === 'medias') return { prompt, medias: [{ type: 'image', role: 'image_references', url: imageUrl }], resolution: '1k', aspect_ratio: 'auto' }
  if (shape === 'image_url') return { prompt, image_url: imageUrl, resolution: '1k', aspect_ratio: 'auto' }
  return { prompt, image_urls: [imageUrl], resolution: '1k', aspect_ratio: 'auto' }
}

function findImageUrl(obj) {
  if (!obj) return null
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) && /\.(jpe?g|png|webp)(\?|$)/i.test(obj) ? obj : null
  if (Array.isArray(obj)) { for (const x of obj) { const u = findImageUrl(x); if (u) return u } return null }
  if (typeof obj === 'object') { for (const k of ['url', 'image_url', 'images', 'image', 'result', 'output', 'data']) { const u = findImageUrl(obj[k]); if (u) return u } for (const v of Object.values(obj)) { const u = findImageUrl(v); if (u) return u } }
  return null
}

/** Skontroluje čakajúce návrhy u Higgsfieldu a hotové obrázky uloží do úložiska. Volá sa z detailu každých pár sekúnd. */
export async function checkPending(unitId) {
  const { s } = await ctx()
  const { data: rooms } = await s.rpc('onb_rooms', { p_unit_id: unitId })
  let changed = 0
  for (const r of rooms || []) for (const d of r.designs) {
    if (d.status === 'done' && d.result_url && !d.image_path) { if (await copyResult(s, d)) changed++ ; continue }
    if (d.status !== 'queued' && d.status !== 'in_progress') continue
    if (!d.request_id) { await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'failed', error: 'bez request_id' } }); changed++; continue }
    const st = await hfStatus(d.request_id).catch(() => null)
    if (!st || !st.ok) {
      if (st && st.status === 404) { await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'failed', error: 'Higgsfield požiadavku nepozná (404).' } }); changed++ }
      continue
    }
    const j = st.json || {}
    const status = String(j.status || '').toLowerCase()
    if (status === 'completed' || status === 'done' || status === 'succeeded') {
      const url = findImageUrl(j)
      if (!url) { await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'failed', error: `Hotové, ale bez obrázka: ${JSON.stringify(j).slice(0, 200)}` } }); changed++; continue }
      await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'done', result_url: url } })
      await copyResult(s, { ...d, result_url: url }); changed++
    } else if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'nsfw') {
      await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'failed', error: j.error || j.message || status } }); changed++
    } else if (status === 'in_progress' && d.status !== 'in_progress') {
      await s.rpc('onb_design_set', { p_id: d.id, p: { status: 'in_progress' } }); changed++
    }
  }
  if (changed) back(unitId)
  return { changed }
}

async function copyResult(s, d) {
  try {
    const res = await fetch(d.result_url, { cache: 'no-store' })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') || 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const path = `${d.unit_id}/designs/${d.id}.${ext}`
    const up = await s.storage.from(BUCKET).upload(path, Buffer.from(await res.arrayBuffer()), { contentType: ct, upsert: true })
    if (up.error) return false
    await s.rpc('onb_design_set', { p_id: d.id, p: { image_path: path } })
    return true
  } catch { return false }
}

export async function chooseDesign(formData) {
  const { s } = await ctx()
  const id = String(formData.get('design_id') || ''), unitId = String(formData.get('unit_id') || '')
  const { error } = await s.rpc('onb_design_choose', { p_id: id })
  if (error) return { ok: false, error: error.message }
  back(unitId); return { ok: true }
}

// ---- 3. krok: zoznam vecí z vybraného návrhu ----
import { claudeJson, claudeConfigured } from '@/lib/onb-claude'
import { ROOMS as ROOM_LABELS } from '@/lib/onb-design'

const LISTING_KEY = { obyvacka: 'obyvacka', spalna: 'spalna', kuchyna: 'kuchyna', kupelna: 'kupelna', chodba: 'ostatne', ostatne: 'ostatne' }

/** Claude si pozrie vybraný návrh miestnosti, vypíše nábytok a dekorácie a porovná ich s tým, čo v byte už je podľa checklistu. */
export async function generateItems(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || ''), roomId = String(formData.get('room_id') || '')
  if (!claudeConfigured()) return { ok: false, error: 'Chýba ANTHROPIC_API_KEY vo Verceli.' }
  const [{ data: u }, { data: rooms }] = await Promise.all([s.rpc('onb_unit_get', { p_id: unitId }), s.rpc('onb_rooms', { p_unit_id: unitId })])
  const room = (rooms || []).find((r) => r.id === roomId)
  if (!u || !room) return { ok: false, error: 'Miestnosť sa nenašla.' }
  const design = room.designs.find((d) => d.chosen && d.status === 'done') || room.designs.filter((d) => d.status === 'done').slice(-1)[0]
  if (!design) return { ok: false, error: 'Najprv vyber hotový návrh.' }
  let url = design.result_url
  if (design.image_path) { const sg = await s.storage.from(BUCKET).createSignedUrl(design.image_path, 1800); if (sg.data?.signedUrl) url = sg.data.signedUrl }
  if (!url) return { ok: false, error: 'Obrázok návrhu nie je dostupný.' }
  const have = ((u.listing || {})[LISTING_KEY[room.room_type]] || [])
  const system = 'Si zariaďovač krátkodobo prenajímaných bytov na Slovensku (LIVE-IN). Odpovedáš výhradne JSON bez komentára.'
  const text = `Na obrázku je návrh zariadenia miestnosti „${ROOM_LABELS[room.room_type]}“ v štýle ${u.design_style || ''} pre krátkodobý prenájom. Rozpočet na celý byt: ${u.budget_eur || '?'} €.
Priprav TRI verzie zoznamu vecí, ktoré treba kúpiť, aby miestnosť vyzerala ako na návrhu (nie steny, podlahu, okná, dvere, radiátory ani vstavané prvky):
- "minimum": nevyhnutné minimum, bez ktorého sa byt nedá spustiť pre hostí, najlacnejšie rozumné kusy;
- "standard": odporúčaný štandard LIVE-IN, dobrý pomer ceny a kvality, hostia to ocenia v recenziách;
- "komplet": všetko, čo na návrhu vidno, vrátane dekorácií, kvalitnejšie kusy.
Podľa checklistu v byte už je: ${have.length ? have.join(', ') : 'nič nie je zaznamenané'}. Ak položka zodpovedá niečomu z checklistu, daj present=true.
Odhad ceny v EUR za jeden kus pre lacné, ale kvalitné kusy (IKEA, JYSK, Möbelix, Sconto, XXXLutz, Kondela, Bonami, Beliani, Alza, Mall.sk) ako est_min a est_max.
Vráť JSON: {"minimum":[{"name":"názov po slovensky, krátko","category":"nabytok|svietidla|textil|dekoracie|technika|ine","qty":1,"present":false,"est_min":0,"est_max":0,"note":"farba, materiál, rozmer, voliteľné"}],"standard":[...],"komplet":[...]} . Každá verzia maximálne 25 položiek, zoradené od najdôležitejších.`
  let j
  try { j = await claudeJson({ system, text, imageUrl: url, maxTokens: 6000 }) } catch (e) { return { ok: false, error: e.message } }
  const items = []
  for (const tier of ['minimum', 'standard', 'komplet']) for (const x of (j[tier] || j.items || []).slice(0, 25)) if (x && x.name) items.push({ ...x, tier })
  if (!items.length) return { ok: false, error: 'Claude nevrátil žiadne položky.' }
  const { data: n, error } = await s.rpc('onb_items_replace', { p_unit_id: unitId, p_room_id: roomId, p_design_id: design.id, p_items: items })
  if (error) return { ok: false, error: error.message }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`)
  return { ok: true, n, t: Date.now() }
}

export async function setItem(formData) {
  const { s } = await ctx()
  const id = String(formData.get('item_id') || ''), unitId = String(formData.get('unit_id') || '')
  const p = {}
  for (const k of ['name', 'qty', 'present', 'est_min', 'est_max', 'note', 'hidden']) if (formData.has(k)) p[k] = String(formData.get(k))
  const { error } = await s.rpc('onb_item_set', { p_id: id, p })
  if (error) return { ok: false, error: error.message }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`); return { ok: true }
}

export async function addItem(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || ''), roomId = String(formData.get('room_id') || ''), name = String(formData.get('name') || '').trim()
  if (!name) return { ok: false, error: 'Zadaj názov.' }
  const { error } = await s.rpc('onb_item_add', { p: { unit_id: unitId, room_id: roomId, name, qty: String(formData.get('qty') || '1'), present: formData.get('present') === '1', est_min: String(formData.get('est_min') || ''), est_max: String(formData.get('est_max') || '') } })
  if (error) return { ok: false, error: error.message }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`); return { ok: true, t: Date.now() }
}

/** Prepne verziu zoznamu (minimum / standard / komplet) pre miestnosť; platí aj pre PDF. */
export async function setRoomTier(formData) {
  const { s } = await ctx()
  const roomId = String(formData.get('room_id') || ''), unitId = String(formData.get('unit_id') || ''), tier = String(formData.get('tier') || 'standard')
  const { error } = await s.rpc('onb_room_tier', { p_room_id: roomId, p_tier: tier })
  if (error) return { ok: false, error: error.message }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`); return { ok: true }
}

// ---- 4. krok: nákup ----
import { VENDORS, VENDOR_SITES } from '@/lib/onb-design'
import { createSubtask, updateTaskNotes } from '@/lib/onb-asana'

const BATCH = 4
function activeMissing(rooms, items) {
  const tierOf = Object.fromEntries((rooms || []).map((r) => [r.id, r.items_tier || 'standard']))
  return (items || []).filter((i) => !i.present && (!i.tier || i.tier === tierOf[i.room_id]))
}

/** Vyhľadá produkty pre dávku chýbajúcich vecí (zvolená verzia zoznamu). Klient volá opakovane, kým nevráti done. */
export async function findProducts(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || ''), again = formData.get('again') === '1'
  if (!claudeConfigured()) return { ok: false, error: 'Chýba ANTHROPIC_API_KEY vo Verceli.' }
  const [{ data: u }, { data: rooms }, { data: items }] = await Promise.all([s.rpc('onb_unit_get', { p_id: unitId }), s.rpc('onb_rooms', { p_unit_id: unitId }), s.rpc('onb_items', { p_unit_id: unitId })])
  if (!u || !u.id) return { ok: false, error: 'Byt sa nenašiel.' }
  const todo = activeMissing(rooms, items).filter((i) => again || !i.searched_at)
  if (!todo.length) return { ok: true, done: true, left: 0 }
  const batch = todo.slice(0, BATCH)
  const roomName = (id) => { const r = (rooms || []).find((x) => x.id === id); return r ? ROOM_LABELS[r.room_type] : '' }
  const system = 'Si nákupca zariadenia pre krátkodobo prenajímané byty na Slovensku (LIVE-IN). Hľadáš konkrétne produktové stránky. Odpovedáš výhradne JSON bez komentára.'
  const text = `Byt je v meste ${u.city || 'Bratislava'}. Štýl: ${u.design_style || ''}. Pre každú položku nájdi JEDEN konkrétny produkt (stránku produktu) v týchto obchodoch: ${VENDOR_SITES}.
ROZHODUJÚCE: produkt musí byť dostupný hneď (skladom v e-shope s doručením do pár dní, alebo na odber v obchode v meste ${u.city || 'Bratislava'}). Nie produkty s dodaním 2 až 4 týždne. Uprednostni najnižšiu cenu pri slušnej kvalite a vzhľade zodpovedajúcom návrhu.
Položky:
${batch.map((i) => `- id=${i.id}: ${i.name} (${roomName(i.room_id)}), ${i.qty} ks, poznámka: ${i.note || '-'}, odhad ${i.est_min ?? '?'} až ${i.est_max ?? '?'} € za kus`).join('\n')}
Vráť JSON: {"results":[{"item_id":"...","vendor":"IKEA|JYSK|Möbelix|Sconto|XXXLutz|Kondela|Bonami|Beliani|Alza|Mall.sk|Nay|Datart","product_name":"presný názov","url":"https://… stránka produktu","price":0,"availability":"skladom / odber v Bratislave / doručenie do 3 dní","note":"prečo tento, voliteľné"}]}. Cena v EUR za kus. Ak nič vhodné nenájdeš, daj vendor null a do note napíš prečo.`
  let j
  try { j = await claudeJson({ system, text, maxTokens: 4000, webSearch: 2 * batch.length, city: u.city || 'Bratislava' }) } catch (e) { return { ok: false, error: e.message } }
  let found = 0
  for (const i of batch) {
    const r = (j.results || []).find((x) => x && x.item_id === i.id) || {}
    const okUrl = typeof r.url === 'string' && /^https?:\/\//.test(r.url)
    const p = { searched_at: '1', vendor: okUrl ? r.vendor || '' : '', product_url: okUrl ? r.url : '', product_name: okUrl ? r.product_name || '' : '', price: okUrl && r.price != null ? String(r.price) : '', availability: okUrl ? r.availability || '' : (r.note || 'nenašlo sa'), purchase_status: okUrl ? 'najdene' : '' }
    if (okUrl) found++
    await s.rpc('onb_item_set', { p_id: i.id, p })
  }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`)
  return { ok: true, done: todo.length <= BATCH, left: Math.max(0, todo.length - BATCH), found, t: Date.now() }
}

export async function setPurchase(formData) {
  const { s } = await ctx()
  const id = String(formData.get('item_id') || ''), unitId = String(formData.get('unit_id') || '')
  const p = {}
  for (const k of ['purchase_status', 'price', 'product_url', 'vendor', 'product_name']) if (formData.has(k)) p[k] = String(formData.get(k))
  const { error } = await s.rpc('onb_item_set', { p_id: id, p })
  if (error) return { ok: false, error: error.message }
  back(unitId); revalidatePath(`/zaradenie/${unitId}/pdf`); return { ok: true }
}

/** Zapíše nákupný zoznam do Asany: jedna podúloha pod úlohou bytu na každého predajcu (pri opakovaní sa prepíše). */
export async function pushPurchasesToAsana(prev, formData) {
  const { s } = await ctx()
  const unitId = String(formData.get('unit_id') || '')
  const [{ data: u }, { data: rooms }, { data: items }] = await Promise.all([s.rpc('onb_unit_get', { p_id: unitId }), s.rpc('onb_rooms', { p_unit_id: unitId }), s.rpc('onb_items', { p_unit_id: unitId })])
  if (!u || !u.asana_task_gid) return { ok: false, error: 'Byt nie je v Asane.' }
  const list = activeMissing(rooms, items).filter((i) => i.product_url)
  if (!list.length) return { ok: false, error: 'Najprv vyhľadaj produkty.' }
  const byVendor = {}
  for (const i of list) (byVendor[i.vendor || 'Iné'] ||= []).push(i)
  const roomName = (id) => { const r = (rooms || []).find((x) => x.id === id); return r ? ROOM_LABELS[r.room_type] : '' }
  const saved = { ...(u.purchase_asana || {}) }
  let n = 0
  try {
    for (const [vendor, arr] of Object.entries(byVendor)) {
      const total = arr.reduce((a, i) => a + (i.price != null ? Number(i.price) * (i.qty || 1) : 0), 0)
      const name = `Nákup ${vendor}: ${arr.length} vecí, ${Math.round(total)} € (${u.address})`
      const notes = `Nákupný zoznam z LIVE-IN appky (Zaradenie bytov), ${u.address}.\n\n` + arr.map((i) => `• ${i.qty}× ${i.name} (${roomName(i.room_id)}) – ${i.product_name || ''} – ${i.price != null ? `${i.price} €/ks` : 'cena ?'} – ${i.availability || ''}\n  ${i.product_url}`).join('\n') + `\n\nSpolu približne ${Math.round(total)} €. Rozpočet bytu: ${u.budget_eur || '?'} €.`
      if (saved[vendor]) { await updateTaskNotes(saved[vendor], name, notes) } else { const r = await createSubtask(u.asana_task_gid, name, notes); saved[vendor] = r.gid }
      n++
    }
  } catch (e) { await s.rpc('onb_unit_purchase_asana', { p_id: unitId, p: saved }); return { ok: false, error: e.message } }
  await s.rpc('onb_unit_purchase_asana', { p_id: unitId, p: saved })
  back(unitId)
  return { ok: true, n, t: Date.now() }
}
