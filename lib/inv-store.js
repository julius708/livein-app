// Investície – serverové operácie nad Supabase: import inzerátov (idempotentne), duplicity, ceny a história, výpočty (verzie), párovanie, upozornenia.
// Všetky funkcie dostanú klienta `s` (používateľ s RLS alebo service role) a sú testovateľné s atrapou. Žiadne PII do logov.
import { normalizeListing, validateListing, dedupeDecision, priceChange, fold, DEFAULT_FRESHNESS, PROP_STATUS_IDS, ACTIVE_INQ, UNAVAILABLE, toNum, FEATURE_TAGS } from './inv-core.js'
import { computeInvestment, DEFAULT_CALC_SETTINGS, CALC_VERSION } from './inv-calc.js'
import { evaluateMatch, matchSignature } from './inv-match.js'

const iso = (d = Date.now()) => new Date(d).toISOString()
const log = (...a) => console.log('[invest]', ...a)
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }

export const DEFAULT_AGENT = {
  enabled: true, interval_hours: 24, run_at_local: '07:00', timezone: 'Europe/Bratislava', retry_minutes: 60, max_attempts: 3,
  general: true, targeted: true,
  filters: { cities: ['Bratislava', 'Košice'], types: ['byt'], rooms: [], price_min: null, price_max: null, area_min: null },
  price_rule: { pct: 1, abs: 1000 }, missing_before_removed: 2,
}
export async function loadSettings(s) {
  const r = await s.from('inv_settings').select('key,value')
  if (r.error && !/relation .* does not exist|schema cache/i.test(r.error.message)) throw new Error('nastavenia: ' + r.error.message)
  const rows = (r.data || [])   // pred aplikovaním migrácie sa použijú predvolené nastavenia
  const by = Object.fromEntries(rows.map((r) => [r.key, r.value || {}]))
  const agent = { ...DEFAULT_AGENT, ...(by.agent || {}), filters: { ...DEFAULT_AGENT.filters, ...((by.agent || {}).filters || {}) } }
  return { calc: by.calc || {}, freshness: { ...DEFAULT_FRESHNESS, ...(by.freshness || {}) }, agent }
}
async function event(s, { property_id = null, inquiry_id = null, type, payload = {}, user = null }) {
  const r = await s.from('inv_events').insert({ property_id, inquiry_id, type, payload, user_email: user })
  if (r.error) log('event', r.error.message)
}

/* ---------------- filtre agenta (všeobecný režim) ---------------- */
export function passesFilters(n, f = {}) {
  const has = (v) => Array.isArray(v) && v.length
  if (has(f.cities) && n.city && !f.cities.map(fold).includes(fold(n.city))) return false
  if (has(f.types) && n.type && !f.types.map(fold).includes(fold(n.type))) return false
  if (has(f.rooms) && n.rooms != null && !f.rooms.map(Number).includes(n.rooms)) return false
  if (toNum(f.price_min) != null && n.price != null && n.price < toNum(f.price_min)) return false
  if (toNum(f.price_max) != null && n.price != null && n.price > toNum(f.price_max)) return false
  if (toNum(f.area_min) != null && n.area_interior != null && n.area_interior < toNum(f.area_min)) return false
  return true
}
/** Cielený režim: inzerát stojí za uloženie, ak aspoň jeden aktívny dopyt nemá proti nemu zjavný povinný rozpor (mesto, typ, dispozícia, limit ceny). */
export function relevantToInquiry(n, q) {
  const has = (v) => Array.isArray(v) && v.length
  if (has(q.cities) && n.city && !q.cities.map(fold).includes(fold(n.city))) return false
  if (has(q.types) && n.type && !q.types.map(fold).includes(fold(n.type))) return false
  if (has(q.rooms) && n.rooms != null && !q.rooms.map(Number).includes(n.rooms)) return false
  const cap = toNum(q.price_cap) ?? (q.budget_kind === 'total' ? toNum(q.budget_total) : null)
  if (cap != null && n.price != null && n.price > cap) return false
  return true
}

/* ---------------- nehnuteľnosť: zlúčenie polí podľa pôvodu ---------------- */
const SOURCE_FIELDS = ['title', 'city', 'district', 'address', 'lat', 'lon', 'type', 'rooms', 'bedrooms', 'floor', 'area_interior', 'area_exterior', 'price', 'condition', 'parking', 'parking_mandatory', 'parking_in_price', 'parking_price', 'commission_in_price', 'commission_pct', 'seller']
async function resolveProperty(s, id) {
  let cur = id
  for (let i = 0; i < 6; i++) {
    const p = must(await s.from('inv_properties').select('*').eq('id', cur).maybeSingle(), 'nehnuteľnosť')
    if (!p) return null
    if (!p.merged_into) return p
    cur = p.merged_into
  }
  return null
}
const SAME = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b)
/** Z inzerátu prevezme len to, čo je ručne nepotvrdené; neznáme (null) nikdy neprepíše známe. */
function patchFromListing(p, n, refKey, at) {
  const patch = {}, prov = { ...(p.prov || {}) }
  for (const f of SOURCE_FIELDS) {
    const v = n[f]
    if (v === null || v === undefined) continue
    if ((prov[f] || {}).kind === 'manual') continue
    if (!SAME(p[f], v)) { patch[f] = v; prov[f] = { kind: 'source', ref: refKey, at } }
    else if (!prov[f]) prov[f] = { kind: 'source', ref: refKey, at }
  }
  const feat = { ...(p.features || {}) }
  for (const [k, v] of Object.entries(n.features || {})) if (typeof v === 'boolean' && (feat[k] == null || (prov['features.' + k] || {}).kind !== 'manual')) feat[k] = v
  if (JSON.stringify(feat) !== JSON.stringify(p.features || {})) patch.features = feat
  const eq = [...new Set([...(p.equipment || []), ...(n.equipment || [])])].slice(0, 40)
  if (eq.length !== (p.equipment || []).length) patch.equipment = eq
  if (n.prov) for (const [k, v] of Object.entries(n.prov)) if (v && ['source', 'assumption'].includes(v.kind) && (prov[k] || {}).kind !== 'manual') prov[k] = { kind: v.kind, ref: v.ref || refKey, at: v.at || at }
  patch.prov = prov
  return patch
}

/**
 * Uloží alebo aktualizuje inzerát (idempotentne podľa zdroj + identifikátor), skontroluje duplicity naprieč portálmi,
 * zapíše históriu ceny a prepočíta výpočet. Nikdy nemaže: odstránený inzerát len označí.
 */
export async function ingestListing(s, raw, ctx = {}) {
  const n = normalizeListing(raw)
  const errs = validateListing(n)
  if (errs.length) return { ok: false, error: errs.join(' ') }
  const now = ctx.now ? iso(ctx.now) : iso()
  const checkedAt = n.checked_at || now
  const settings = ctx.settings || (await loadSettings(s))
  const refKey = `${n.source_key}:${n.external_id}`
  const out = { ok: true, created: false, merged: false, suggested: null, price: { changed: false }, status_changed: null, removed: false }

  let lst = must(await s.from('inv_listings').select('*').eq('source_key', n.source_key).eq('external_id', n.external_id).maybeSingle(), 'inzerát')
  let prop = lst ? await resolveProperty(s, lst.property_id) : null

  if (!lst) {
    const cands = (must(await s.from('inv_properties').select('id,city,district,address,area_interior,rooms,floor,price,lat,lon,status').is('merged_into', null), 'kandidáti') || []).filter((p) => !n.city || !p.city || fold(p.city) === fold(n.city))
    const d = dedupeDecision(n, cands)
    if (d.action === 'merge') { prop = await resolveProperty(s, d.id); out.merged = true; out.merge = { score: d.score, reasons: d.reasons } }
    else {
      const initial = { status: n.listing_state === 'removed' ? 'withdrawn' : 'new', created_by: ctx.actor || ctx.via || 'agent', prov: {}, first_seen_at: now }
      const fields = {}
      for (const f of SOURCE_FIELDS) if (n[f] != null) fields[f] = n[f]
      Object.assign(initial, fields, { features: n.features || {}, equipment: n.equipment || [], last_checked_at: checkedAt })
      const pr = { ...initial.prov }
      for (const f of Object.keys(fields)) pr[f] = { kind: 'source', ref: refKey, at: checkedAt }
      initial.prov = pr
      const ins = await s.from('inv_properties').insert(initial).select('*').single()
      prop = must(ins, 'nová nehnuteľnosť')
      out.created = true
      await s.from('inv_price_history').insert({ property_id: prop.id, price: n.price, source: n.source_key, at: checkedAt })
      await event(s, { property_id: prop.id, type: 'created', payload: { source: n.source_key, via: ctx.via || 'agent', price: n.price }, user: ctx.actor })
      if (d.action === 'suggest') {
        const [a, b] = [d.id, prop.id].sort()
        const r = await s.from('inv_merge_candidates').insert({ property_a: a, property_b: b, score: d.score, reasons: d.reasons })
        if (r.error && r.error.code !== '23505') throw new Error('kandidát na zlúčenie: ' + r.error.message)
        out.suggested = { with: d.id, score: d.score, reasons: d.reasons }
        await event(s, { property_id: prop.id, type: 'merge_suggested', payload: { with: d.id, score: d.score, reasons: d.reasons } })
      }
    }
    const li = await s.from('inv_listings').insert({ property_id: prop.id, source_key: n.source_key, external_id: n.external_id, url: n.url, title: n.title, state: n.listing_state, price: n.price, last_seen_at: n.listing_state === 'active' ? checkedAt : null, last_checked_at: checkedAt, raw: ctx.keepRaw === false ? null : raw })
    if (li.error) {
      if (li.error.code === '23505') {   // súbežný import toho istého inzerátu: druhý beh ho už nájde; vlastný novovytvorený záznam sa odstráni, aby nezostal sirotou
        if (out.created) { await s.from('inv_price_history').delete().eq('property_id', prop.id); await s.from('inv_events').delete().eq('property_id', prop.id); await s.from('inv_properties').delete().eq('id', prop.id) }
        return ingestListing(s, raw, { ...ctx, settings })
      }
      throw new Error('inzerát: ' + li.error.message)
    }
    lst = must(await s.from('inv_listings').select('*').eq('source_key', n.source_key).eq('external_id', n.external_id).single(), 'inzerát')
    if (out.merged) await event(s, { property_id: prop.id, type: 'listing_added', payload: { source: n.source_key, url: n.url, score: out.merge.score } })
  }
  if (!prop) throw new Error('nehnuteľnosť inzerátu sa nenašla')

  // --- aktualizácia existujúceho záznamu ---
  const patch = patchFromListing(prop, n, refKey, checkedAt)
  const attachedNow = out.merged && !out.created
  if (attachedNow && patch.price != null) {   // cena z iného portálu pri prvom pripojení sa len zaznamená, nepovažuje sa za zmenu ceny
    if (patch.price !== prop.price) await event(s, { property_id: prop.id, type: 'price_differs', payload: { existing: prop.price, other: patch.price, source: n.source_key } })
    delete patch.price
    if (patch.prov) patch.prov = { ...patch.prov, price: (prop.prov || {}).price }
  }
  const rule = (settings.agent && settings.agent.price_rule) || undefined
  if (!out.created && !attachedNow) {
    const pc = priceChange(prop.price, n.price != null ? n.price : prop.price, rule)
    out.price = pc
    if (pc.changed && patch.price != null) {
      await s.from('inv_price_history').insert({ property_id: prop.id, listing_id: lst.id, price: n.price, source: n.source_key, at: checkedAt })
      await event(s, { property_id: prop.id, type: 'price_change', payload: { from: prop.price, to: n.price, delta: pc.delta, pct: Math.round(pc.pct * 10) / 10, significant: pc.significant, source: n.source_key } })
    }
  }
  const lPatch = { url: n.url || lst.url, title: n.title || lst.title, price: n.price != null ? n.price : lst.price, last_checked_at: checkedAt, raw: ctx.keepRaw === false ? lst.raw : raw }
  if (n.listing_state === 'active') { lPatch.state = 'active'; lPatch.missing_checks = 0; lPatch.last_seen_at = checkedAt } else { lPatch.state = 'removed'; out.removed = true }
  await s.from('inv_listings').update(lPatch).eq('id', lst.id)
  patch.last_checked_at = checkedAt > (prop.last_checked_at || '') ? checkedAt : prop.last_checked_at
  // stav: inzerát je opäť na portáli → aktívny (len z „stiahnuté“ alebo „neznáme“); stiahnutie rieši refreshWithdrawn
  if (n.listing_state === 'active' && ['withdrawn', 'unknown'].includes(prop.status)) { patch.status = 'active'; out.status_changed = { from: prop.status, to: 'active' } }
  const upd = await s.from('inv_properties').update(patch).eq('id', prop.id)
  if (upd.error) throw new Error('aktualizácia nehnuteľnosti: ' + upd.error.message)
  if (out.status_changed) await event(s, { property_id: prop.id, type: 'status', payload: { ...out.status_changed, reason: 'inzerát je opäť na portáli' } })
  if (n.listing_state === 'removed') await refreshWithdrawn(s, prop.id, { immediate: true })
  const calc = await recalcProperty(s, prop.id, settings)
  return { ...out, property_id: prop.id, listing_id: lst.id, calc_id: calc.id, calc_changed: calc.changed }
}

/** Ak nezostal žiadny aktívny inzerát, nehnuteľnosť je „stiahnutá“ (nie „predaná“). Pri rezervovanej/predanej sa stav nemení. */
export async function refreshWithdrawn(s, propertyId, { immediate = false } = {}) {
  const ls = must(await s.from('inv_listings').select('id,state').eq('property_id', propertyId), 'inzeráty') || []
  const p = await resolveProperty(s, propertyId)
  if (!p || !ls.length || ls.some((l) => l.state === 'active')) return false
  if (UNAVAILABLE.includes(p.status)) return false
  await s.from('inv_properties').update({ status: 'withdrawn' }).eq('id', p.id)
  await event(s, { property_id: p.id, type: 'status', payload: { from: p.status, to: 'withdrawn', reason: 'všetky inzeráty zmizli z portálu (to neznamená predané)' } })
  return true
}

/**
 * Po úspešnom a ÚPLNOM prehľadaní zdroja: inzeráty, ktoré tam už nie sú, dostanú „chýba“; až po `missing_before_removed` po sebe idúcich kontrolách sa označia ako odstránené.
 * Volá sa výhradne po úspešnom behu zdroja. Pri výpadku, blokovaní alebo čiastočnom načítaní sa nevolá (výpadok nesmie z bytov spraviť predané).
 */
export async function markMissing(s, sourceKey, seenIds, { complete, ok, threshold = 2, now } = {}) {
  if (!ok || !complete) return { skipped: true, reason: !ok ? 'zdroj zlyhal' : 'prehľadanie nebolo úplné', removed: 0, missing: 0 }
  const seen = new Set(seenIds.map(String))
  const ls = must(await s.from('inv_listings').select('id,property_id,external_id,missing_checks').eq('source_key', sourceKey).eq('state', 'active'), 'inzeráty zdroja') || []
  let removed = 0, missing = 0
  const touched = new Set()
  for (const l of ls) {
    if (seen.has(String(l.external_id))) continue
    missing++
    const m = (l.missing_checks || 0) + 1
    if (m >= threshold) { await s.from('inv_listings').update({ state: 'removed', missing_checks: m, last_checked_at: now ? iso(now) : iso() }).eq('id', l.id); removed++; touched.add(l.property_id) }
    else await s.from('inv_listings').update({ missing_checks: m, last_checked_at: now ? iso(now) : iso() }).eq('id', l.id)
  }
  const withdrawn = []
  for (const pid of touched) if (await refreshWithdrawn(s, pid)) withdrawn.push(pid)
  return { skipped: false, removed, missing, withdrawn }
}

/** Nová verzia výpočtu len ak sa zmenili vstupy (odtlačok). Staré verzie ostávajú, ponuky si držia svoj snímok. */
export async function recalcProperty(s, propertyId, settings) {
  const st = settings || (await loadSettings(s))
  const p = await resolveProperty(s, propertyId)
  if (!p) throw new Error('nehnuteľnosť neexistuje')
  const calc = computeInvestment(p, null, st.calc)
  const last = must(await s.from('inv_calcs').select('id,version,input_hash').eq('property_id', p.id).order('version', { ascending: false }).limit(1), 'výpočty') || []
  if (last[0] && last[0].input_hash === calc.hash) { if (p.calc_id !== last[0].id) await s.from('inv_properties').update({ calc_id: last[0].id }).eq('id', p.id); return { id: last[0].id, version: last[0].version, changed: false, calc } }
  const version = (last[0] ? last[0].version : 0) + 1
  const ins = await s.from('inv_calcs').insert({ property_id: p.id, version, input_hash: calc.hash, calc_version: CALC_VERSION, result: calc, quality_score: calc.quality.score, quality_level: calc.quality.level }).select('id').single()
  if (ins.error) {
    if (ins.error.code === '23505') return recalcProperty(s, propertyId, st)
    throw new Error('výpočet: ' + ins.error.message)
  }
  await s.from('inv_properties').update({ calc_id: ins.data.id }).eq('id', p.id)
  if (last[0]) await event(s, { property_id: p.id, type: 'calc_version', payload: { version, previous: last[0].version, yield_base: calc.metrics.base ? Math.round(calc.metrics.base.yield_total_pct * 100) / 100 : null } })
  return { id: ins.data.id, version, changed: true, calc }
}

/* ---------------- párovanie ---------------- */
const REL_PRICE_DROP = 0.03
async function loadCalcs(s, props) {
  const ids = props.map((p) => p.calc_id).filter(Boolean)
  if (!ids.length) return {}
  const rows = must(await s.from('inv_calcs').select('id,result').in('id', ids), 'výpočty') || []
  return Object.fromEntries(rows.map((r) => [r.id, r.result]))
}
function pairCalc(property, calcResult, inquiry, settings) {
  // úver klienta mení cashflow a vlastné zdroje: výpočet pre dvojicu (verzie výpočtu nehnuteľnosti ostávajú bez úveru)
  const loan = toNum(inquiry.loan_planned)
  if (loan && loan > 0) return computeInvestment(property, { loan }, settings.calc)
  return calcResult
}
async function syncPair(s, { inquiry, property, calcResult, existing, settings, now }) {
  const calc = pairCalc(property, calcResult, inquiry, settings)
  const m = evaluateMatch({ inquiry, property, calc, thresholds: (settings.calc || {}).thresholds || null, now, freshCfg: settings.freshness })
  const sig = matchSignature(m, property)
  const result = { ...m, price: property.price, status: property.status, total: calc ? calc.investment.known_total : null, financing: calc ? calc.financing : null, calc_hash: calc ? calc.hash : null, metrics_base: calc && calc.metrics ? (calc.metrics.base || calc.metrics.ltr || null) : null, quality: calc ? calc.quality : null }
  if (!existing) {
    if (m.category === 'unavailable') return { action: 'skip' }   // nedostupné nehnuteľnosti, ktoré klient nikdy nemal, nezapisujeme
    const ins = await s.from('inv_matches').insert({ inquiry_id: inquiry.id, property_id: property.id, category: m.category, score: m.score, result, calc_id: property.calc_id, signature: sig })
    if (ins.error) { if (ins.error.code === '23505') return { action: 'skip' }; throw new Error('zhoda: ' + ins.error.message) }
    await event(s, { property_id: property.id, inquiry_id: inquiry.id, type: 'match_new', payload: { category: m.category, score: m.score } })
    return { action: 'created', category: m.category }
  }
  if (existing.signature === sig && existing.score === m.score && existing.category === m.category && (existing.result || {}).calc_hash === result.calc_hash) return { action: 'same' }   // zmena vstupov alebo nastavení (napr. sadzba hypotéky) obnoví detail zhody
  const patch = { category: m.category, score: m.score, result, calc_id: property.calc_id, signature: sig }
  // Zuzkino rozhodnutie sa zachová; významná zmena zamietnutej ponuky ju len navrhne na opätovné posúdenie
  if (existing.decision === 'rejected') {
    const prev = existing.result || {}
    const dropped = prev.price && property.price && (prev.price - property.price) / prev.price >= REL_PRICE_DROP
    if (m.category === 'match' && (existing.category !== 'match' || dropped)) { patch.needs_review = true; patch.review_reason = dropped ? `Cena klesla z ${prev.price} na ${property.price} €` : 'Ponuka teraz spĺňa podmienky dopytu' }
  }
  await s.from('inv_matches').update(patch).eq('id', existing.id)
  await event(s, { property_id: property.id, inquiry_id: inquiry.id, type: 'match_changed', payload: { from: existing.category, to: m.category, score: m.score } })
  return { action: 'updated', category: m.category }
}
export async function matchInquiry(s, inquiryId, ctx = {}) {
  const settings = ctx.settings || (await loadSettings(s))
  const q = must(await s.from('inv_inquiries').select('*').eq('id', inquiryId).maybeSingle(), 'dopyt')
  if (!q) return { ok: false, error: 'Dopyt neexistuje.' }
  const stats = { created: 0, updated: 0, same: 0, skip: 0 }
  if (!ACTIVE_INQ.includes(q.status)) return { ok: true, stats, inactive: true }
  const props = must(await s.from('inv_properties').select('*').is('merged_into', null), 'nehnuteľnosti') || []
  const calcs = await loadCalcs(s, props)
  const ex = must(await s.from('inv_matches').select('*').eq('inquiry_id', q.id), 'zhody') || []
  const exBy = Object.fromEntries(ex.map((e) => [e.property_id, e]))
  for (const p of props) {
    const r = await syncPair(s, { inquiry: q, property: p, calcResult: calcs[p.calc_id] || null, existing: exBy[p.id], settings, now: ctx.now || Date.now() })
    stats[r.action === 'created' ? 'created' : r.action === 'updated' ? 'updated' : r.action === 'same' ? 'same' : 'skip']++
  }
  return { ok: true, stats }
}
export async function matchProperty(s, propertyId, ctx = {}) {
  const settings = ctx.settings || (await loadSettings(s))
  const p = await resolveProperty(s, propertyId)
  if (!p) return { ok: false, error: 'Nehnuteľnosť neexistuje.' }
  const inqs = must(await s.from('inv_inquiries').select('*').in('status', ACTIVE_INQ), 'dopyty') || []
  const calcs = await loadCalcs(s, [p])
  const ex = must(await s.from('inv_matches').select('*').eq('property_id', p.id), 'zhody') || []
  const exBy = Object.fromEntries(ex.map((e) => [e.inquiry_id, e]))
  const stats = { created: 0, updated: 0, same: 0, skip: 0 }
  for (const q of inqs) {
    const r = await syncPair(s, { inquiry: q, property: p, calcResult: calcs[p.calc_id] || null, existing: exBy[q.id], settings, now: ctx.now || Date.now() })
    stats[r.action === 'created' ? 'created' : r.action === 'updated' ? 'updated' : r.action === 'same' ? 'same' : 'skip']++
  }
  // dopyty, ktoré sa stali neaktívnymi, sa neprepočítavajú; ich zhody ostávajú v histórii
  return { ok: true, stats }
}

/* ---------------- upozornenia (jeden prehľad na osobu, bez opakovania) ---------------- */
const DEFAULT_OWNER = 'zuzana@live-in.international'
const LINES = { new: 'nová zhoda', changed: 'zmena', unavailable: 'už nie je dostupná', review: 'na opätovné posúdenie' }
/** Vytvorí jednu notifikáciu na zodpovednú osobu so všetkými novými a významne zmenenými zhodami; každú zmenu oznámi len raz (podľa podpisu). */
export async function notifyDigest(s, { now, silent = false, only = null } = {}) {
  const ms = must(await s.from('inv_matches').select('*').neq('decision', 'rejected'), 'zhody') || []
  const rej = must(await s.from('inv_matches').select('*').eq('decision', 'rejected').eq('needs_review', true), 'zhody na posúdenie') || []
  const all = [...ms, ...rej].filter((m) => !only || only.includes(m.inquiry_id))   // `silent`: len označí zmeny ako oznámené (ukážkové dáta nikoho neobťažujú)
  if (!all.length) return { sent: 0, owners: 0 }
  const inqs = Object.fromEntries((must(await s.from('inv_inquiries').select('*').in('id', [...new Set(all.map((m) => m.inquiry_id))]), 'dopyty') || []).map((q) => [q.id, q]))
  const props = Object.fromEntries((must(await s.from('inv_properties').select('id,city,district,address,price,status').in('id', [...new Set(all.map((m) => m.property_id))]), 'nehnuteľnosti') || []).map((p) => [p.id, p]))
  const leads = Object.fromEntries((must(await s.from('leads').select('id,name,assigned_to').in('id', [...new Set(Object.values(inqs).map((q) => q.lead_id))]), 'leady') || []).map((l) => [l.id, l]))
  const byOwner = {}
  const mark = []
  for (const m of all) {
    const q = inqs[m.inquiry_id], p = props[m.property_id]
    if (!q || !p || !ACTIVE_INQ.includes(q.status)) continue
    let kind = null, key = null
    const prevCat = (m.notified_signature || '').split('|')[0]
    if (m.needs_review && m.decision === 'rejected') { kind = 'review'; key = 'review|' + m.signature }
    else if (m.category === 'match') { key = 'match|' + m.signature; if (m.notified_signature !== key) kind = m.notified_signature ? 'changed' : 'new' }
    else if (m.category === 'unavailable' && (prevCat === 'match' || ['review', 'shortlist', 'viewing', 'offer'].includes(m.decision))) { key = 'unavailable|' + p.status; if (m.notified_signature !== key) kind = 'unavailable' }
    if (!kind) continue
    const owner = (q.owner_email || (leads[q.lead_id] && leads[q.lead_id].assigned_to) || DEFAULT_OWNER).toLowerCase()
    ;(byOwner[owner] = byOwner[owner] || []).push({ kind, m, q, p, lead: leads[q.lead_id] })
    mark.push({ id: m.id, key })
  }
  let sent = 0
  if (!silent) for (const [owner, rows] of Object.entries(byOwner)) {
    const counts = {}
    for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1
    const title = 'Investície: ' + Object.entries(counts).map(([k, n]) => `${n}× ${LINES[k]}`).join(', ')
    const body = rows.slice(0, 5).map((r) => `${(r.lead && r.lead.name) || 'Klient'}: ${[r.p.address || r.p.district, r.p.city].filter(Boolean).join(', ')}${r.p.price ? ` – ${Math.round(r.p.price).toLocaleString('sk-SK').replace(/ | /g, ' ')} €` : ''} (${LINES[r.kind]})`).join('\n') + (rows.length > 5 ? `\n… a ${rows.length - 5} ďalších` : '')
    const first = rows[0]
    const n = await s.from('notifications').insert({ user_email: owner, lead_id: first.q.lead_id, kind: 'inv_match', title, body, url: '/investicie/prehlad' })
    if (n.error) { log('notify', n.error.message); continue }
    sent++
  }
  // podpis sa uloží až po úspešnom vytvorení notifikácií, takže sa nič nestratí ani nezopakuje
  for (const x of mark) await s.from('inv_matches').update({ notified_signature: x.key, notified_at: now ? iso(now) : iso() }).eq('id', x.id)
  return { sent, owners: Object.keys(byOwner).length, matches: mark.length }
}

/* ---------------- ručné úpravy Zuzkou ---------------- */
export const EDITABLE = ['title', 'city', 'district', 'address', 'type', 'rooms', 'bedrooms', 'floor', 'area_interior', 'area_exterior', 'price', 'condition', 'parking', 'parking_mandatory', 'parking_in_price', 'parking_price', 'commission_in_price', 'commission_pct', 'commission_amount', 'legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed', 'standard', 'zone', 'rental_mode', 'seller', 'notes_internal', 'next_task', 'next_task_due', 'next_task_owner', 'availability_note']
const BOOLS = new Set(['parking_mandatory', 'parking_in_price', 'commission_in_price'])
const NUMS = new Set(['rooms', 'bedrooms', 'floor', 'area_interior', 'area_exterior', 'price', 'parking_price', 'commission_pct', 'commission_amount', 'legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed'])
const COST_FIELDS = new Set(['parking_price', 'commission_pct', 'commission_amount', 'legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed', 'price', 'area_interior'])
/** Overí a vyčistí ručnú úpravu: prázdne = neznáme (null), nikdy nula; čísla sa kontrolujú. */
export function cleanPropertyPatch(raw = {}) {
  const patch = {}
  for (const k of EDITABLE) {
    if (!(k in raw)) continue
    let v = raw[k]
    if (BOOLS.has(k)) { patch[k] = v === true || v === 'true' ? true : v === false || v === 'false' ? false : null; continue }
    if (NUMS.has(k)) {
      if (v === '' || v === null || v === undefined) { patch[k] = null; continue }
      const n = toNum(v)
      if (n == null) return { error: `Pole „${k}“ nie je číslo.` }
      if (n < 0 || n > 1e9) return { error: `Pole „${k}“ je mimo rozsahu.` }
      if ((k === 'price' || k === 'area_interior') && n === 0) return { error: `Pole „${k}“ nesmie byť nula (nechajte prázdne, ak je neznáme).` }
      patch[k] = n; continue
    }
    v = String(v ?? '').trim()
    if (k === 'type' && v && !['byt', 'dom'].includes(v)) return { error: 'Typ musí byť byt alebo dom.' }
    if (k === 'rental_mode' && !['str', 'ltr', 'compare'].includes(v)) return { error: 'Neplatný spôsob prenájmu.' }
    if (k === 'next_task_due' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'Termín úlohy musí byť RRRR-MM-DD.' }
    patch[k] = v ? v.slice(0, k === 'notes_internal' ? 4000 : 300) : (k === 'rental_mode' ? 'compare' : null)
  }
  if ('rental' in raw && raw.rental && typeof raw.rental === 'object') {
    const r = {}
    for (const k of ['adr', 'occupancy', 'own_nights', 'stay', 'clean', 'clean_paid', 'portal_pct', 'ltr_rent', 'ltr_vacancy_pct', 'ltr_management_pct', 'ltr_owner_costs']) {
      const x = raw.rental[k]
      if (x === '' || x == null) continue
      const n = toNum(x)
      if (n == null || n < 0) return { error: `Pole prenájmu „${k}“ nie je platné číslo.` }
      if (k === 'occupancy' && n > 100) return { error: 'Obsadenosť je najviac 100 %.' }
      r[k] = n
    }
    patch.rental = r
  }
  return { patch }
}
/** Ručná úprava: polia sa označia ako „ručne potvrdené“, výpočet sa prepočíta (nová verzia) a zhody sa obnovia. */
export async function updateProperty(s, id, raw, who) {
  const c = cleanPropertyPatch(raw)
  if (c.error) return { ok: false, error: c.error }
  const p = await resolveProperty(s, id)
  if (!p) return { ok: false, error: 'Nehnuteľnosť neexistuje.' }
  const prov = { ...(p.prov || {}) }, at = iso()
  const changed = []
  for (const [k, v] of Object.entries(c.patch)) {
    if (k === 'rental') { if (JSON.stringify(v) !== JSON.stringify(p.rental || {})) { changed.push(k); for (const x of Object.keys(v)) prov['rental.' + x] = { kind: 'manual', by: who, at } } continue }
    if (!SAME(p[k], v) && !(p[k] == null && v == null)) { changed.push(k); if (COST_FIELDS.has(k) || BOOLS.has(k) || ['address', 'city', 'district', 'rooms', 'condition'].includes(k)) prov[k] = { kind: 'manual', by: who, at } }
  }
  if (!changed.length) return { ok: true, unchanged: true }
  const patch = { ...c.patch, prov }
  const u = await s.from('inv_properties').update(patch).eq('id', p.id)
  if (u.error) return { ok: false, error: u.error.message }
  if ('price' in c.patch && c.patch.price !== p.price) { await s.from('inv_price_history').insert({ property_id: p.id, price: c.patch.price, source: 'ručne' }); }
  await event(s, { property_id: p.id, type: 'edited', payload: { fields: changed }, user: who })
  const calc = await recalcProperty(s, p.id)
  const m = await matchProperty(s, p.id)
  return { ok: true, changed, calc_changed: calc.changed, matches: m.stats }
}
export async function setPropertyStatus(s, id, status, who, { note = '', confirmed = false } = {}) {
  if (!PROP_STATUS_IDS.includes(status)) return { ok: false, error: 'Neplatný stav.' }
  const p = await resolveProperty(s, id)
  if (!p) return { ok: false, error: 'Nehnuteľnosť neexistuje.' }
  const patch = { status, availability_note: note ? String(note).slice(0, 300) : p.availability_note }
  if (status === 'confirmed' || confirmed) { patch.last_confirmed_at = iso(); patch.last_confirmed_by = who; patch.status = status === 'confirmed' ? 'confirmed' : status }
  const u = await s.from('inv_properties').update(patch).eq('id', p.id)
  if (u.error) return { ok: false, error: u.error.message }
  await event(s, { property_id: p.id, type: 'status', payload: { from: p.status, to: status, note: note || undefined, manual: true }, user: who })
  const m = await matchProperty(s, p.id)
  return { ok: true, matches: m.stats }
}
export async function mergeProperties(s, keepId, dropId, who) {
  if (keepId === dropId) return { ok: false, error: 'Nedá sa zlúčiť s tou istou nehnuteľnosťou.' }
  const keep = await resolveProperty(s, keepId), drop = await resolveProperty(s, dropId)
  if (!keep || !drop) return { ok: false, error: 'Nehnuteľnosť neexistuje.' }
  await s.from('inv_listings').update({ property_id: keep.id }).eq('property_id', drop.id)
  await s.from('inv_price_history').update({ property_id: keep.id }).eq('property_id', drop.id)
  const km = must(await s.from('inv_matches').select('inquiry_id').eq('property_id', keep.id), 'zhody') || []
  const have = new Set(km.map((x) => x.inquiry_id))
  const dm = must(await s.from('inv_matches').select('id,inquiry_id').eq('property_id', drop.id), 'zhody') || []
  for (const m of dm) { if (have.has(m.inquiry_id)) await s.from('inv_matches').delete().eq('id', m.id); else await s.from('inv_matches').update({ property_id: keep.id }).eq('id', m.id) }
  const fill = {}
  for (const k of ['title', 'district', 'address', 'lat', 'lon', 'type', 'rooms', 'bedrooms', 'floor', 'area_interior', 'area_exterior', 'condition', 'parking', 'seller', 'legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed']) if (keep[k] == null && drop[k] != null) fill[k] = drop[k]
  if (Object.keys(fill).length) await s.from('inv_properties').update(fill).eq('id', keep.id)
  await s.from('inv_properties').update({ merged_into: keep.id }).eq('id', drop.id)
  const [a, b] = [keep.id, drop.id].sort()
  await s.from('inv_merge_candidates').update({ status: 'merged', decided_by: who, decided_at: iso() }).eq('property_a', a).eq('property_b', b)
  await event(s, { property_id: keep.id, type: 'merged', payload: { from: drop.id }, user: who })
  await recalcProperty(s, keep.id)
  await matchProperty(s, keep.id)
  return { ok: true, keep: keep.id }
}
export async function dismissMerge(s, candidateId, who) {
  const r = await s.from('inv_merge_candidates').update({ status: 'dismissed', decided_by: who, decided_at: iso() }).eq('id', candidateId)
  return r.error ? { ok: false, error: r.error.message } : { ok: true }
}
/** Zuzkino rozhodnutie o zhode: kandidát, obhliadka, ponuka, zamietnutie (dôvod je povinný). */
export async function decideMatch(s, matchId, decision, who, { reason = '', viewing_at = null, note = '' } = {}) {
  if (!['open', 'review', 'shortlist', 'viewing', 'offer', 'rejected'].includes(decision)) return { ok: false, error: 'Neplatné rozhodnutie.' }
  if (decision === 'rejected' && !String(reason).trim()) return { ok: false, error: 'Pri zamietnutí je dôvod povinný.' }
  const m = must(await s.from('inv_matches').select('*').eq('id', matchId).maybeSingle(), 'zhoda')
  if (!m) return { ok: false, error: 'Zhoda neexistuje.' }
  const patch = { decision, decided_by: who, decided_at: iso(), decision_reason: reason ? String(reason).slice(0, 500) : decision === 'rejected' ? null : m.decision_reason, needs_review: decision === 'rejected' ? false : m.needs_review, review_reason: decision === 'rejected' ? null : m.review_reason }
  if (viewing_at) { if (!Number.isFinite(Date.parse(viewing_at))) return { ok: false, error: 'Neplatný dátum obhliadky.' }; patch.viewing_at = iso(viewing_at) }
  if (note) patch.viewing_note = String(note).slice(0, 500)
  const u = await s.from('inv_matches').update(patch).eq('id', matchId)
  if (u.error) return { ok: false, error: u.error.message }
  await event(s, { property_id: m.property_id, inquiry_id: m.inquiry_id, type: 'decision', payload: { from: m.decision, to: decision, reason: reason || undefined, viewing_at: patch.viewing_at }, user: who })
  return { ok: true }
}
/** Predajca potvrdil dostupnosť: dátum a kto; stav „dostupnosť potvrdená predajcom“ (nie len „inzerát existuje“). */
export async function confirmAvailability(s, propertyId, who, { viewingPossible = null, note = '' } = {}) {
  const r = await setPropertyStatus(s, propertyId, 'confirmed', who, { note: [note, viewingPossible === true ? 'obhliadka možná' : viewingPossible === false ? 'obhliadka zatiaľ nie je možná' : ''].filter(Boolean).join(' · '), confirmed: true })
  return r
}
export async function createTask(s, t, who) {
  const title = String(t.title || '').trim().slice(0, 200)
  if (!title) return { ok: false, error: 'Úloha musí mať názov.' }
  if (t.due && !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) return { ok: false, error: 'Termín musí byť RRRR-MM-DD.' }
  const r = await s.from('inv_tasks').insert({ property_id: t.property_id || null, inquiry_id: t.inquiry_id || null, match_id: t.match_id || null, title, due: t.due || null, owner_email: t.owner_email || who, created_by: who }).select('*').single()
  return r.error ? { ok: false, error: r.error.message } : { ok: true, task: r.data }
}
export { DEFAULT_CALC_SETTINGS }
