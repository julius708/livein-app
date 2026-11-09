// Sprievodca bytom: návrh obsahu karty z Guesty listingu (pokyny k príchodu a odchodu, parkovanie, manuál, vybavenie, Wi-Fi)
// + úprava modelom do dvojjazyčných rozklikávacích sekcií. Výsledok je NÁVRH (approved = false, status review); tím ho skontroluje a schváli.
// Kódy, PIN-y a heslá sa nikdy neukladajú do verejnej karty (stripCodes + kontrola výstupu modelu).
import { gget } from '../guesty'
import { callClaude } from '../anthropic'
import { draftFromGuesty, sanitizeSections, completeness, containsCode, stripCodes, GUESTY_CUSTOM_FIELDS, SECTION_KEYS, SECTION_TITLES } from './content.js'
import { ensureUnit } from './server.js'

const iso = () => new Date().toISOString()
const has = (o) => !!(o && (String(o.sk || '').trim() || String(o.en || '').trim()))
const LISTING_FIELDS = 'nickname title active address defaultCheckInTime defaultCheckOutTime checkInInstructions checkOutInstructions parkingInstructions houseManual trashCollectedOn amenities accommodates bedrooms bathrooms customFields publicDescription wifiName wifiPassword'

/** Jeden listing z Guesty (len polia pre sprievodcu). */
export async function fetchListing(listingId) { return gget(`/v1/listings/${listingId}`, { fields: LISTING_FIELDS }) }

/** Model: z hrubého návrhu urobí dvojjazyčný, štruktúrovaný obsah. Vráti null pri chybe (import potom uloží len hrubý návrh). */
export async function structureWithAi(draft, { key = process.env.ANTHROPIC_API_KEY, call = callClaude } = {}) {
  if (!key) return null
  const input = { arrival: draft.arrival, checkout: draft.checkout, parking: draft.parking, checkin_time: draft.checkin_time, checkout_time: draft.checkout_time, sections: draft.sections, description: draft.raw.notes.slice(0, 2500), house_manual: draft.raw.houseManual.slice(0, 2500), pet_fee: draft.raw.petFee, check_in_type: draft.raw.checkInType }
  const system = `Si redaktor digitálneho sprievodcu bytom pre hostí krátkodobého prenájmu (LIVE-IN, Slovensko). Dostaneš hrubé texty z rezervačného systému (slovensky a anglicky, niekedy len jeden jazyk).
Vráť IBA JSON bez komentárov v tvare:
{"arrival":{"sk":"","en":""},"checkout":{"sk":"","en":""},"parking":{"sk":"","en":""},"help":{"sk":"","en":""},"sections":[{"key":"<${SECTION_KEYS.join('|')}>","title":{"sk":"","en":""},"items":[{"title":{"sk":"","en":""},"body":{"sk":"","en":""}}]}]}
Pravidlá:
1. Každý text musí byť v OBOCH jazykoch (sk aj en) – chýbajúci jazyk prelož verne, nič nepridávaj ani nevymýšľaj (žiadne nové fakty, ceny, časy ani kontakty, ktoré vo vstupe nie sú).
2. Nikdy neuveď vstupný kód, PIN, kód od schránky, heslo ani Wi-Fi heslo. Ak sa vo vstupe objaví, napíš namiesto neho "[kód dostanete v správe pred príchodom]" / "[you will receive the code in a message before arrival]".
3. arrival = kroky príchodu ako očíslovaný zoznam (každý krok na novom riadku). checkout = pokyny k odchodu (čo urobiť s kľúčmi/čipom, okná, odpad, čas). parking = kde a ako parkovať. help = jedna veta, ako sa ozvať tímu (bez čísla – číslo pridá stránka).
4. sections: rozdeľ obsah do tém pre hosťa, každá položka má krátky nadpis a text: house_rules (fajčenie, hluk a nočný pokoj, domáce zvieratá, návštevy a večierky, odpad, kľúče, poškodenie – iba to, čo vstup obsahuje alebo čo je bežný štandard uvedený ako "štandardné pravidlá LIVE-IN"), apartment (vybavenie, kapacita, čo je k dispozícii), appliances (ako zapnúť kúrenie, bojler, práčku, TV – iba ak je vo vstupe), heating, trash, neighborhood (okolie, doprava, obchody – iba zo vstupu), important (neskorý príchod, faktúry, poplatok za zviera, kontakt v noci). Prázdne sekcie vynechaj.
5. Interné poznámky pre upratovanie alebo tím (počty paplónov, kapsule, zámky, kamery, batérie) do výstupu nepatria.
6. Tón: zdvorilý, vykanie, stručný, bez emoji.`
  const r = await call(key, { max_tokens: 6000, system, messages: [{ role: 'user', content: JSON.stringify(input) }] }, { timeoutMs: 45000 })
  if (!r.ok) { console.error('[guide] ai call failed', r.status, String(r.error).slice(0, 120)); return null }
  const text = (r.json.content || []).map((c) => c.text || '').join('')
  const m = text.match(/\{[\s\S]*\}/); if (!m) { console.error('[guide] ai: no JSON in output', text.slice(0, 120)); return null }
  let j; try { j = JSON.parse(m[0]) } catch (e) { console.error('[guide] ai: JSON parse', String(e.message).slice(0, 80), 'stop', r.json.stop_reason, 'len', text.length); return null }
  const two = (o, max = 3000) => ({ sk: stripCodes(String((o && o.sk) || '').slice(0, max), 'sk'), en: stripCodes(String((o && o.en) || '').slice(0, max), 'en') })
  const out = { arrival: two(j.arrival), checkout: two(j.checkout), parking: two(j.parking), help: two(j.help, 300), sections: sanitizeSections((j.sections || []).map((s) => ({ ...s, title: has(s && s.title) ? s.title : SECTION_TITLES[s && s.key] }))) }
  if (containsCode(JSON.stringify(out))) { console.error('[guide] ai: output contains a code-like token'); return null }
  return out
}

/** Import jedného listingu do karty. Vyplní iba prázdne polia (force = prepíše neschválené). Wi-Fi sa doplní len ak chýba. */
export async function importListing(s, listingId, { force = false, ai = true, who = 'guesty-import', fetchImpl = fetchListing, aiImpl = structureWithAi } = {}) {
  const l = await fetchImpl(listingId)
  if (!l || !l._id) return { ok: false, error: 'listing_not_found' }
  const unit = await ensureUnit(s, { guesty_id: listingId, name: l.nickname || l.title, city: (l.address && l.address.city) || null }, who)
  const draft = draftFromGuesty(l, { customFieldIds: GUESTY_CUSTOM_FIELDS })
  const { data: ex } = await s.from('guide_cards').select('*').eq('listing_id', listingId).maybeSingle()
  const card = ex || { listing_id: listingId }
  const attempts = Number((card.guesty && card.guesty.ai_attempts) || 0) + 1
  const retry = !card.approved && card.source === 'guesty' && card.guesty && !card.guesty.ai && attempts <= 3
  const may = (field) => (force || retry) ? !card.approved : !has(card[field])
  let structured = null, aiUsed = false
  if (ai) { structured = await aiImpl(draft); aiUsed = !!structured }
  const src = structured || draft
  const next = { listing_id: listingId, source: card.source && card.source !== 'guesty' && !force ? card.source : 'guesty', updated_by: who, updated_at: iso(), guesty_imported_at: iso(),
    guesty: { imported_at: iso(), ai_attempts: attempts, nickname: l.nickname, check_in_type: draft.raw.checkInType, has_wifi: !!draft.wifi, ai: aiUsed, fields: { arrival: !!(draft.arrival.sk || draft.arrival.en), checkout: !!(draft.checkout.sk || draft.checkout.en), parking: has(draft.parking), sections: draft.sections.map((x) => x.key) } } }
  if (!card.address && draft.address) next.address = draft.address
  if (card.lat == null && draft.lat != null) { next.lat = draft.lat; next.lng = draft.lng }
  if (!card.checkin_time && draft.checkin_time) next.checkin_time = draft.checkin_time
  if (!card.checkout_time && draft.checkout_time) next.checkout_time = draft.checkout_time
  for (const f of ['arrival', 'checkout', 'parking']) if (may(f) && has(src[f])) next[f] = src[f]
  if (structured && may('help') && has(structured.help)) next.help = structured.help
  if (((force || retry) && !card.approved) || !(Array.isArray(card.sections) && card.sections.length)) next.sections = src.sections
  if (!card.approved) next.approved = false
  const merged = { ...card, ...next }
  const { data: w } = await s.from('guide_wifi').select('listing_id').eq('listing_id', listingId).maybeSingle()
  let wifiAdded = false
  if (!w && draft.wifi && !/\[|tel|see|pozri/i.test(draft.wifi.password)) { const { error } = await s.from('guide_wifi').upsert({ listing_id: listingId, ssid: draft.wifi.ssid, password: draft.wifi.password, updated_by: who, updated_at: iso() }); wifiAdded = !error }
  next.completeness = completeness({ unit: { ...unit, address: unit.address || merged.address }, card: merged, wifi: !!(w || wifiAdded) }).score
  const { error } = await s.from('guide_cards').upsert(next, { onConflict: 'listing_id' })
  if (error) return { ok: false, error: error.message }
  const unitPatch = {}
  if (!unit.address && merged.address) unitPatch.address = merged.address
  if (unit.status === 'draft') unitPatch.status = 'review'
  if (!unit.name && (l.nickname || l.title)) unitPatch.name = l.nickname || l.title
  if (Object.keys(unitPatch).length) await s.from('guide_units').update(unitPatch).eq('listing_id', listingId)
  return { ok: true, listing_id: listingId, ai: aiUsed, wifi: wifiAdded, completeness: next.completeness, filled: Object.keys(next).filter((k) => ['arrival', 'checkout', 'parking', 'help', 'sections', 'address'].includes(k)) }
}

/** Dávka: jednotky bez importu (alebo všetky pri force), max `limit` na jedno volanie (limit funkcie 60 s). */
export async function importBatch(s, { limit = 3, force = false, ai = true, only = null } = {}) {
  const { data: units } = await s.from('guide_units').select('listing_id,status').neq('status', 'inactive').order('name')
  const { data: cards } = await s.from('guide_cards').select('listing_id,guesty_imported_at,approved,source,guesty')
  const done = new Map((cards || []).map((c) => [c.listing_id, c]))
  const pending = (c) => !c.guesty_imported_at || (!c.approved && c.source === 'guesty' && c.guesty && !c.guesty.ai && Number(c.guesty.ai_attempts || 0) < 3)
  const todo = (units || []).filter((u) => (only ? u.listing_id === only : true)).filter((u) => force ? !(done.get(u.listing_id) || {}).approved : pending(done.get(u.listing_id) || {})).slice(0, limit)
  const results = []
  for (const u of todo) { try { results.push(await importListing(s, u.listing_id, { force, ai })) } catch (e) { results.push({ ok: false, listing_id: u.listing_id, error: String(e && e.message).slice(0, 120) }) } }
  const remaining = (units || []).filter((u) => force ? !(done.get(u.listing_id) || {}).approved : pending(done.get(u.listing_id) || {})).length - results.filter((r) => r.ok).length
  return { done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, remaining: Math.max(0, remaining), results }
}

/** Prepočet úplnosti všetkých kariet (po ručných úpravách). */
export async function recomputeCompleteness(s) {
  const [{ data: units }, { data: cards }, { data: wifi }] = await Promise.all([s.from('guide_units').select('listing_id,address,gbp_url'), s.from('guide_cards').select('*'), s.from('guide_wifi').select('listing_id')])
  const w = new Set((wifi || []).map((x) => x.listing_id)); let n = 0
  for (const u of units || []) { const c = (cards || []).find((x) => x.listing_id === u.listing_id) || {}; const score = completeness({ unit: u, card: c, wifi: w.has(u.listing_id) }).score; if (c.listing_id && c.completeness !== score) { await s.from('guide_cards').update({ completeness: score }).eq('listing_id', u.listing_id); n++ } }
  return { updated: n }
}
