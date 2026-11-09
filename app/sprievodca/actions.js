'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { canGuide, matchCards, isCode } from '@/lib/guide/core'
import { ensureUnit, issueLabel, syncUnits } from '@/lib/guide/server'
import { importListing, importBatch, recomputeCompleteness } from '@/lib/guide/guesty-import'
import { sanitizeSections, completeness, containsCode } from '@/lib/guide/content'

async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Najprv sa prihlás.' }
  if (!canGuide(v.me)) return { error: 'Sprievodca je pre prevádzku a zákaznícky servis.' }
  return v
}
const who = (v) => v.user.email.toLowerCase()
const str = (fd, k, max = 500) => String(fd.get(k) || '').trim().slice(0, max)
const j2 = (fd, k, max = 2000) => ({ sk: str(fd, k + '_sk', max), en: str(fd, k + '_en', max) })
const isListing = (x) => /^[0-9a-f]{24}$/i.test(String(x || ''))

/** Založenie jednotky pre listing (kód sa pridelí raz). */
export async function createUnitAction(listingId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isListing(listingId)) return { ok: false, error: 'Neplatné Guesty ID.' }
  const { data: l } = await v.s.from('listings').select('guesty_id,name,title,city,active').eq('guesty_id', listingId).maybeSingle()
  if (!l) return { ok: false, error: 'Listing nie je v registri (Guesty).' }
  try { const u = await ensureUnit(v.s, l, who(v)); revalidatePath('/sprievodca'); return { ok: true, code: u.public_code } } catch (e) { return { ok: false, error: e.message } }
}
/** Karta bytu (schválený obsah) + nastavenia jednotky. */
export async function saveCardAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const id = str(fd, 'listing_id', 40); if (!isListing(id)) return { ok: false, error: 'Neplatná jednotka.' }
  const unit = { address: str(fd, 'address', 200) || null, gbp_url: /^https:\/\//.test(str(fd, 'gbp_url', 300)) ? str(fd, 'gbp_url', 300) : null, support_phone: str(fd, 'support_phone', 40) || null, status: ['draft', 'review', 'ready', 'active', 'inactive'].includes(fd.get('status')) ? fd.get('status') : undefined }
  if (unit.status === undefined) delete unit.status
  const { error: e1 } = await v.s.from('guide_units').update(unit).eq('listing_id', id)
  if (e1) return { ok: false, error: e1.message }
  const card = { listing_id: id, address: unit.address, checkin_time: str(fd, 'checkin_time', 10) || null, address_note: j2(fd, 'address_note', 300), map_url: str(fd, 'map_url', 400) || null, lat: fd.get('lat') ? Number(fd.get('lat')) : null, lng: fd.get('lng') ? Number(fd.get('lng')) : null, parking: j2(fd, 'parking'), rules_override: j2(fd, 'rules_override'), checkout_time: str(fd, 'checkout_time', 20) || null, checkout: j2(fd, 'checkout'), arrival: j2(fd, 'arrival'), help: j2(fd, 'help', 500), approved: fd.get('approved') === 'on', approved_by: fd.get('approved') === 'on' ? who(v) : null, approved_at: fd.get('approved') === 'on' ? new Date().toISOString() : null, updated_by: who(v), updated_at: new Date().toISOString() }
  for (const k of ['arrival', 'address_note', 'parking', 'checkout', 'help']) for (const l of ['sk', 'en']) if (containsCode(card[k][l])) return { ok: false, error: `Pole „${k}“ (${l}) vyzerá, že obsahuje kód alebo heslo. Vstupné kódy do sprievodcu nepatria.` }
  // rozklikávacie sekcie: položky z formulára sec_<i>_key / sec_<i>_<j>_title_sk … (max 12 × 20)
  const sections = []
  for (let i = 0; i < 12; i++) { const key = str(fd, `sec_${i}_key`, 30); if (!key) continue; const items = []; for (let j = 0; j < 20; j++) { if (!fd.has(`sec_${i}_${j}_title_sk`) && !fd.has(`sec_${i}_${j}_title_en`)) continue; items.push({ title: j2(fd, `sec_${i}_${j}_title`, 120), body: j2(fd, `sec_${i}_${j}_body`, 2000) }) } sections.push({ key, icon: str(fd, `sec_${i}_icon`, 4), title: j2(fd, `sec_${i}_title`, 80), items }) }
  card.sections = sanitizeSections(sections)
  if (containsCode(JSON.stringify(card.sections))) return { ok: false, error: 'Niektorá sekcia vyzerá, že obsahuje kód alebo heslo. Vstupné kódy do sprievodcu nepatria.' }
  const { data: w } = await v.s.from('guide_wifi').select('listing_id').eq('listing_id', id).maybeSingle()
  const { data: u2 } = await v.s.from('guide_units').select('address,gbp_url').eq('listing_id', id).maybeSingle()
  card.completeness = completeness({ unit: u2 || {}, card, wifi: !!w }).score
  card.updated_by = who(v); card.updated_at = new Date().toISOString()
  const { error } = await v.s.from('guide_cards').upsert(card)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/sprievodca/${id}`); revalidatePath('/sprievodca'); return { ok: true, n: Date.now(), completeness: card.completeness }
}
/** Wi-Fi do chránenej karty (zadáva sa raz, pri routeri bez integrácie). Nezobrazuje sa späť. */
export async function saveWifiAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const id = str(fd, 'listing_id', 40); const ssid = str(fd, 'ssid', 64); const password = String(fd.get('password') || '').slice(0, 128)
  if (!isListing(id) || !ssid || !password) return { ok: false, error: 'Zadaj názov siete aj heslo.' }
  const { error } = await v.s.from('guide_wifi').upsert({ listing_id: id, ssid, password, updated_by: who(v), updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/sprievodca/${id}`); return { ok: true, n: Date.now() }
}
export async function issueLabelAction(listingId) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isListing(listingId)) return { ok: false, error: 'Neplatná jednotka.' }
  try { const r = await issueLabel(v.s, listingId, who(v)); revalidatePath(`/sprievodca/${listingId}`); revalidatePath('/sprievodca'); return r } catch (e) { return { ok: false, error: e.message } }
}
export async function syncAction() {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try { const r = await syncUnits({ issue: false }); revalidatePath('/sprievodca'); return { ok: true, ...r } } catch (e) { return { ok: false, error: e.message } }
}
/** Spoločné pravidlá, tipy a podujatia podľa mesta. */
export async function saveContentAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const kind = str(fd, 'kind', 10); const id = str(fd, 'id', 40)
  let table, row
  if (kind === 'rule') { table = 'guide_rules'; row = { city: str(fd, 'city', 40) || null, body: j2(fd, 'body'), sort: Number(fd.get('sort')) || 0, active: fd.get('active') !== 'off' } }
  else if (kind === 'tip') { table = 'guide_tips'; row = { city: str(fd, 'city', 40), category: str(fd, 'category', 40) || null, title: j2(fd, 'title', 120), body: j2(fd, 'body'), url: str(fd, 'url', 400) || null, sort: Number(fd.get('sort')) || 0, active: fd.get('active') !== 'off' } }
  else if (kind === 'event') { table = 'guide_events'; row = { city: str(fd, 'city', 40), title: j2(fd, 'title', 120), body: j2(fd, 'body'), place: str(fd, 'place', 120) || null, url: str(fd, 'url', 400) || null, starts_at: fd.get('starts_at') ? new Date(fd.get('starts_at')).toISOString() : null, ends_at: fd.get('ends_at') ? new Date(fd.get('ends_at')).toISOString() : null, active: fd.get('active') !== 'off' } }
  else return { ok: false, error: 'Neznámy typ.' }
  if ((kind !== 'rule' && !row.city) || !(row.body.sk || row.body.en || (row.title && (row.title.sk || row.title.en)))) return { ok: false, error: 'Doplň mesto a text (SK alebo EN).' }
  row.updated_at = new Date().toISOString()
  const q = /^[0-9a-f-]{36}$/i.test(id) ? v.s.from(table).update(row).eq('id', id) : v.s.from(table).insert(row)
  const { error } = await q
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sprievodca/obsah'); return { ok: true, n: Date.now() }
}
export async function saveSettingsAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Nastavenia mení len admin.' }
  const general = { support_phone: str(fd, 'support_phone', 40), support_phone_verified: fd.get('support_phone_verified') === 'on', template_version: Number(fd.get('template_version')) || 1, label_variant: fd.get('label_variant') === 'inverted' ? 'inverted' : 'standard', notify_channel: 'app', base_url: str(fd, 'base_url', 120) || 'https://app.live-in.international' }
  const units = str(fd, 'pilot_units', 2000).split(/[\s,;]+/).filter(isListing)
  const all = fd.get('pilot_all') === 'on'
  const { error } = await v.s.from('guide_settings').upsert([{ key: 'general', value: general, updated_by: who(v), updated_at: new Date().toISOString() }, { key: 'pilot', value: { units, all, note: all ? 'Všetky byty (rozhodnutie Július 9. 11. 2026).' : 'Pilotné jednotky (Guesty listing ID).' }, updated_by: who(v), updated_at: new Date().toISOString() }])
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sprievodca'); return { ok: true, n: Date.now() }
}
/** Import kariet z Prílohy A (JSON z tools/guide/priloha-a.mjs). Páruje podľa adresy; nejasné zhody ostávajú na kontrolu a nedostanú nič. */
export async function importCardsAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  let json; try { json = JSON.parse(String(fd.get('json') || '')) } catch { return { ok: false, error: 'Neplatný JSON.' } }
  const cards = Array.isArray(json) ? json : json.cards || []
  const dry = fd.get('dry') === 'on'
  const { data: apts } = await v.s.from('listings').select('guesty_id,name,title,city').eq('active', true).limit(2000)
  const { data: units } = await v.s.from('guide_units').select('listing_id,address')
  // adresa z Guesty nie je v listings; párujeme cez adresy už uložené pri jednotkách alebo dodané v JSON (pole listing_id má prednosť)
  const register = (units || []).filter((u) => u.address).map((u) => ({ id: u.listing_id, a: u.address }))
  const withId = cards.filter((c) => isListing(c.listing_id))
  const res = matchCards(cards.filter((c) => !isListing(c.listing_id)), register)
  const matched = [...withId.map((c) => ({ status: 'matched', listing_id: c.listing_id, card: c })), ...res.filter((r) => r.status === 'matched')]
  let imported = 0
  if (!dry) for (const m of matched) {
    const u = (units || []).find((x) => x.listing_id === m.listing_id) || null
    if (!u) { const l = (apts || []).find((x) => x.guesty_id === m.listing_id); if (!l) continue; await ensureUnit(v.s, l, who(v)) }
    await v.s.from('guide_units').update({ address: m.card.address_full || m.card.address || null }).eq('listing_id', m.listing_id)
    await v.s.from('guide_cards').upsert({ listing_id: m.listing_id, address: m.card.address_full || m.card.address || null, checkout_time: m.card.checkout || null, source: 'priloha_a', updated_by: who(v), updated_at: new Date().toISOString() }, { onConflict: 'listing_id' })
    if (m.card.wifi_ssid && m.card.wifi_pass && !/\[tel\]/.test(m.card.wifi_pass)) await v.s.from('guide_wifi').upsert({ listing_id: m.listing_id, ssid: m.card.wifi_ssid, password: m.card.wifi_pass, updated_by: who(v), updated_at: new Date().toISOString() })
    imported++
  }
  revalidatePath('/sprievodca')
  return { ok: true, dry, cards: cards.length, matched: matched.length, review: res.filter((r) => r.status === 'review').length, unmatched: res.filter((r) => r.status === 'unmatched').length, imported, reviewList: res.filter((r) => r.status !== 'matched').slice(0, 60).map((r) => `${(r.card || r.cards[0]).address_full}: ${r.reason}`) }
}
/** Dotazník: zapnutie a darček (admin). */
export async function saveSurveySettingsAction(prev, fd) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Nastavenia mení len admin.' }
  const value = { enabled: fd.get('enabled') === 'on', gift: { enabled: fd.get('gift_enabled') === 'on', kind: fd.get('gift_kind') === 'link' ? 'link' : 'code', code: str(fd, 'gift_code', 40).toUpperCase(), value: str(fd, 'gift_value', 40), url: /^https:\/\//.test(str(fd, 'gift_url', 300)) ? str(fd, 'gift_url', 300) : '', note: str(fd, 'gift_note', 300) } }
  if (value.gift.enabled && value.gift.kind === 'code' && (!value.gift.code || !value.gift.value)) return { ok: false, error: 'Pri zľavovom kóde doplň kód aj hodnotu (napr. 10 %).' }
  if (value.gift.enabled && value.gift.kind === 'link' && !value.gift.url) return { ok: false, error: 'Pri digitálnom darčeku doplň odkaz (https).' }
  const { error } = await v.s.from('guide_settings').upsert({ key: 'survey', value, updated_by: who(v), updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sprievodca/dotaznik'); return { ok: true, n: Date.now() }
}

/** Import návrhu karty z Guesty pre jeden byt (force = prepíše neschválený obsah). Výsledok je návrh na kontrolu. */
export async function importGuestyAction(listingId, force = false) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!isListing(listingId)) return { ok: false, error: 'Neplatná jednotka.' }
  try { const r = await importListing(v.s, listingId, { force: !!force, who: who(v) }); revalidatePath(`/sprievodca/${listingId}`); revalidatePath('/sprievodca'); return r } catch (e) { return { ok: false, error: String(e && e.message).slice(0, 200) } }
}
/** Dávkový import (3 byty na volanie, opakovať kým remaining > 0). */
export async function importGuestyBatchAction(force = false) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try { const r = await importBatch(v.s, { limit: 3, force: !!force }); revalidatePath('/sprievodca'); return { ok: true, ...r } } catch (e) { return { ok: false, error: String(e && e.message).slice(0, 200) } }
}
/** Prepočet úplnosti všetkých kariet. */
export async function recomputeAction() {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try { const r = await recomputeCompleteness(v.s); revalidatePath('/sprievodca'); return { ok: true, ...r } } catch (e) { return { ok: false, error: e.message } }
}
/** Vydanie štítkov pre všetky pripravené jednotky (schválený obsah). */
export async function issueAllAction() {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!v.isAdmin) return { ok: false, error: 'Hromadné vydanie spúšťa admin.' }
  try { const r = await syncUnits({ issue: true, who: who(v) }); revalidatePath('/sprievodca'); return { ok: true, ...r } } catch (e) { return { ok: false, error: e.message } }
}
