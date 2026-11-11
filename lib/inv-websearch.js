// Vyhľadávanie ponúk na internete: AI s webovým vyhľadávaním nájde aktuálne inzeráty na predaj a vráti štruktúrované údaje s odkazom.
// Čo AI nájde, je NEOVERENÉ (pôvod „predpoklad“), kým sa údaje nepodarí overiť priamo na stránke inzerátu (JSON-LD/OpenGraph, rešpektuje robots.txt).
// AI len extrahuje; výpočty a párovanie robí deterministický kód. Mŕtve odkazy (404/410) sa zahodia, nič sa nevymýšľa.
import { modelCandidates } from './anthropic.js'
import { isPublicHttpsUrl, checkUrl } from './inv-sources.js'
import { listingIdentity, toNum } from './inv-core.js'

export const SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 }
const SYSTEM = 'Si pomocník realitného tímu. Hľadáš AKTUÁLNE inzeráty nehnuteľností NA PREDAJ na slovenských realitných portáloch a v realitných kanceláriách. Používaj len to, čo si skutočne našiel vo výsledkoch vyhľadávania. Nikdy nevymýšľaj ceny, adresy ani odkazy. Odpovedz VÝLUČNE JSON poľom (bez textu okolo).'

/** Text otázky podľa filtrov firmy alebo podľa dopytu klienta. */
export function buildQuery({ city, types = ['byt'], rooms = [], priceMax = null, priceMin = null, areaMin = null, excluded = [], max = 12 }) {
  const parts = [`Nájdi až ${max} aktuálnych inzerátov na predaj: ${(types.length ? types : ['byt']).join(' alebo ')} v meste ${city}.`]
  if (rooms.length) parts.push(`Dispozícia: ${rooms.join(' alebo ')}-izbový.`)
  if (priceMin != null || priceMax != null) parts.push(`Cena${priceMin != null ? ` od ${priceMin} €` : ''}${priceMax != null ? ` do ${priceMax} €` : ''}.`)
  if (areaMin != null) parts.push(`Minimálna výmera ${areaMin} m².`)
  if (excluded.length) parts.push(`Vynechaj lokality: ${excluded.join(', ')}.`)
  parts.push('Ide o investičné nehnuteľnosti vhodné na prenájom. Každý inzerát musí mať priamy odkaz na detail inzerátu (nie zoznam).')
  parts.push('Vráť JSON pole objektov s kľúčmi: url (priamy odkaz na inzerát), title, city, district, address, price (číslo v €), area_interior (číslo v m²), area_exterior (číslo alebo null), rooms (počet izieb), floor (číslo alebo null), site (názov portálu). Neznáme údaje daj null.')
  return parts.join(' ')
}

/** Vytiahne JSON pole z textu odpovede (aj keď je v bloku kódu alebo má okolo text). */
export function parseListings(text) {
  const t = String(text || '')
  const i = t.indexOf('['), j = t.lastIndexOf(']')
  if (i < 0 || j <= i) return []
  try { const a = JSON.parse(t.slice(i, j + 1)); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : [] } catch { return [] }
}
/** Overí a vyčistí výsledok AI: len verejné https odkazy na detail, kladná cena; duplicity podľa odkazu. */
export function cleanFound(items, { max = 20 } = {}) {
  const seen = new Set(), out = [], rejected = []
  for (const it of items) {
    const url = String(it.url || '').trim()
    const id = isPublicHttpsUrl(url) ? listingIdentity(url) : null
    const price = toNum(it.price)
    if (!id) { rejected.push('neplatný odkaz'); continue }
    if (!(price > 0)) { rejected.push('bez ceny'); continue }
    if (seen.has(id.url)) continue
    seen.add(id.url)
    out.push({ ...it, url: id.url, source_key: id.source_key, external_id: id.external_id, price })
    if (out.length >= max) break
  }
  return { found: out, rejected }
}

async function callAnthropic(key, body, { fetchImpl = fetch, timeout = 50000 } = {}) {
  let last = { status: 0, error: '' }
  for (const model of modelCandidates()) {
    let r
    try { r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ ...body, model }), signal: AbortSignal.timeout(timeout) }) } catch (e) { last = { status: 0, error: String(e && e.message).slice(0, 120) }; if (/abort|timeout/i.test(last.error)) return { ok: false, ...last }; continue }
    if (r.ok) return { ok: true, json: await r.json(), model }
    const text = String(await r.text().catch(() => '')).slice(0, 300)
    last = { status: r.status, error: text }
    if (((r.status === 404 || r.status === 400) && /model/i.test(text)) || r.status === 429 || r.status === 529) continue
    return { ok: false, ...last }
  }
  return { ok: false, ...last }
}

/** Jedno vyhľadávanie: vráti { ok, items, error }. */
export async function searchOnce(query, { key, fetchImpl = fetch, maxUses = 5, allowedDomains = null } = {}) {
  if (!key) return { ok: false, items: [], error: 'Chýba ANTHROPIC_API_KEY (vyhľadávanie na internete nie je nastavené).' }
  const tool = { ...SEARCH_TOOL, max_uses: maxUses, ...(allowedDomains && allowedDomains.length ? { allowed_domains: allowedDomains } : {}) }
  const r = await callAnthropic(key, { max_tokens: 4000, system: SYSTEM, tools: [tool], messages: [{ role: 'user', content: query }] }, { fetchImpl })
  if (!r.ok) return { ok: false, items: [], error: `Vyhľadávanie zlyhalo (HTTP ${r.status || 'sieť'}${r.error ? ': ' + String(r.error).slice(0, 120) : ''})` }
  const text = (r.json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const items = parseListings(text)
  return { ok: true, items, model: r.model, empty: items.length === 0 }
}

/**
 * Celý krok „hľadanie na internete“ pre zdroj: dotazy podľa filtrov (všeobecný režim) a dopytov (cielený), potom overenie každého nájdeného odkazu priamo na stránke.
 * @returns { status, listings, error, notes }  (listings sú pripravené pre ingestListing)
 */
export async function runWebSearch(src, { filters = {}, inquiries = [], mode = 'both', key = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch, httpFetch = fetchImpl, robotsCache = new Map(), now = Date.now(), maxQueries = 2 } = {}) {
  const cfg = src.config || {}
  const queries = []
  if (mode !== 'targeted') for (const city of (filters.cities && filters.cities.length ? filters.cities : ['Bratislava']).slice(0, maxQueries)) queries.push({ q: buildQuery({ city, types: filters.types || ['byt'], rooms: filters.rooms || [], priceMax: filters.price_max ?? null, priceMin: filters.price_min ?? null, areaMin: filters.area_min ?? null, max: cfg.max_per_query || 12 }), why: `všeobecné: ${city}` })
  if (mode !== 'general') {
    const seen = new Set()
    for (const q of inquiries) for (const city of (q.cities || []).slice(0, 1)) {
      const cap = toNum(q.price_cap) ?? (q.budget_kind === 'total' ? toNum(q.budget_total) : null)
      const k = `${city}|${cap}|${(q.rooms || []).join(',')}`
      if (seen.has(k)) continue
      seen.add(k)
      queries.push({ q: buildQuery({ city, types: q.types && q.types.length ? q.types : ['byt'], rooms: q.rooms || [], priceMax: cap, areaMin: toNum(q.area_min), excluded: q.excluded_areas || [], max: 10 }), why: `cielené: ${city}${cap ? ' do ' + cap + ' €' : ''}` })
    }
  }
  const res = { status: 'ok', listings: [], notes: [], error: null, fetched: 0, complete: false, skipped_robots: 0 }
  if (!queries.length) return { ...res, notes: ['Žiadny dotaz na vyhľadávanie (skontroluj filtre a dopyty).'] }
  if (!key) return { ...res, status: 'error', error: 'Chýba ANTHROPIC_API_KEY (vyhľadávanie na internete nie je nastavené).' }
  const results = await Promise.all(queries.slice(0, Math.max(1, maxQueries + 2)).map((x) => searchOnce(x.q, { key, fetchImpl, maxUses: cfg.max_uses || 5, allowedDomains: cfg.allowed_domains || null })))
  const failed = results.filter((r) => !r.ok)
  if (failed.length === results.length) return { ...res, status: 'error', error: failed[0].error }
  for (const f of failed) res.notes.push(f.error)
  const all = results.filter((r) => r.ok).flatMap((r) => r.items)
  const { found, rejected } = cleanFound(all, { max: cfg.max_listings || 20 })
  if (rejected.length) res.notes.push(`${rejected.length} výsledkov bez platného odkazu alebo ceny sa zahodilo.`)
  res.fetched = results.length
  const iso = new Date(now).toISOString()
  let verified = 0, unverified = 0, dead = 0
  for (const it of found) {
    let item = it, how = 'AI vyhľadávanie z odkazu, neoverené zo zdroja'
    if (cfg.verify !== false) {
      const c = await checkUrl(it.url, { fetchImpl: httpFetch, robotsCache, now })
      if (c.state === 'gone') { dead++; continue }
      if (c.state === 'ok' && c.listing && !c.partial) { item = { ...it, ...Object.fromEntries(Object.entries(c.listing).filter(([k, v]) => v != null && k !== 'prov')), prov: c.listing.prov }; how = null; verified++ }
      else if (c.state === 'ok' && c.listing && c.listing.price != null) { item = { ...it, price: c.listing.price, prov: c.listing.prov }; how = 'cena overená na stránke, ostatné údaje z AI vyhľadávania'; unverified++ }
      else unverified++
    } else unverified++
    const prov = { ...(item.prov || {}) }
    if (how) for (const k of ['title', 'city', 'district', 'address', 'price', 'area_interior', 'area_exterior', 'rooms', 'floor']) if (item[k] != null && !prov[k]) prov[k] = { kind: 'assumption', ref: how, at: iso }
    res.listings.push({ url: item.url, source_key: item.source_key, external_id: item.external_id, title: item.title ? `${item.title}` : null, city: item.city, district: item.district, address: item.address, rooms: item.rooms, area_interior: item.area_interior, area_exterior: item.area_exterior, floor: item.floor, price: item.price, type: 'byt', checked_at: iso, prov })
  }
  res.notes.push(`Nájdených ${found.length}: overených na stránke ${verified}, neoverených ${unverified}, mŕtvych odkazov ${dead}.`)
  res.verified = verified; res.unverified = unverified
  return res   // nie je úplný prehľad: chýbajúce inzeráty sa nikdy neoznačujú ako odstránené
}
