// Investičné nehnuteľnosti a kupujúci: stavy, normalizácia inzerátov, duplicity, aktuálnosť údajov. Čistý kód, bez siete.
import { hashInputs } from './inv-calc.js'

export const INV_ROLES = ['crm', 'admin']   // obchodný tím (CRM) a admini (aj tí, čo nemajú rolu CRM)
export const canInv = (me) => !!(me && me.active !== false && (me.roles || []).some((r) => INV_ROLES.includes(r)))

/* ---------- stavy nehnuteľnosti ---------- */
export const PROP_STATUS = [
  { id: 'new', label: 'Nové', hint: 'Nájdené agentom alebo pridané, ešte nikto neskontroloval.' },
  { id: 'review', label: 'Na preverenie', hint: 'Zuzka ju vzala na preverenie.' },
  { id: 'active', label: 'Aktívny inzerát', hint: 'Inzerát je na portáli. Neznamená, že je potvrdená dostupnosť.' },
  { id: 'confirmed', label: 'Dostupnosť potvrdená predajcom', hint: 'Predajca potvrdil dostupnosť (dátum je pri nehnuteľnosti).' },
  { id: 'reserved', label: 'Rezervované', hint: 'Predajca ju má rezervovanú.' },
  { id: 'sold', label: 'Predané', hint: 'Len podľa potvrdenia. Zmiznutý inzerát automaticky neznamená predané.' },
  { id: 'withdrawn', label: 'Stiahnuté', hint: 'Inzerát zmizol z portálu (opakovane overené pri funkčnom zdroji).' },
  { id: 'unknown', label: 'Dostupnosť neznáma', hint: 'Zdroj nie je overiteľný alebo údaje sú staré.' },
]
export const PROP_STATUS_IDS = PROP_STATUS.map((s) => s.id)
export const propStatusLabel = (id) => (PROP_STATUS.find((s) => s.id === id) || { label: id || '—' }).label
/** Stavy, v ktorých sa nehnuteľnosť odporúča klientom. Rezervované, predané a stiahnuté nie. */
export const RECOMMENDABLE = ['new', 'review', 'active', 'confirmed', 'unknown']
export const isRecommendable = (st) => RECOMMENDABLE.includes(st)
export const UNAVAILABLE = ['reserved', 'sold', 'withdrawn']

/* ---------- stavy dopytu ---------- */
export const INQ_STATUS = [
  { id: 'new', label: 'Nový dopyt' },
  { id: 'confirmed', label: 'Potvrdený dopyt' },
  { id: 'selection', label: 'Výber nehnuteľností' },
  { id: 'viewings', label: 'Obhliadky' },
  { id: 'purchase', label: 'Kúpa' },
  { id: 'handover', label: 'Odovzdané do správy' },
  { id: 'paused', label: 'Pozastavený' },
  { id: 'closed', label: 'Uzavretý' },
]
export const INQ_STATUS_IDS = INQ_STATUS.map((s) => s.id)
export const inqStatusLabel = (id) => (INQ_STATUS.find((s) => s.id === id) || { label: id || '—' }).label
export const ACTIVE_INQ = ['new', 'confirmed', 'selection', 'viewings', 'purchase']
export const isActiveInquiry = (i) => !!i && ACTIVE_INQ.includes(i.status)
export const INQ_SOURCES = ['CRM kontakt', 'Telefonát', 'Odporúčanie', 'Web formulár', 'Starý pilot (na potvrdenie)', 'Iné']
export const GOALS = [{ id: 'str', label: 'Krátkodobý prenájom' }, { id: 'ltr', label: 'Dlhodobý prenájom' }, { id: 'compare', label: 'Porovnanie' }]
export const RISK = [{ id: 'low', label: 'Nízka' }, { id: 'medium', label: 'Stredná' }, { id: 'high', label: 'Vyššia' }]
export const BUDGET_KINDS = [{ id: 'total', label: 'Celková investícia (všetko spolu)' }, { id: 'equity', label: 'Len vlastné zdroje (úver navyše)' }, { id: 'unknown', label: 'Zatiaľ nevieme, čo suma znamená' }]

/* ---------- rozhodnutie o zhode ---------- */
export const DECISIONS = [
  { id: 'open', label: 'Nové' },
  { id: 'review', label: 'Na preverenie' },
  { id: 'shortlist', label: 'Kandidát' },
  { id: 'viewing', label: 'Obhliadka' },
  { id: 'offer', label: 'V ponuke' },
  { id: 'rejected', label: 'Zamietnuté' },
]
export const decisionLabel = (id) => (DECISIONS.find((d) => d.id === id) || { label: id || '—' }).label

/* ---------- jednoduché pomôcky ---------- */
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export { fold }
export const toNum = (x) => { if (x === null || x === undefined || x === '') return null; const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/\s| /g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }

/** Odkaz bez sledovacích parametrov a fragmentu: dva odkazy na ten istý inzerát vyjdú rovnako. */
export function canonicalUrl(u) {
  try {
    const x = new URL(String(u).trim())
    x.hash = ''
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(k)) x.searchParams.delete(k)
    x.hostname = x.hostname.replace(/^www\./, '').toLowerCase()
    return x.toString().replace(/\/$/, '')
  } catch { return null }
}
/** Zdroj a identifikátor inzerátu z odkazu (portál/doména + posledné číslo alebo cesta). */
export function listingIdentity(url) {
  const c = canonicalUrl(url)
  if (!c) return null
  const x = new URL(c)
  const host = x.hostname
  const m = x.pathname.match(/(\d{5,})/g)
  return { source_key: host, external_id: m ? m[m.length - 1] : x.pathname.replace(/^\/|\/$/g, '') || c, url: c }
}
/** „2-izbový byt“, „3 izby“, „garsónka“ → počet izieb. */
export function parseRooms(s) {
  const t = fold(s)
  if (!t) return null
  if (/garson|studio/.test(t)) return 1
  const m = t.match(/(\d+)\s*[- ]?\s*(izb|room|iz\b)/) || t.match(/^(\d+)$/)
  return m ? Number(m[1]) : null
}
export const normStreet = (s) => fold(s).replace(/\b(ul|ulica|namestie|nam|trieda|cesta)\b\.?/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const houseNo = (s) => { const m = fold(s).match(/\b(\d+[a-z]?(?:\/\d+)?)\b/); return m ? m[1] : null }

/** Vlastnosti z textových tagov vybavenia. Chýbajúca zmienka nie je „nie“: zostáva neznáme (null), len výslovné `features` môžu byť false. */
export const FEATURE_TAGS = { parking: /parkov|garaz/, elevator: /vytah|lift/, balcony: /balkon|lodzi|loggia|terasa/, furnished: /zariaden/, aircon: /klimat/ }
export const FEATURE_LABELS = { parking: 'Parkovanie', elevator: 'Výťah', balcony: 'Balkón / loggia / terasa', furnished: 'Zariadený', aircon: 'Klimatizácia' }
export function featuresFrom(equipment = [], explicit = {}, p = {}) {
  const f = {}
  for (const k of Object.keys(FEATURE_TAGS)) f[k] = null
  for (const e of equipment) for (const [k, re] of Object.entries(FEATURE_TAGS)) if (re.test(fold(e))) f[k] = true
  if (p.parking_mandatory === true) f.parking = true
  if (p.area_exterior != null && p.area_exterior > 0 && f.balcony == null) f.balcony = true
  for (const [k, v] of Object.entries(explicit || {})) if (k in f && typeof v === 'boolean') f[k] = v
  return f
}

/** Zjednotí údaje z feedu / odkazu / agenta / formulára na jednotný tvar. Neznáme zostáva null (nikdy nula). */
export function normalizeListing(raw = {}) {
  const r = raw || {}
  const idn = r.url ? listingIdentity(r.url) : null
  const rooms = toNum(r.rooms) ?? parseRooms(r.disposition) ?? parseRooms(r.title)
  const bedrooms = toNum(r.bedrooms) ?? (rooms != null ? Math.max(0, rooms - 1) : null)
  const price = toNum(r.price)
  const t = (v, n = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null }
  const out = {
    source_key: t(r.source_key || (idn && idn.source_key), 80),
    external_id: t(r.external_id || (idn && idn.external_id), 120),
    url: idn ? idn.url : t(r.url, 500),
    title: t(r.title, 200),
    city: t(r.city, 80), district: t(r.district, 120), address: t(r.address, 200),
    lat: toNum(r.lat), lon: toNum(r.lon),
    type: /dom|house|vila/i.test(String(r.type || '')) ? 'dom' : r.type ? 'byt' : null,
    rooms, bedrooms,
    area_interior: toNum(r.area_interior ?? r.area), area_exterior: toNum(r.area_exterior),
    floor: toNum(r.floor),
    price: price != null && price > 0 ? price : null,
    condition: t(r.condition, 40), parking: t(r.parking, 120),
    parking_mandatory: typeof r.parking_mandatory === 'boolean' ? r.parking_mandatory : null,
    parking_in_price: typeof r.parking_in_price === 'boolean' ? r.parking_in_price : null,
    parking_price: toNum(r.parking_price),
    commission_in_price: typeof r.commission_in_price === 'boolean' ? r.commission_in_price : null,
    commission_pct: toNum(r.commission_pct),
    equipment: Array.isArray(r.equipment) ? r.equipment.map((x) => fold(x)).filter(Boolean).slice(0, 30) : [],
    seller: t(r.seller, 200),
    features: null,
    listing_state: r.listing_state === 'removed' ? 'removed' : 'active',
    checked_at: r.checked_at && Number.isFinite(Date.parse(r.checked_at)) ? new Date(r.checked_at).toISOString() : null,
    prov: r.prov && typeof r.prov === 'object' ? r.prov : null,
  }
  out.features = featuresFrom(out.equipment, r.features, out)
  return out
}
export function validateListing(n) {
  const errors = []
  if (!n.source_key) errors.push('Chýba zdroj (source_key alebo url).')
  if (!n.external_id) errors.push('Chýba identifikátor inzerátu (external_id alebo url).')
  if (!n.city && !n.address) errors.push('Chýba mesto alebo adresa.')
  if (n.price == null && n.listing_state !== 'removed') errors.push('Chýba cena.')
  return errors
}

/* ---------- duplicity naprieč portálmi ---------- */
const pctDiff = (a, b) => (a > 0 && b > 0 ? Math.abs(a - b) / Math.max(a, b) : null)
const geoMeters = (a, b) => { if ([a.lat, a.lon, b.lat, b.lon].some((x) => x == null)) return null; const R = 6371000, d = Math.PI / 180, dl = (b.lat - a.lat) * d, dn = (b.lon - a.lon) * d; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
export const MERGE_AUTO = 85, MERGE_SUGGEST = 60
/** Podobnosť dvoch nehnuteľností 0–100 a dôvody. Automatické zlúčenie vyžaduje takmer úplnú zhodu, nejasné zhody sa len navrhnú. */
export function similarity(a, b) {
  const reasons = []
  let score = 0
  if (fold(a.city) !== fold(b.city) && a.city && b.city) return { score: 0, reasons: ['iné mesto'], hard_diff: true }
  const sa = normStreet(a.address || ''), sb = normStreet(b.address || '')
  const streetA = sa.replace(/\b\d+[a-z]?(\/\d+)?\b/g, '').trim(), streetB = sb.replace(/\b\d+[a-z]?(\/\d+)?\b/g, '').trim()
  if (streetA && streetB && streetA === streetB) { score += 30; reasons.push('rovnaká ulica') }
  const na = houseNo(a.address || ''), nb = houseNo(b.address || '')
  if (na && nb && na === nb) { score += 15; reasons.push('rovnaké číslo domu') }
  const ad = pctDiff(a.area_interior, b.area_interior)
  if (ad != null) { if (ad <= 0.015) { score += 25; reasons.push('rovnaká výmera') } else if (ad <= 0.04) { score += 15; reasons.push('podobná výmera') } else if (ad > 0.12) { return { score: 0, reasons: ['výrazne iná výmera'], hard_diff: true } } }
  if (a.rooms != null && b.rooms != null) { if (a.rooms === b.rooms) { score += 15; reasons.push('rovnaká dispozícia') } else return { score: 0, reasons: ['iná dispozícia'], hard_diff: true } }
  if (a.floor != null && b.floor != null && a.floor === b.floor) { score += 10; reasons.push('rovnaké poschodie') }
  const pd = pctDiff(a.price, b.price)
  if (pd != null && pd <= 0.04) { score += 5; reasons.push('podobná cena') }
  const g = geoMeters(a, b)
  if (g != null && g <= 60) { score += 25; reasons.push('rovnaké miesto (GPS)') }
  return { score: Math.min(100, score), reasons }
}
/** Rozhodnutie pre nový záznam voči existujúcim: 'merge' (isté), 'suggest' (neisté, navrhnúť zlúčenie), 'new'. */
export function dedupeDecision(candidate, existing) {
  let best = null
  for (const e of existing) { const s = similarity(candidate, e); if (!best || s.score > best.score) best = { ...s, id: e.id } }
  if (!best || best.score < MERGE_SUGGEST) return { action: 'new', best }
  if (best.score >= MERGE_AUTO) return { action: 'merge', id: best.id, score: best.score, reasons: best.reasons }
  return { action: 'suggest', id: best.id, score: best.score, reasons: best.reasons }
}

/* ---------- zmeny a aktuálnosť ---------- */
export const PRICE_CHANGE = { pct: 1, abs: 1000 }
/** Významná zmena ceny: aspoň 1 % alebo 1 000 €. Vracia { changed, significant, delta, pct }. */
export function priceChange(oldP, newP, rule = PRICE_CHANGE) {
  if (oldP == null || newP == null || oldP === newP) return { changed: false, significant: false, delta: 0, pct: 0 }
  const delta = newP - oldP, pct = (delta / oldP) * 100
  return { changed: true, significant: Math.abs(pct) >= rule.pct || Math.abs(delta) >= rule.abs, delta, pct }
}
export const DEFAULT_FRESHNESS = { source_fresh_days: 3, source_stale_days: 7, seller_confirm_days: 14 }
const days = (iso, now) => (iso && Number.isFinite(Date.parse(iso)) ? Math.max(0, Math.floor((now - Date.parse(iso)) / 864e5)) : null)
/** Aktuálnosť údajov (oddelene od výhodnosti a zhody): kontrola zdroja a potvrdenie predajcom. */
export function freshness(p, now = Date.now(), cfg = DEFAULT_FRESHNESS) {
  const c = { ...DEFAULT_FRESHNESS, ...(cfg || {}) }
  const checked = days(p.last_checked_at, now), confirmed = days(p.last_confirmed_at, now)
  const source = checked == null ? 'never' : checked <= c.source_fresh_days ? 'fresh' : checked <= c.source_stale_days ? 'stale' : 'old'
  const seller = confirmed == null ? 'never' : confirmed <= c.seller_confirm_days ? 'fresh' : 'old'
  return { checked_days: checked, confirmed_days: confirmed, source, seller, ok: source === 'fresh' || source === 'stale', label: checked == null ? 'zdroj nikdy nekontrolovaný' : `zdroj skontrolovaný pred ${checked} d`, seller_label: confirmed == null ? 'predajcom nepotvrdené' : `predajca potvrdil pred ${confirmed} d` }
}
/** Odtlačok údajov dôležitých pre zhodu: ak sa zmení, významná zmena môže zamietnutú ponuku navrhnúť na opätovné posúdenie. */
export function propertySignature(p, calc) {
  return hashInputs({ price: p.price ?? null, status: p.status, area: p.area_interior ?? null, city: p.city ?? null, rooms: p.rooms ?? null, total: calc && calc.investment ? calc.investment.known_total : null, unknown: calc && calc.investment ? calc.investment.unknown.map((u) => u.key).sort() : null })
}
