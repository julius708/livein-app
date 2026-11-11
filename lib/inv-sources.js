// Zdroje inzerátov: feedy (JSON, RSS), kontrola odkazov (JSON-LD / OpenGraph) a pravidlá slušného sťahovania (robots.txt, limit rýchlosti, výslovné blokovanie).
// Nič sa nesťahuje obchádzaním ochrán: 403/429/robots.txt = zdroj sa označí ako zablokovaný a neskúša sa agresívne.
import { listingIdentity, toNum, parseRooms } from './inv-core.js'

export const UA = 'LIVE-IN-InvestAgent/1.0 (interný nástroj na evidenciu ponúk)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- HTTP s ohľadom na zdroj ---------------- */
export async function fetchText(url, { fetchImpl = fetch, timeout = 12000, headers = {} } = {}) {
  const t0 = Date.now()
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.5', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeout), cache: 'no-store' })
    const text = res.status === 204 ? '' : await res.text()
    return { status: res.status, ok: res.ok, text: text.slice(0, 2_000_000), ms: Date.now() - t0 }
  } catch (e) { return { status: 0, ok: false, text: '', error: String(e && e.message).slice(0, 120), ms: Date.now() - t0 } }
}
/** Stav odpovede: 'ok' | 'gone' (404/410: inzerát zmizol) | 'blocked' (403/429/451: zdroj nás nechce) | 'error' (sieť, 5xx: nič z toho neznamená zmiznutý inzerát). */
export const classify = (r) => (r.ok ? 'ok' : r.status === 404 || r.status === 410 ? 'gone' : [401, 403, 429, 451].includes(r.status) ? 'blocked' : 'error')

/** robots.txt: pravidlá pre `*` a pre náš agent. Nedostupné robots.txt (sieť/5xx) = nesťahovať (opatrne). */
export function parseRobots(txt) {
  const groups = []; let cur = null
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const k = m[1].toLowerCase(), v = m[2].trim()
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur) } cur.agents.push(v.toLowerCase()) }
    else if ((k === 'disallow' || k === 'allow') && cur) cur.rules.push({ allow: k === 'allow', path: v })
  }
  return groups
}
export function robotsAllows(groups, path) {
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && UA.toLowerCase().includes(a)))
  const star = groups.filter((g) => g.agents.includes('*'))
  const rules = (mine.length ? mine : star).flatMap((g) => g.rules).filter((r) => r.path !== '')
  let best = null
  for (const r of rules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r
  }
  return best ? best.allow : true
}
export async function allowedByRobots(url, cache, opts = {}) {
  const u = new URL(url)
  if (!cache.has(u.origin)) {
    const r = await fetchText(u.origin + '/robots.txt', opts)
    cache.set(u.origin, r.status === 404 || r.status === 410 ? { groups: [], ok: true } : r.ok ? { groups: parseRobots(r.text), ok: true } : { ok: false, status: r.status })
  }
  const c = cache.get(u.origin)
  if (!c.ok) return { allowed: false, unknown: true, reason: `robots.txt nedostupné (${c.status || 'sieť'})` }
  const ok = robotsAllows(c.groups, u.pathname + u.search)
  return { allowed: ok, reason: ok ? null : 'zakázané v robots.txt' }
}

/* ---------------- extrakcia z HTML (schema.org JSON-LD, OpenGraph) ---------------- */
export function extractJsonLd(html) {
  const out = []
  for (const m of String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); for (const x of Array.isArray(j) ? j : j['@graph'] || [j]) out.push(x) } catch { /* poškodený blok sa preskočí */ }
  }
  return out
}
const metaTag = (html, name) => { const m = String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[.:]/g, '\\$&')}["'][^>]+content=["']([^"']*)["']`, 'i')) || String(html).match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name.replace(/[.:]/g, '\\$&')}["']`, 'i')); return m ? m[1] : null }
const pick = (o, ...ks) => { for (const k of ks) { const v = k.split('.').reduce((a, x) => (a == null ? a : a[x]), o); if (v !== undefined && v !== null && v !== '') return v } return null }
/** Z jednej stránky inzerátu vyberie, čo sa dá overiť (JSON-LD, OpenGraph). Čo chýba, ostane null; nič sa nehádže z textu stránky. */
export function extractListingFromHtml(html, url) {
  const ld = extractJsonLd(html).find((x) => /RealEstateListing|Apartment|Residence|House|Product|Offer|SingleFamily/i.test([].concat(x['@type'] || []).join(',')))
  const idn = listingIdentity(url) || {}
  const raw = { url, source_key: idn.source_key, external_id: idn.external_id, equipment: [], prov: {} }
  const mark = (k, how) => { raw.prov[k] = { kind: 'source', ref: how } }
  if (ld) {
    const offers = [].concat(ld.offers || [])[0] || {}
    const set = (k, v, how = 'JSON-LD') => { if (v != null && v !== '') { raw[k] = v; mark(k, how) } }
    set('title', pick(ld, 'name', 'headline'))
    set('price', toNum(pick(offers, 'price', 'priceSpecification.price')) ?? toNum(pick(ld, 'price')))
    set('city', pick(ld, 'address.addressLocality', 'location.address.addressLocality', 'contentLocation.address.addressLocality'))
    set('address', pick(ld, 'address.streetAddress', 'location.address.streetAddress'))
    set('district', pick(ld, 'address.addressRegion', 'location.address.addressRegion'))
    set('area_interior', toNum(pick(ld, 'floorSize.value', 'floorSize')))
    set('rooms', toNum(pick(ld, 'numberOfRooms')))
    set('lat', toNum(pick(ld, 'geo.latitude'))); set('lon', toNum(pick(ld, 'geo.longitude')))
    const av = String(pick(offers, 'availability') || '')
    if (/SoldOut|Discontinued|OutOfStock/i.test(av)) raw.listing_state = 'removed'
    if (raw.rooms == null && raw.title) { const r = parseRooms(raw.title); if (r != null) { raw.rooms = r; mark('rooms', 'z názvu') } }
  } else {
    const price = toNum(metaTag(html, 'product:price:amount') || metaTag(html, 'og:price:amount'))
    if (price) { raw.price = price; mark('price', 'OpenGraph') }
    const t = metaTag(html, 'og:title'); if (t) { raw.title = t; const r = parseRooms(t); if (r != null) { raw.rooms = r; mark('rooms', 'z názvu') } }
  }
  const found = ['price', 'city', 'area_interior'].filter((k) => raw[k] != null)
  return { raw, found, partial: found.length < 3 }
}

/* ---------------- feedy ---------------- */
const walk = (o, path) => path.split('.').reduce((a, x) => (a == null ? a : a[x]), o)
/** Mapovanie položky feedu podľa konfigurácie { cieľové_pole: 'cesta.v.zdroji' }; bez mapy sa berú rovnomenné polia. */
export function mapFeedItem(item, map = {}) {
  const raw = {}
  const keys = ['external_id', 'url', 'title', 'city', 'district', 'address', 'lat', 'lon', 'type', 'rooms', 'disposition', 'area_interior', 'area', 'area_exterior', 'floor', 'price', 'condition', 'parking', 'parking_mandatory', 'parking_in_price', 'commission_in_price', 'equipment', 'seller', 'listing_state', 'checked_at', 'bedrooms']
  for (const k of keys) { const v = map[k] ? walk(item, map[k]) : item[k]; if (v !== undefined && v !== null && v !== '') raw[k] = v }
  return raw
}
export function parseRss(xml) {
  const items = []
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : null }
  for (const m of String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const b = m[0]
    const link = tag(b, 'link') || (b.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || null
    items.push({ title: tag(b, 'title'), url: link, description: tag(b, 'description') || tag(b, 'summary'), guid: tag(b, 'guid') || tag(b, 'id'), date: tag(b, 'pubDate') || tag(b, 'updated') })
  }
  return items
}

/**
 * Spustí jeden zdroj. Vracia { status: 'ok'|'blocked'|'error'|'skipped', listings, complete, fetched, notes }.
 * `complete` = zdroj je úplný prehľad (config.complete_snapshot), len vtedy sa neprítomné inzeráty smú počítať ako chýbajúce.
 */
export async function runSource(src, { fetchImpl = fetch, budgetMs = 30000, now = Date.now(), inquiries = [], robotsCache = new Map(), delayMs = 1200 } = {}) {
  const cfg = src.config || {}
  const t0 = Date.now()
  const res = { status: 'ok', listings: [], complete: false, fetched: 0, notes: [], error: null, skipped_robots: 0 }
  if (src.kind === 'ingest') return { ...res, status: 'skipped', notes: ['Zdroj plní externý agent cez ingest API.'] }
  const out = (st, error) => ({ ...res, status: st, error: error || null })
  if (src.kind === 'feed') {
    const urls = []
    if (cfg.search_template && inquiries.length) {   // cielený režim: jeden dotaz na kombináciu mesto + cena z aktívnych dopytov
      const seen = new Set()
      for (const q of inquiries) for (const city of (q.cities && q.cities.length ? q.cities : [''])) { const cap = toNum(q.price_cap) ?? toNum(q.budget_total) ?? ''; const u = cfg.search_template.replace('{city}', encodeURIComponent(city)).replace('{price_max}', cap); if (!seen.has(u)) { seen.add(u); urls.push(u) } }
    }
    if (src.url) urls.unshift(src.url)
    for (const u of urls.slice(0, 8)) {
      if (Date.now() - t0 > budgetMs) { res.notes.push('Vypršal časový limit, zvyšok pokračuje v ďalšom behu.'); break }
      const rb = await allowedByRobots(u, robotsCache, { fetchImpl })
      if (!rb.allowed) { res.skipped_robots++; if (urls.length === 1 || rb.unknown) return out(rb.unknown ? 'error' : 'blocked', rb.reason); continue }
      const r = await fetchText(u, { fetchImpl, headers: cfg.headers || {} })
      res.fetched++
      const c = classify(r)
      if (c !== 'ok') return out(c === 'blocked' ? 'blocked' : 'error', `HTTP ${r.status || r.error}`)
      let items = []
      if ((cfg.format || 'json') === 'rss') items = parseRss(r.text).map((x) => ({ external_id: x.guid || x.url, url: x.url, title: x.title }))
      else { try { const j = JSON.parse(r.text); items = Array.isArray(j) ? j : j.items || j.results || j.data || j.listings || [] } catch { return out('error', 'Feed nie je platný JSON') } }
      for (const it of items.slice(0, cfg.max_items || 500)) { const raw = mapFeedItem(it, cfg.map || {}); if (!raw.checked_at) raw.checked_at = new Date(now).toISOString(); res.listings.push({ ...raw, source_key: raw.source_key || src.key }) }
      await sleep(Math.min(delayMs, 300))
    }
    res.complete = !!cfg.complete_snapshot && res.fetched === urls.slice(0, 8).length && res.skipped_robots === 0 && !res.notes.length
    return res
  }
  if (src.kind === 'url') {
    for (const u of (cfg.urls || []).slice(0, cfg.max_urls || 30)) {
      if (Date.now() - t0 > budgetMs) { res.notes.push('Vypršal časový limit, zvyšok pokračuje v ďalšom behu.'); break }
      const one = await checkUrl(u, { fetchImpl, robotsCache })
      res.fetched++
      if (one.state === 'blocked') return { ...res, status: 'blocked', error: one.error }
      if (one.state === 'error') { res.notes.push(`${u}: ${one.error}`); continue }
      if (one.listing) res.listings.push(one.listing)
      await sleep(delayMs)
    }
    return res
  }
  return out('error', 'Neznámy typ zdroja')
}

/** Skontroluje jeden odkaz na inzerát: { state: 'ok'|'gone'|'blocked'|'error', listing?, partial?, error? }. */
export async function checkUrl(url, { fetchImpl = fetch, robotsCache = new Map(), now = Date.now() } = {}) {
  const id = listingIdentity(url)
  if (!id) return { state: 'error', error: 'Neplatný odkaz' }
  const rb = await allowedByRobots(url, robotsCache, { fetchImpl })
  if (!rb.allowed) return { state: rb.unknown ? 'error' : 'blocked', error: rb.reason }
  const r = await fetchText(url, { fetchImpl })
  const c = classify(r)
  if (c === 'gone') return { state: 'gone', listing: { ...id, listing_state: 'removed', checked_at: new Date(now).toISOString() } }
  if (c !== 'ok') return { state: c === 'blocked' ? 'blocked' : 'error', error: `HTTP ${r.status || r.error}` }
  const ex = extractListingFromHtml(r.text, id.url)
  ex.raw.checked_at = new Date(now).toISOString()
  return { state: 'ok', listing: ex.raw, partial: ex.partial, found: ex.found }
}
