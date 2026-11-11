// Kalkulačka investičnej výhodnosti: deterministická, bez siete a bez AI. Základ = webová kalkulačka LIVE-IN (správa 17 %, DPH 5 %,
// Guesty 50 €/mes., upratovanie na pobyt, 30-dňový mesiac, ceny z portfólia) + financovanie, scenáre a body zvratu.
// Pravidlá: chýbajúci údaj nikdy nie je 0 (je „neznámy“ a výsledok je „predbežný“); každý vstup má pôvod (zdroj / ručne / predpoklad / portfólio / trh).
import { PORTFOLIO, STAY_STATS, ZONES, ZONE_DEFAULT, STD_FACTORS, UPLIFT, BENCH_DATES } from './inv-benchmarks.js'

export const CALC_VERSION = 'inv-calc-1'
export const MONTH_DAYS = 30
const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100
const pct = (base, rate) => Math.round((Math.round(base * 100) * rate) / 100) / 100   // % zo sumy zaokrúhlenej na centy ako na webe
export const isNum = (x) => typeof x === 'number' && Number.isFinite(x)
const nz = (x) => (x === '' || x === undefined || x === null ? null : Number.isFinite(Number(x)) ? Number(x) : null)

/** Predvolené nastavenia (prepíše ich riadok `calc` v inv_settings). null = nie je potvrdené / neznáme, nikdy sa nepoužije ako nula. */
export const DEFAULT_CALC_SETTINGS = {
  ops: { management_pct: 17, vat_pct: 5, software_month: 50, portal_pct: 0, own_nights: 0, stay_default: 3, clean_small: 32.5, clean_large: 45, clean_paid: 0, fixed_default: null },
  scenarios: {
    conservative: { label: 'Konzervatívny', occupancy: 66, uplift: 1 },
    base: { label: 'Základný', occupancy: 72, uplift: UPLIFT },
    optimistic: { label: 'Optimistický', occupancy: 80, uplift: UPLIFT },
  },
  costs: { commission_pct: null, legal_pct: null, reserve_pct: null, furnishing_default: null },
  ltr: { vacancy_pct: null, management_pct: null },
  mortgage: { rate_pct: null, rate_source: null, rate_date: null, years: null },
  thresholds: { min_yield_total_pct: null, min_cash_on_cash_pct: null, min_monthly_cashflow: null, max_break_even_occupancy: null, min_quality: null },
}
export function mergeSettings(over = {}) {
  const d = DEFAULT_CALC_SETTINGS, o = over || {}
  const m = (k) => ({ ...d[k], ...(o[k] || {}) })
  const scenarios = {}
  for (const k of Object.keys(d.scenarios)) scenarios[k] = { ...d.scenarios[k], ...((o.scenarios || {})[k] || {}) }
  return { ops: m('ops'), scenarios, costs: m('costs'), ltr: m('ltr'), mortgage: m('mortgage'), thresholds: m('thresholds') }
}

/* ---------------- pôvod vstupov ---------------- */
export const PROV_KINDS = { source: 'zdroj inzerátu', manual: 'ručne potvrdené', assumption: 'predpoklad', portfolio: 'portfólio LIVE-IN (historické)', market: 'trh (PriceLabs)', setting: 'nastavenie firmy' }
const W = { source: 1, manual: 1, setting: 0.7, portfolio: 0.6, market: 0.5, assumption: 0.4 }

/* ---------------- ceny z portfólia (ako na webe) ---------------- */
const bdKey = (b) => String(Math.max(0, Math.min(3, Math.round(Number(b) || 0))))
export function guessZone(city, district = '', address = '') {
  const t = `${district} ${address}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const c = String(city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const list = ZONES[c] || null
  if (!list) return null
  const has = (k) => list.some((z) => z.key === k)
  if (c === 'bratislava') {
    if (/petrzalk/.test(t) && has('petrzalka')) return 'petrzalka'
    if (/ruzinov|nivy|trnavska|miletic/.test(t) && has('ruzinov')) return 'ruzinov'
    if (/nove mesto|kramare|dubravk|raca|lamac/.test(t) && has('nove-mesto')) return 'nove-mesto'
    if (/stare mesto|dunajska|grosslingov|sancova|kosicka/.test(t) && has('stare-mesto')) return 'stare-mesto'
    if (/jadro|hviezdoslavov|obchodna|ventursk|michalsk|panska/.test(t) && has('jadro')) return 'jadro'
  }
  if (c === 'kosice') { if (/hlavna|centrum|mestska/.test(t)) return 'ke-centrum'; if (t.trim()) return 'ke-ostatne' }
  return null
}
/** Odporúčaná cena za obsadenú noc: len ak máme aspoň 3 porovnateľné byty (inak null, cenu nevymýšľame). */
export function benchAdr({ city, zone, bedrooms, standard } = {}) {
  const c = String(city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() || 'other'
  const bd = bdKey(bedrooms)
  const seg = PORTFOLIO[`${c}|${bd}`]
  if (!seg || seg.count < 3) return null
  const list = ZONES[c] || ZONES.other
  const zk = zone || ZONE_DEFAULT[c] || ZONE_DEFAULT.other
  const z = list.find((x) => x.key === zk) || null
  const p = z && z.port[bd]
  const zoneUsed = !!(p && p[0] >= 3)
  const base = zoneUsed ? p[1] : seg.adr * (z ? z.factor : 1)
  const std = STD_FACTORS[standard] || 1
  const mkt = z && z.mkt[bd] ? { p25: z.mkt[bd][0], p50: z.mkt[bd][1], p75: z.mkt[bd][2], n: z.mkt[bd][3] } : null
  return {
    base: cents(base), historical: cents(base * std), n: zoneUsed ? p[0] : seg.count, basis: zoneUsed ? 'portfolio_zone' : 'portfolio_city',
    zone: zk, zoneGuessed: !zone, standardAssumed: !STD_FACTORS[standard], market: mkt, stay: STAY_STATS[`${c}|${bd}`] || null, dates: BENCH_DATES,
  }
}

/* ---------------- hypotéka ---------------- */
/** Anuitná splátka, úroky a istina za prvý rok. Nulový úrok = rovnomerná splátka; neznáma sadzba/splatnosť = bez výpočtu (nie nula). */
export function loanTerms({ loan, rate_pct, years }) {
  if (!isNum(loan) || loan <= 0) return { loan: 0, none: true }
  if (!isNum(rate_pct) || !isNum(years) || years <= 0) return { loan: cents(loan), incomplete: true, missing: [!isNum(rate_pct) ? 'rate_pct' : null, !isNum(years) || years <= 0 ? 'years' : null].filter(Boolean) }
  const n = Math.round(years * 12), r = rate_pct / 1200
  const payment = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n))
  let balance = loan, interest = 0
  const k = Math.min(12, n)
  for (let i = 0; i < k; i++) { const it = balance * r; interest += it; balance -= payment - it }
  const annualDebt = payment * k
  return { loan: cents(loan), months: n, payment: cents(payment), annualDebt: cents(annualDebt), interestYear1: cents(interest), principalYear1: cents(annualDebt - interest), total_interest: cents(payment * n - loan) }
}

/* ---------------- investícia (bez dvojitého započítania) ---------------- */
const INV_LABEL = { price: 'Kúpna cena', parking: 'Povinné parkovanie mimo ceny', commission: 'Provízia RK mimo ceny', legal: 'Právne a administratívne náklady', reno: 'Rekonštrukcia', furnishing: 'Zariadenie', setup: 'Sprevádzkovanie', reserve: 'Rezerva' }
/** Zloží celkovú investíciu. Neznáma položka sa nezapočíta ako nula, ale vypíše sa v `unknown`. */
export function investmentTotal(p, S) {
  const items = [], unknown = [], notes = []
  const add = (key, amount, kind, note) => { items.push({ key, label: INV_LABEL[key], amount: amount == null ? null : cents(amount), kind, note: note || null }); if (amount == null) unknown.push({ key, label: INV_LABEL[key] }) }
  const price = nz(p.price)
  add('price', price, 'source')
  // parkovanie: ak je v cene, neprirátava sa druhýkrát
  if (p.parking_mandatory === true) {
    if (p.parking_in_price === true) { items.push({ key: 'parking', label: INV_LABEL.parking, amount: 0, kind: 'source', note: 'Parkovanie je v cene, nepripočítava sa druhýkrát.' }); notes.push('parking_in_price') }
    else add('parking', p.parking_in_price === false ? nz(p.parking_price) : null, 'manual', p.parking_in_price == null ? 'Nie je známe, či je parkovanie v cene.' : null)
  } else if (p.parking_mandatory == null) { unknown.push({ key: 'parking_mandatory', label: 'Povinnosť parkovania (áno/nie)' }) }
  // provízia: v cene = 0, mimo ceny = % z ceny (zadané alebo z nastavení), neznáme = neznáme
  if (p.commission_in_price === true) items.push({ key: 'commission', label: INV_LABEL.commission, amount: 0, kind: 'source', note: 'Provízia je v cene, nepripočítava sa druhýkrát.' })
  else if (p.commission_in_price === false) {
    const c = nz(p.commission_amount) != null ? { v: nz(p.commission_amount), kind: 'manual' } : nz(p.commission_pct) != null && price != null ? { v: pct(price, nz(p.commission_pct)), kind: 'manual' } : S.costs.commission_pct != null && price != null ? { v: pct(price, S.costs.commission_pct), kind: 'setting' } : null
    add('commission', c ? c.v : null, c ? c.kind : 'manual')
  } else unknown.push({ key: 'commission', label: 'Provízia RK (v cene alebo mimo ceny)' })
  const fromPct = (key, amt, setPct) => { const a = nz(amt); if (a != null) return add(key, a, 'manual'); if (setPct != null && price != null) return add(key, pct(price, setPct), 'setting'); add(key, null, 'manual') }
  fromPct('legal', p.legal_costs, S.costs.legal_pct)
  const optional = (key, amt) => { const a = nz(amt); add(key, a, 'manual') }
  optional('reno', p.reno); optional('setup', p.setup)
  if (nz(p.furnishing) != null) add('furnishing', nz(p.furnishing), 'manual')
  else if (S.costs.furnishing_default != null) add('furnishing', S.costs.furnishing_default, 'assumption', 'Ilustračný predpoklad z nastavení firmy, nie ponuka.')
  else add('furnishing', null, 'manual')
  fromPct('reserve', p.reserve, S.costs.reserve_pct)
  const known = items.reduce((t, i) => t + (i.amount || 0), 0)
  return { items, known_total: cents(known), unknown, complete: unknown.length === 0, notes }
}

/* ---------------- krátkodobý prenájom ---------------- */
/** Jeden 30-dňový mesiac prevádzky: vzorce webovej kalkulačky. Neznáme mesačné náklady majiteľa sa nenahrádzajú nulou (viď `fixed_known`). */
export function strMonth(v) {
  const nights = ((MONTH_DAYS - v.own) * v.occupancy) / 100
  const gross = cents(nights * v.adr)
  const portal = cents((gross * v.portal) / 100)
  const income = cents(gross - portal)
  const management = pct(income, v.management)
  const vat = pct(income, v.vat)
  const bookings = v.stay > 0 ? nights / v.stay : 0
  const cleanGross = cents(bookings * v.clean)
  const cleanRecovery = cents(bookings * v.cleanPaid)
  const cleaning = cents(cleanGross - cleanRecovery)
  const fixed = v.fixed == null ? 0 : v.fixed
  const net = cents(income - management - vat - cleaning - v.software - fixed)
  return { nights, bookings, gross, portal, income, management, vat, cleaning, software: v.software, fixed: v.fixed, fixed_known: v.fixed != null, net }
}
/** Obsadenosť (%), pri ktorej je mesačný výsledok rovný `target` (0 = bod zvratu prevádzky; splátka = bod zvratu cashflow). null = ani pri 100 % to nevyjde. */
export function breakEvenOccupancy(v, target = 0) {
  const f = (occupancy) => strMonth({ ...v, occupancy }).net
  const a = f(0), slope = (f(100) - a) / 100
  if (!(slope > 0)) return null
  const be = (target - a) / slope
  return be <= 0 ? 0 : be <= 100 ? Math.round(be * 10) / 10 : null
}
export const SEASON_NET = [615, 660, 930, 1070, 1320, 1370, 1480, 1480, 1350, 1030, 800, 1420]   // referenčný apartmán LIVE-IN (projekcia 30. 4. 2026)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
/** Rozloženie ročného výsledku podľa sezónneho profilu referenčného bytu; súčet = ročný výsledok presne. */
export function seasonalMonths(annual) {
  const total = SEASON_NET.reduce((a, b) => a + b, 0), a = Math.round(annual * 100)
  let used = 0
  return MONTHS.map((label, i) => { const c = i < 11 ? Math.round((a * SEASON_NET[i]) / total) : a - used; used += c; return { label, value: c / 100 } })
}

/* ---------------- dlhodobý prenájom ---------------- */
export function ltrYear({ rent, vacancy_pct, management_pct, owner_costs }) {
  if (!isNum(rent) || rent <= 0) return { none: true, missing: ['ltr_rent'] }
  const missing = []
  if (!isNum(vacancy_pct)) missing.push('ltr_vacancy_pct')
  if (!isNum(management_pct)) missing.push('ltr_management_pct')
  if (!isNum(owner_costs)) missing.push('ltr_owner_costs')
  const gross = cents(rent * 12)
  const vacancy = isNum(vacancy_pct) ? cents((gross * vacancy_pct) / 100) : 0
  const income = cents(gross - vacancy)
  const mgmt = isNum(management_pct) ? pct(income, management_pct) : 0
  const costs = isNum(owner_costs) ? cents(owner_costs * 12) : 0
  return { gross, vacancy, income, management: mgmt, owner_costs: costs, net: cents(income - mgmt - costs), complete: missing.length === 0, missing }
}

/* ---------------- hlavný výpočet ---------------- */
function input(list, key, label, value, kind, ref, at) { list.push({ key, label, value, kind, ref: ref || null, at: at || null }) }
const provOf = (p, key, fallback) => (p.prov && p.prov[key]) || { kind: fallback }

/**
 * @param p  nehnuteľnosť (polia viď INV_FIELDS v inv-core), p.prov[pole] = { kind, ref, at }
 * @param fin  financovanie { loan, rate_pct, rate_source, rate_date, years } alebo null
 * @param settingsOver  riadok inv_settings.calc
 */
export function computeInvestment(p, fin = null, settingsOver = {}) {
  const S = mergeSettings(settingsOver)
  const inputs = [], warnings = [], missing = [], ltrMissing = []
  const investment = investmentTotal(p, S)
  for (const it of investment.items) input(inputs, 'inv_' + it.key, it.label, it.amount, it.kind === 'source' ? provOf(p, it.key, 'source').kind : it.kind, provOf(p, it.key, '').ref, provOf(p, it.key, '').at)
  const mode = p.rental_mode || 'compare'
  const r = p.rental || {}
  const cityKey = String(p.city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() || 'other'
  const zone = p.zone || guessZone(p.city, p.district, p.address) || null
  const bench = benchAdr({ city: p.city, zone, bedrooms: p.bedrooms, standard: p.standard })
  if (bench && bench.zoneGuessed && !zone) warnings.push('Lokalita (zóna) nie je potvrdená, použitá predvolená zóna mesta.')
  if (bench && bench.standardAssumed) warnings.push('Štandard vybavenia nie je zadaný, použitý koeficient 1 (komfortný) ako predpoklad.')
  const areaKnown = nz(p.area_interior)

  // --- vstupy STR ---
  const own = nz(r.own_nights) ?? S.ops.own_nights
  const stay = nz(r.stay) ?? (bench && bench.stay ? bench.stay.stay : S.ops.stay_default)
  const clean = nz(r.clean) ?? ((nz(p.bedrooms) >= 2 || (areaKnown != null && areaKnown >= 70)) ? S.ops.clean_large : S.ops.clean_small)
  const cleanPaid = nz(r.clean_paid) ?? S.ops.clean_paid
  const portal = nz(r.portal_pct) ?? S.ops.portal_pct
  const fixedOwn = nz(p.monthly_fixed)
  const fixed = fixedOwn != null ? fixedOwn : S.ops.fixed_default
  if (mode !== 'ltr') {
    input(inputs, 'str_stay', 'Priemerná dĺžka pobytu (nocí)', stay, nz(r.stay) != null ? 'manual' : bench && bench.stay ? 'portfolio' : 'assumption', bench && bench.stay ? `portfólio ${bench.dates.stay_stats}` : 'ilustračný predpoklad')
    input(inputs, 'str_clean', 'Upratovanie na pobyt (€)', clean, nz(r.clean) != null ? 'manual' : 'setting', 'predpoklad LIVE-IN z kalkulačky na webe')
    input(inputs, 'str_portal', 'Poplatky portálov (%)', portal, nz(r.portal_pct) != null ? 'manual' : 'setting', null)
    if (nz(r.portal_pct) == null && S.ops.portal_pct === 0) warnings.push('Poplatky portálov sú 0 %: ak príjem (cena za noc) ešte nie je znížený o províziu portálu, výsledok je nadhodnotený. Nastavte len poplatky, ktoré ešte nie sú odpočítané.')
    input(inputs, 'monthly_fixed', 'Energie, fond opráv, poistenie a dane / mes. (€)', fixed, fixedOwn != null ? provOf(p, 'monthly_fixed', 'manual').kind : fixed != null ? 'assumption' : 'missing', fixedOwn == null && fixed != null ? 'predvolený predpoklad z nastavení firmy' : null)
    if (fixed == null) missing.push('monthly_fixed')
  }

  // --- scenáre STR ---
  const scenarios = {}
  let adrOverride = nz(r.adr)
  if (mode !== 'ltr') {
    if (adrOverride == null && !bench && !Object.values(S.scenarios).some((x) => x.adr != null)) missing.push('str_adr')
    for (const [key, sc] of Object.entries(S.scenarios)) {
      const occ = nz(r.occupancy) != null && key === 'base' ? nz(r.occupancy) : sc.occupancy
      const adr = adrOverride != null ? cents(adrOverride) : sc.adr != null ? cents(sc.adr) : bench ? cents(bench.historical * sc.uplift) : null
      if (adr == null) { scenarios[key] = { key, label: sc.label, none: true, occupancy: occ }; continue }
      const v = { adr, occupancy: occ, own, stay, clean, cleanPaid, portal, management: S.ops.management_pct, vat: S.ops.vat_pct, software: S.ops.software_month, fixed }
      const m = strMonth(v)
      scenarios[key] = { key, label: sc.label, adr, occupancy: occ, uplift: sc.uplift, month: m, annual: cents(m.net * 12), v, adr_kind: adrOverride != null ? 'manual' : sc.adr != null ? 'setting' : 'portfolio' }
    }
    if (bench && adrOverride == null && S.scenarios.base.adr == null) input(inputs, 'str_adr', 'Cena za obsadenú noc (€) – základ', bench.historical, 'portfolio', `${bench.basis === 'portfolio_zone' ? 'naše byty v zóne' : 'naše byty v meste'} (${bench.n}), medián za 12 mesiacov k ${bench.dates.portfolio_adr}; bez prirážky`)
    if (adrOverride != null) input(inputs, 'str_adr', 'Cena za obsadenú noc (€) – zadaná', adrOverride, 'manual')
    else if (S.scenarios.base.adr != null) input(inputs, 'str_adr', 'Cena za obsadenú noc (€) – základný scenár z nastavení', S.scenarios.base.adr, 'setting', 'nastavenie firmy (predpoklad, nie údaj z trhu)')
    if (bench && bench.market) input(inputs, 'market_adr', 'Trh v okolí (€/noc, p25–p50–p75)', `${bench.market.p25}–${bench.market.p50}–${bench.market.p75} (${bench.market.n} listingov)`, 'market', `PriceLabs ${bench.dates.market}`)
  }

  // --- dlhodobý prenájom ---
  let ltr = null
  if (mode !== 'str') {
    ltr = ltrYear({ rent: nz(r.ltr_rent), vacancy_pct: nz(r.ltr_vacancy_pct) ?? S.ltr.vacancy_pct, management_pct: nz(r.ltr_management_pct) ?? S.ltr.management_pct, owner_costs: nz(r.ltr_owner_costs) })
    // v režime „porovnanie“ chýbajúci dlhodobý nájom nezhoršuje kvalitu krátkodobého výpočtu
    const target = mode === 'ltr' ? missing : ltrMissing
    for (const m of ltr.missing || []) if (!target.includes(m)) target.push(m)
    input(inputs, 'ltr_rent', 'Mesačné nájomné (€)', nz(r.ltr_rent), nz(r.ltr_rent) != null ? provOf(p, 'ltr_rent', 'manual').kind : 'missing')
  }

  // --- financovanie ---
  let financing = null
  const loan = fin && nz(fin.loan) != null ? nz(fin.loan) : null
  if (loan != null && loan > 0) {
    const rate = nz(fin.rate_pct) ?? S.mortgage.rate_pct, years = nz(fin.years) ?? S.mortgage.years
    const t = loanTerms({ loan, rate_pct: rate, years })
    const rateSource = fin.rate_source || S.mortgage.rate_source || null, rateDate = fin.rate_date || S.mortgage.rate_date || null
    financing = { ...t, rate_pct: rate, years, rate_source: rateSource, rate_date: rateDate, rate_documented: !!(rateSource && rateDate) }
    if (rate != null && !(rateSource && rateDate)) warnings.push('Úroková sadzba nemá uvedený zdroj a dátum.')
    input(inputs, 'loan', 'Plánovaný úver (€)', loan, 'manual'); input(inputs, 'rate', 'Úroková sadzba (% p. a.)', rate, rate == null ? 'missing' : rateSource ? 'source' : 'assumption', rateSource, rateDate)
    if (t.incomplete) for (const m of t.missing) missing.push('loan_' + m)
  }

  // --- metriky podľa scenárov ---
  const total = investment.known_total
  const equity = financing ? cents(total - financing.loan) : null
  const metricsFor = (annualNoi, extra = {}, provisional = false) => {
    const out = { noi_year: annualNoi, provisional: !investment.complete || provisional }
    out.yield_total_pct = total > 0 ? (annualNoi / total) * 100 : null
    if (financing && !financing.incomplete) {
      out.debt_year = financing.annualDebt
      out.cashflow_year = cents(annualNoi - financing.annualDebt)
      out.cashflow_month = cents(out.cashflow_year / 12)
      out.equity = equity
      out.cash_on_cash_pct = equity > 0 ? (out.cashflow_year / equity) * 100 : null
    } else { out.cashflow_year = null; out.cashflow_month = null; out.cash_on_cash_pct = null; out.equity = equity }
    return { ...out, ...extra }
  }
  const metrics = {}
  for (const [k, s] of Object.entries(scenarios)) {
    if (s.none) { metrics[k] = null; continue }
    const monthlyDebt = financing && !financing.incomplete ? financing.payment : null
    const be = breakEvenOccupancy(s.v, 0)
    const beDebt = monthlyDebt != null ? breakEvenOccupancy(s.v, monthlyDebt) : null
    metrics[k] = metricsFor(s.annual, { break_even_occupancy: be, break_even_occupancy_after_debt: beDebt, months: seasonalMonths(s.annual) }, fixed == null)
  }
  if (ltr && !ltr.none) metrics.ltr = metricsFor(ltr.net, {}, !ltr.complete)

  // --- kvalita vstupov: 0–100, oddelená od výhodnosti a od zhody ---
  const keyInputs = ['inv_price', 'str_adr', 'monthly_fixed', 'inv_legal', 'inv_reno', 'inv_furnishing', 'inv_commission']
  let sum = 0, cnt = 0
  for (const k of keyInputs) { const i = inputs.find((x) => x.key === k); if (!i) continue; cnt++; sum += i.value == null || i.kind === 'missing' ? 0 : W[i.kind] ?? 0.4 }
  for (const u of investment.unknown) if (!keyInputs.some((k) => k === 'inv_' + u.key)) { cnt++ }
  const score = cnt ? Math.round((sum / cnt) * 100) : 0
  const level = investment.complete && missing.length === 0 && score >= 85 ? 'overena' : score >= 55 ? 'ciastocna' : 'orientacna'
  const quality = { score, level, missing: [...new Set([...missing, ...investment.unknown.map((u) => u.key)])], missing_ltr: ltrMissing, assumption_keys: inputs.filter((i) => i.kind === 'assumption').map((i) => i.key) }
  const res = { version: CALC_VERSION, mode, investment, equity, str: scenarios, ltr, financing, metrics, inputs, warnings, quality, bench: bench ? { basis: bench.basis, n: bench.n, zone: bench.zone, market: bench.market, dates: bench.dates } : null, zone, city_key: cityKey }
  res.hash = hashInputs({ p: pickCalcInput(p), fin: fin ? { loan: fin.loan, rate: fin.rate_pct, years: fin.years } : null, S: { ops: S.ops, scenarios: S.scenarios, costs: S.costs, ltr: S.ltr, mortgage: S.mortgage } })  // prahy výhodnosti nie sú vstup výpočtu
  return res
}
const CALC_KEYS = ['price', 'parking_mandatory', 'parking_in_price', 'parking_price', 'commission_in_price', 'commission_pct', 'commission_amount', 'legal_costs', 'reno', 'furnishing', 'setup', 'reserve', 'monthly_fixed', 'city', 'zone', 'district', 'bedrooms', 'area_interior', 'standard', 'rental_mode', 'rental']
export const pickCalcInput = (p) => Object.fromEntries(CALC_KEYS.map((k) => [k, p[k] ?? null]))
/** Stabilný odtlačok vstupov (cyrb53), aby sa nová verzia výpočtu vytvorila len pri skutočnej zmene. */
export function hashInputs(o) {
  const str = JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v))
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/* ---------------- prahy výhodnosti ---------------- */
export const THRESHOLD_DEFS = [
  { key: 'min_yield_total_pct', label: 'Min. výnos z celkovej investície (%)', metric: (m) => m.yield_total_pct, dir: 'min' },
  { key: 'min_cash_on_cash_pct', label: 'Min. výnos z vlastných zdrojov po splátkach (%)', metric: (m) => m.cash_on_cash_pct, dir: 'min' },
  { key: 'min_monthly_cashflow', label: 'Min. mesačné cashflow po splátkach (€)', metric: (m) => m.cashflow_month, dir: 'min' },
  { key: 'max_break_even_occupancy', label: 'Max. obsadenosť v bode zvratu (%)', metric: (m) => m.break_even_occupancy, dir: 'max' },
  { key: 'min_quality', label: 'Min. kvalita podkladov (0–100)', metric: (m, q) => q.score, dir: 'min' },
]
/** Porovná základný scenár s firemnými prahmi. Kým nie sú nastavené, stav je „čaká na nastavenie kritérií“ (nič sa nevymýšľa). */
export function evaluateThresholds(result, thresholds) {
  const t = { ...DEFAULT_CALC_SETTINGS.thresholds, ...(thresholds || {}) }
  const m = result && result.metrics && (result.metrics.base || result.metrics.ltr)
  const checks = THRESHOLD_DEFS.map((d) => {
    const thr = nz(t[d.key])
    const val = m ? d.metric(m, result.quality) : null
    const ok = thr == null ? null : val == null ? null : d.dir === 'min' ? val >= thr : val <= thr
    return { key: d.key, label: d.label, threshold: thr, value: val == null ? null : Math.round(val * 100) / 100, ok }
  })
  const set = checks.filter((c) => c.threshold != null)
  if (!set.length) return { status: 'awaiting_criteria', label: 'čaká na nastavenie kritérií', checks }
  if (set.some((c) => c.ok === false)) return { status: 'below', label: 'pod kritériami', checks }
  if (set.some((c) => c.ok == null)) return { status: 'unknown', label: 'nedá sa posúdiť (chýbajú vstupy)', checks }
  return { status: 'meets', label: 'spĺňa nastavené kritériá', checks }
}
