// Investičný dopyt: overenie a čistenie formulára. Neznáme údaje ostávajú prázdne (null / prázdne pole), nikdy sa nedoplnia nulou ani odhadom.
import { toNum, INQ_STATUS_IDS, GOALS, RISK, FEATURE_LABELS } from './inv-core.js'

const arr = (v, max = 30) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, 80))
const tri = (v) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null)
const numField = (raw, k, min = 0, max = 1e9) => { const v = raw[k]; if (v === '' || v == null) return { v: null }; const n = toNum(v); if (n == null || n < min || n > max) return { error: `Pole „${k}“ nie je platné číslo.` }; return { v: n } }
export const MUST_KEYS = Object.keys(FEATURE_LABELS)

/** @returns { patch } alebo { error } */
export function cleanInquiry(raw = {}, { partial = false } = {}) {
  const p = {}
  const has = (k) => !partial || k in raw
  for (const k of ['cities', 'areas', 'excluded_areas', 'types', 'conditions']) if (has(k)) p[k] = arr(raw[k])
  if (has('types')) { const bad = p.types.find((t) => !['byt', 'dom'].includes(t)); if (bad) return { error: 'Typ nehnuteľnosti musí byť byt alebo dom.' }; }
  if (has('rooms')) { const rs = arr(raw.rooms, 8).map(Number); if (rs.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) return { error: 'Dispozícia musí byť počet izieb 1 až 10.' }; p.rooms = rs }
  for (const k of ['area_min', 'area_max', 'budget_total', 'equity', 'loan_planned', 'price_cap', 'prep_budget', 'target_yield_pct', 'target_cashflow_month']) if (has(k)) { const r = numField(raw, k, 0, k === 'target_yield_pct' ? 100 : 1e9); if (r.error) return r; p[k] = r.v }
  if (p.area_min != null && p.area_max != null && p.area_min > p.area_max) return { error: 'Minimálna výmera je väčšia než maximálna.' }
  if (has('budget_kind')) { const k = String(raw.budget_kind || ''); p.budget_kind = ['total', 'equity', 'unknown'].includes(k) ? k : null }
  // „200 000 €“ bez určenia významu sa nikdy nepovažuje za celkovú investíciu
  if (p.budget_total != null && !p.budget_kind) p.budget_kind = 'unknown'
  for (const k of ['reno_willing', 'wants_management']) if (has(k)) p[k] = tri(raw[k])
  for (const k of ['must', 'prefer']) if (has(k)) { const o = {}; for (const f of MUST_KEYS) if (tri((raw[k] || {})[f]) === true) o[f] = true; p[k] = o }
  if (p.must && p.prefer) for (const f of Object.keys(p.must)) delete p.prefer[f]   // povinné a preferované sa neprekrývajú
  if (has('goal')) p.goal = GOALS.some((g) => g.id === raw.goal) ? raw.goal : null
  if (has('risk')) p.risk = RISK.some((g) => g.id === raw.risk) ? raw.risk : null
  if ('status' in raw) { if (!INQ_STATUS_IDS.includes(raw.status)) return { error: 'Neplatný stav dopytu.' }; p.status = raw.status }
  if (has('purchase_by')) { const v = String(raw.purchase_by || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'Termín kúpy musí byť RRRR-MM-DD.' }; p.purchase_by = v || null }
  if (has('next_due')) { const v = String(raw.next_due || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'Termín ďalšieho kroku musí byť RRRR-MM-DD.' }; p.next_due = v || null }
  for (const [k, n] of [['label', 120], ['source', 80], ['notes', 3000], ['next_step', 300], ['owner_email', 120], ['next_owner', 120]]) if (has(k)) { const v = String(raw[k] ?? '').trim(); p[k] = v ? v.slice(0, n) : null }
  if (p.owner_email) p.owner_email = p.owner_email.toLowerCase()
  return { patch: p }
}
/** Vlastné zdroje, úver a rozpočet pospolu: čo presne vieme o rozpočte (na zobrazenie pri dopyte). */
export function budgetSummary(q) {
  const kind = q.budget_kind || 'unknown'
  const parts = []
  if (q.budget_total != null) parts.push(kind === 'total' ? `celková investícia najviac ${q.budget_total} €` : kind === 'equity' ? `vlastné zdroje ${q.budget_total} €` : `suma ${q.budget_total} € (význam nepotvrdený)`)
  if (q.equity != null && kind !== 'equity') parts.push(`vlastné zdroje ${q.equity} €`)
  if (q.loan_planned != null) parts.push(`plánovaný úver ${q.loan_planned} €`)
  if (q.price_cap != null) parts.push(`limit kúpnej ceny ${q.price_cap} €`)
  return { kind, text: parts.join(' · ') || 'rozpočet nie je zadaný', ambiguous: q.budget_total != null && kind === 'unknown' }
}
