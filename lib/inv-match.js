// Párovanie dopytov s nehnuteľnosťami: najprv povinné podmienky, potom poradie podľa preferencií a ekonomiky.
// Prekročený rozpočet sa nikdy neschová do skóre: nehnuteľnosť mimo podmienok je samostatná kategória „outside“.
import { fold, FEATURE_LABELS, isRecommendable, UNAVAILABLE, toNum, freshness } from './inv-core.js'
import { evaluateThresholds, isNum } from './inv-calc.js'

const has = (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
const list = (v) => (Array.isArray(v) ? v : [])
const eur = (v) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`

/** Rozpočet: celková investícia a (osobitne) potrebné vlastné zdroje. Neznáme náklady sa neberú ako nula. */
export function budgetCheck(inq, calc, extra = {}) {
  const total = calc && calc.investment ? calc.investment.known_total : null
  const unknown = calc && calc.investment ? calc.investment.unknown.map((u) => u.label) : []
  const kind = inq.budget_kind || 'unknown'
  const loan = toNum(inq.loan_planned), equity = toNum(inq.equity), budget = toNum(inq.budget_total)
  let cap = null, capNote = null
  if (kind === 'total' && budget != null) cap = budget
  else if (kind === 'equity' && equity != null) { if (loan != null) cap = equity + loan; else if (toNum(inq.budget_total) != null) cap = null; else capNote = 'Rozpočet sú vlastné zdroje, ale nie je zadaný plánovaný úver.' }
  else if (kind === 'equity' && budget != null && equity == null) { cap = null; capNote = 'Rozpočet sú vlastné zdroje, ale suma vlastných zdrojov nie je zadaná.' }
  else capNote = kind === 'unknown' ? 'Nie je jasné, či suma v dopyte je celková investícia alebo len vlastné zdroje.' : 'Rozpočet nie je zadaný.'
  const out = { kind, total, cap, unknown, status: 'unknown', note: capNote, margin: null, over_by: null, required_equity: null, equity_status: 'unknown', price_cap_status: 'unknown' }
  if (total != null && cap != null) {
    if (total > cap) { out.status = 'over'; out.over_by = Math.round((total - cap) * 100) / 100 }
    else { out.margin = Math.round((cap - total) * 100) / 100; out.status = unknown.length ? 'unverified' : 'within' }
  }
  if (total != null && loan != null) { out.required_equity = Math.round((total - loan) * 100) / 100; if (equity != null) out.equity_status = out.required_equity <= equity ? 'ok' : 'short' }
  const priceCap = toNum(inq.price_cap), price = toNum(extra.price)
  if (priceCap != null && price != null) out.price_cap_status = price <= priceCap ? 'ok' : 'over'
  return out
}

/**
 * @returns { category: 'match' | 'outside' | 'unavailable', hard, preferences, budget, score, rank_reason, next_step, economics, fresh }
 */
export function evaluateMatch({ inquiry: q, property: p, calc, thresholds = null, now = Date.now(), freshCfg = null }) {
  const hard = [], prefs = []
  const add = (arr, key, label, state, detail = null) => arr.push({ key, label, state, detail })
  const fr = freshness(p, now, freshCfg)

  // lokalita
  const cities = list(q.cities).map(fold)
  if (cities.length) add(hard, 'city', 'Mesto', !p.city ? 'unknown' : cities.includes(fold(p.city)) ? 'pass' : 'fail', p.city || null)
  const place = fold(`${p.district || ''} ${p.address || ''}`)
  const excl = list(q.excluded_areas).map(fold).filter(Boolean)
  if (excl.length) { const hit = excl.find((e) => place.includes(e)); add(hard, 'excluded', 'Vylúčená lokalita', hit ? 'fail' : place.trim() ? 'pass' : 'unknown', hit ? `lokalita „${hit}“ je vylúčená` : null) }
  const types = list(q.types).map(fold)
  if (types.length) add(hard, 'type', 'Typ nehnuteľnosti', !p.type ? 'unknown' : types.includes(fold(p.type)) ? 'pass' : 'fail', p.type || null)
  const rooms = list(q.rooms).map(Number)
  if (rooms.length) add(hard, 'rooms', 'Dispozícia', p.rooms == null ? 'unknown' : rooms.includes(Number(p.rooms)) ? 'pass' : 'fail', p.rooms != null ? `${p.rooms}-izbový` : null)
  // výmera: len interiér, exteriér sa nezapočítava
  if (has(q.area_min) || has(q.area_max)) {
    const a = toNum(p.area_interior), lo = toNum(q.area_min), hi = toNum(q.area_max)
    const ok = a == null ? 'unknown' : (lo != null && a < lo) || (hi != null && a > hi) ? 'fail' : 'pass'
    add(hard, 'area', 'Výmera (interiér)', ok, a != null ? `${a} m²` : null)
  }
  const conds = list(q.conditions).map(fold)
  if (conds.length) add(hard, 'condition', 'Stav nehnuteľnosti', !p.condition ? 'unknown' : conds.includes(fold(p.condition)) ? 'pass' : 'fail', p.condition || null)
  // povinné vlastnosti vs. preferencie (oddelene)
  const feat = p.features || {}
  for (const [k, need] of Object.entries(q.must || {})) if (need === true) add(hard, 'must_' + k, FEATURE_LABELS[k] || k, feat[k] === true ? 'pass' : feat[k] === false ? 'fail' : 'unknown')
  for (const [k, want] of Object.entries(q.prefer || {})) if (want === true) add(prefs, 'pref_' + k, FEATURE_LABELS[k] || k, feat[k] === true ? 'pass' : feat[k] === false ? 'fail' : 'unknown')
  const areas = list(q.areas).map(fold).filter(Boolean)
  if (areas.length) add(prefs, 'pref_area', 'Preferovaná lokalita', place.trim() ? (areas.some((a) => place.includes(a)) ? 'pass' : 'fail') : 'unknown')
  // rekonštrukcia
  if (q.reno_willing === false && /rekon|zlý|pôvod/i.test(String(p.condition || ''))) add(hard, 'reno', 'Ochota rekonštruovať', 'fail', 'nehnuteľnosť vyžaduje rekonštrukciu')
  if (has(q.prep_budget) && calc) {
    const keys = ['reno', 'furnishing', 'setup', 'reserve']
    const items = calc.investment.items.filter((i) => keys.includes(i.key))
    const known = items.reduce((t, i) => t + (i.amount || 0), 0), unk = items.filter((i) => i.amount == null).length
    add(hard, 'prep', 'Rozpočet prípravy (rekonštrukcia, zariadenie, sprevádzkovanie, rezerva)', known > Number(q.prep_budget) ? 'fail' : unk ? 'unknown' : 'pass', `známe ${eur(known)} z ${eur(Number(q.prep_budget))}${unk ? `, ${unk} položky neznáme` : ''}`)
  }
  // rozpočet a cena
  const b = budgetCheck(q, calc, { price: p.price })
  if (b.price_cap_status !== 'unknown') add(hard, 'price_cap', 'Limit kúpnej ceny', b.price_cap_status === 'ok' ? 'pass' : 'fail', p.price != null ? eur(p.price) : null)
  if (calc) {
    const detail = b.status === 'over' ? `celková investícia aspoň ${eur(b.total)} presahuje rozpočet ${eur(b.cap)} o ${eur(b.over_by)}` : b.status === 'within' ? `${eur(b.total)} z ${eur(b.cap)}` : b.status === 'unverified' ? `známe náklady ${eur(b.total)} z ${eur(b.cap)}; chýba: ${b.unknown.join(', ')}` : b.note
    add(hard, 'budget', 'Celková investícia voči rozpočtu', b.status === 'over' ? 'fail' : b.status === 'within' ? 'pass' : 'unknown', detail)
    if (b.equity_status !== 'unknown') add(hard, 'equity', 'Potrebné vlastné zdroje', b.equity_status === 'ok' ? 'pass' : 'fail', `potrebné ${eur(b.required_equity)}, k dispozícii ${eur(Number(q.equity))}`)
  } else add(hard, 'budget', 'Celková investícia voči rozpočtu', 'unknown', 'výpočet ešte nie je k dispozícii')

  // ekonomika (oddelená od zhody)
  const base = calc && calc.metrics ? calc.metrics.base || calc.metrics.ltr : null
  if (has(q.target_yield_pct) && base && base.yield_total_pct != null) add(prefs, 'pref_yield', `Cieľový výnos ${q.target_yield_pct} %`, base.yield_total_pct >= Number(q.target_yield_pct) ? 'pass' : 'fail', `${base.yield_total_pct.toFixed(1).replace('.', ',')} % (základný scenár${base.provisional ? ', predbežne' : ''})`)
  if (has(q.target_cashflow_month) && base && base.cashflow_month != null) add(prefs, 'pref_cashflow', `Cieľové mesačné cashflow ${eur(Number(q.target_cashflow_month))}`, base.cashflow_month >= Number(q.target_cashflow_month) ? 'pass' : 'fail', eur(base.cashflow_month))

  const fails = hard.filter((h) => h.state === 'fail'), unknown = hard.filter((h) => h.state === 'unknown')
  let category = fails.length ? 'outside' : 'match'
  if (UNAVAILABLE.includes(p.status)) category = 'unavailable'
  else if (!isRecommendable(p.status)) category = 'unavailable'

  // poradie: preferencie 40 · ekonomika 35 · kvalita podkladov 15 · aktuálnosť 10 · odpočet za neoverené podmienky
  const pDef = prefs.length, pMet = prefs.filter((x) => x.state === 'pass').length
  const sPref = pDef ? 40 * (pMet / pDef) : 20
  const y = base && base.yield_total_pct != null ? base.yield_total_pct : null
  const yTarget = has(q.target_yield_pct) ? Number(q.target_yield_pct) : 10
  const sEco = y == null ? 0 : 35 * Math.max(0, Math.min(1, y / yTarget)) * (base.provisional ? 0.7 : 1)
  const sQual = calc ? 0.15 * calc.quality.score : 0
  const sFresh = fr.source === 'fresh' ? 10 : fr.source === 'stale' ? 5 : 0
  const score = Math.max(0, Math.min(100, Math.round(sPref + sEco + sQual + sFresh - 4 * unknown.length)))
  const eco = calc ? evaluateThresholds(calc, thresholds) : { status: 'awaiting_criteria', label: 'čaká na nastavenie kritérií', checks: [] }

  const rank_reason = category === 'match'
    ? [pDef ? `preferencie ${pMet}/${pDef}` : 'bez preferencií', y != null ? `výnos z investície ${y.toFixed(1).replace('.', ',')} % (základný scenár${base.provisional ? ', predbežne' : ''})` : 'výnos nie je možné vypočítať', calc ? `kvalita podkladov ${calc.quality.score}/100` : null, fr.label, unknown.length ? `${unknown.length} podmienok nemožno overiť` : null].filter(Boolean).join(' · ')
    : category === 'outside' ? `Mimo podmienok: ${fails.map((f) => f.label.toLowerCase()).join(', ')}` : 'Nehnuteľnosť už nie je dostupná'
  const next_step = category !== 'match' ? null
    : p.status === 'reserved' ? null
    : b.status === 'unverified' ? `Doplniť chýbajúce náklady (${b.unknown.slice(0, 4).join(', ')}) a znovu overiť rozpočet`
    : !fr.ok || fr.source === 'never' ? 'Skontrolovať zdroj inzerátu'
    : p.status !== 'confirmed' ? 'Overiť dostupnosť u predajcu a možnosť obhliadky'
    : 'Dohodnúť obhliadku'
  return { category, hard, preferences: prefs, budget: b, score, rank_reason, next_step, economics: { status: eco.status, label: eco.label }, fresh: { source: fr.source, seller: fr.seller, label: fr.label, seller_label: fr.seller_label }, unknown_count: unknown.length, fail_count: fails.length }
}

/** Zoradenie zhôd: najprv kategória (zhody, potom mimo podmienok), v rámci kategórie podľa skóre. */
export function rankMatches(rows) {
  const order = { match: 0, outside: 1, unavailable: 2 }
  return [...rows].sort((a, b) => (order[a.category] - order[b.category]) || (b.score - a.score))
}
/** Stabilný odtlačok toho, čo je pre Zuzku relevantné: ak sa zmení pri zamietnutej zhode, ponuka sa navrhne na opätovné posúdenie. */
export function matchSignature(m, property) {
  return [m.category, m.budget.status, m.fail_count, property.price ?? '', property.status, m.budget.total ?? ''].join('|')
}
export { isNum }
