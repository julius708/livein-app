// Druhý agent: návrh klientskej ponuky z vybraných a skontrolovaných bytov. Čísla vždy z uloženého výpočtu (deterministicky), AI môže len preformulovať úvodný dôvod výberu
// a jej text sa zahodí, ak obsahuje číslo, ktoré nie je vo faktoch. Klientska časť a interné poznámky sú oddelené. Nič sa neposiela automaticky: človek ponuku skontroluje a odošle sám.
import { eur } from './inv-fmt.js'
import { fmtDate } from './fmt.js'
import { propStatusLabel } from './inv-core.js'

export const OFFER_DISCLAIMER = 'Scenáre vychádzajú z uvedených predpokladov a z historických výsledkov portfólia LIVE-IN; nie sú prísľubom výnosu. Ceny, dostupnosť a náklady je potrebné pred rozhodnutím overiť.'

function scenarioRows(calc) {
  const out = []
  for (const k of ['conservative', 'base', 'optimistic']) {
    const sc = calc.str && calc.str[k], m = calc.metrics && calc.metrics[k]
    if (!sc || sc.none || !m) continue
    out.push({ key: k, label: sc.label, assumptions: `cena ${eur(sc.adr)}/noc, obsadenosť ${Math.round(sc.occupancy)} %`, noi_year: m.noi_year, yield_total_pct: m.yield_total_pct, cashflow_year: m.cashflow_year, cash_on_cash_pct: m.cash_on_cash_pct, provisional: m.provisional })
  }
  if (calc.metrics && calc.metrics.ltr) { const m = calc.metrics.ltr; out.push({ key: 'ltr', label: 'Dlhodobý prenájom', assumptions: 'zadané nájomné a náklady', noi_year: m.noi_year, yield_total_pct: m.yield_total_pct, cashflow_year: m.cashflow_year, cash_on_cash_pct: m.cash_on_cash_pct, provisional: m.provisional }) }
  return out
}
const KIND = { source: 'zo zdroja inzerátu', manual: 'ručne potvrdené', assumption: 'predpoklad', portfolio: 'historické výsledky portfólia LIVE-IN', market: 'trhové údaje', setting: 'predpoklad LIVE-IN' }

/** Klientska časť jednej nehnuteľnosti (bez interných poznámok, skóre a kontaktov predajcu). */
export function offerItem({ match, property: p, calc, now = Date.now() }) {
  const r = match.result || {}
  const b = r.budget || {}
  const why = []
  for (const h of r.hard || []) if (h.state === 'pass' && !['budget', 'equity'].includes(h.key)) why.push(`${h.label}${h.detail ? ': ' + h.detail : ''}`)
  for (const x of r.preferences || []) if (x.state === 'pass') why.push(`${x.label}${x.detail ? ': ' + x.detail : ''}`)
  if (b.status === 'within') why.push(`Celková investícia ${eur(b.total)} je v rozpočte ${eur(b.cap)} (rezerva ${eur(b.margin)})`)
  else if (b.status === 'unverified') why.push(`Známe náklady ${eur(b.total)} sú v rozpočte ${eur(b.cap)}; ešte neznáme: ${b.unknown.join(', ')}`)
  const risks = []
  if (calc.investment.unknown.length) risks.push(`Nie sú známe všetky náklady (${calc.investment.unknown.map((u) => u.label.toLowerCase()).join(', ')}); celková investícia je zatiaľ minimálna.`)
  for (const w of calc.warnings || []) risks.push(w)
  if (calc.quality.assumption_keys && calc.quality.assumption_keys.length) risks.push('Časť vstupov je predpoklad, nie potvrdený údaj.')
  if (p.status !== 'confirmed') risks.push('Dostupnosť zatiaľ nepotvrdil predajca.')
  const age = p.last_checked_at ? Math.floor((now - Date.parse(p.last_checked_at)) / 864e5) : null
  if (age == null || age > 7) risks.push(age == null ? 'Zdroj ponuky ešte nebol skontrolovaný.' : `Údaje o ponuke boli naposledy skontrolované pred ${age} dňami.`)
  if (b.status === 'unknown' || !b.status) risks.push('Nebolo možné overiť rozpočet voči investícii.')
  const assumptions = (calc.inputs || []).filter((i) => ['assumption', 'portfolio', 'market', 'setting'].includes(i.kind) && i.value != null).map((i) => `${i.label}: ${typeof i.value === 'number' ? i.value.toString().replace('.', ',') : i.value} (${KIND[i.kind]}${i.ref ? ', ' + i.ref : ''})`)
  return {
    match_id: match.id, property_id: p.id, calc_id: match.calc_id || p.calc_id,
    headline: [p.address || p.district, p.city].filter(Boolean).join(', ') || 'Nehnuteľnosť',
    facts: [p.rooms != null ? `${p.rooms}-izbový ${p.type || 'byt'}` : p.type, p.area_interior ? `${String(p.area_interior).replace('.', ',')} m² interiér` : null, p.area_exterior ? `${String(p.area_exterior).replace('.', ',')} m² exteriér` : null, p.floor != null ? `${p.floor}. poschodie` : null, p.condition].filter(Boolean),
    price: p.price, total_investment: { known: calc.investment.known_total, complete: calc.investment.complete, unknown: calc.investment.unknown.map((u) => u.label), items: calc.investment.items.map((i) => ({ label: i.label, amount: i.amount })) },
    why, scenarios: scenarioRows(calc), assumptions, risks,
    availability: { status: propStatusLabel(p.status), confirmed_at: p.last_confirmed_at || null, text: p.last_confirmed_at ? `Dostupnosť potvrdil predajca dňa ${fmtDate(p.last_confirmed_at)}.` : 'Dostupnosť zatiaľ nepotvrdil predajca.' },
    next_step: r.next_step || 'Dohodnúť obhliadku',
  }
}
export const factText = (it) => [it.headline, ...it.facts, it.price, it.total_investment.known, ...it.why, ...it.scenarios.flatMap((s) => [s.noi_year, s.yield_total_pct, s.assumptions]), ...it.risks].join(' ')
const nums = (t) => (String(t).match(/\d[\d  ]*(?:[.,]\d+)?/g) || []).map((x) => x.replace(/[  ]/g, '').replace(',', '.'))

/** Úvodný dôvod výberu: deterministicky, alebo AI preformulovanie, ak prejde kontrolou čísel. */
export async function introText({ items, inquiry, ai = null }) {
  const base = items.length === 1 ? `Na základe vašich požiadaviek vám navrhujeme nehnuteľnosť ${items[0].headline}.` : `Na základe vašich požiadaviek vám navrhujeme ${items.length} nehnuteľnosti na porovnanie.`
  if (!ai) return { text: base, ai: false }
  const facts = items.map((it) => `${it.headline}: ${it.facts.join(', ')}; cena ${eur(it.price)}; celková investícia najmenej ${eur(it.total_investment.known)}; dôvody: ${it.why.slice(0, 4).join('; ')}`).join('\n')
  try {
    const out = await ai(`Napíš 2 vety po slovensky pre klienta, prečo sme vybrali tieto nehnuteľnosti. Nepridávaj žiadne čísla ani sľuby výnosov, len použi fakty nižšie.\n${facts}`)
    const t = String(out || '').trim()
    // číslo smie byť len súčasť adresy (napr. „Dunajská 12“); sumy, percentá ani výnosy AI nepíše
    const allowed = new Set(nums(items.map((it) => it.headline).join(' ')))
    if (!t || /[%€]/.test(t) || nums(t).some((n) => !allowed.has(n)) || /garant|zaručen|\bist[ýáé]\b|určite|bez rizika|bezpečn|zarob/i.test(t)) return { text: base, ai: false, rejected: true }
    return { text: t.slice(0, 600), ai: true }
  } catch { return { text: base, ai: false } }
}

/** Návrh ponuky: { content (klientska časť), internal (interné), calc_snapshot }. Vyžaduje skontrolované zhody (nie zamietnuté, nie nedostupné). */
export async function buildOffer({ inquiry, lead = null, picks, now = Date.now(), ai = null }) {
  const bad = picks.filter((x) => x.match.decision === 'rejected' || x.match.category === 'unavailable')
  if (bad.length) return { ok: false, error: 'Do ponuky nemožno dať zamietnutú alebo už nedostupnú nehnuteľnosť.' }
  if (!picks.length) return { ok: false, error: 'Vyberte aspoň jednu nehnuteľnosť.' }
  const items = picks.map((x) => offerItem({ ...x, now }))
  const intro = await introText({ items, inquiry, ai })
  const content = { version: 1, generated_at: new Date(now).toISOString(), intro: intro.text, goal: inquiry.goal || null, items, disclaimer: OFFER_DISCLAIMER, reviewed: false }
  const internal = { ai_intro: intro.ai, ai_rejected: !!intro.rejected, items: picks.map((x) => ({ match_id: x.match.id, score: x.match.score, rank_reason: (x.match.result || {}).rank_reason, quality: x.calc.quality, seller: x.property.seller || null, notes: x.property.notes_internal || null, decision_reason: x.match.decision_reason || null, freshness: (x.match.result || {}).fresh || null })) }
  const calc_snapshot = Object.fromEntries(picks.map((x) => [x.property.id, { calc_id: x.match.calc_id || x.property.calc_id, hash: x.calc.hash, price: x.property.price, known_total: x.calc.investment.known_total, taken_at: new Date(now).toISOString() }]))
  return { ok: true, content, internal, calc_snapshot }
}
/** Čo sa od zostavenia ponuky zmenilo: cena a výpočet nehnuteľností (ponuka si drží pôvodný snímok, len upozorní). */
export function offerNotices(offer, props) {
  const out = []
  for (const [pid, snap] of Object.entries(offer.calc_snapshot || {})) {
    const p = props[pid]
    if (!p) continue
    if (p.price !== snap.price) out.push({ property_id: pid, text: `Cena sa od prípravy ponuky zmenila: ${eur(snap.price)} → ${eur(p.price)}.` })
    else if (p.calc_id && snap.calc_id && p.calc_id !== snap.calc_id) out.push({ property_id: pid, text: 'Existujú novšie údaje výpočtu než v ponuke.' })
    if (['reserved', 'sold', 'withdrawn'].includes(p.status)) out.push({ property_id: pid, text: `Nehnuteľnosť je už ${propStatusLabel(p.status).toLowerCase()}.` })
  }
  return out
}
/** Klientsky náhľad nesmie obsahovať žiadne interné polia. */
export function clientView(offer) {
  const { content } = offer
  return { intro: content.intro, items: content.items.map(({ match_id, property_id, calc_id, ...rest }) => rest), disclaimer: content.disclaimer, reviewed: !!offer.reviewed_at }
}
