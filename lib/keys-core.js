/** Kľúče – čistá logika (bez DB): radenie podľa pozície na stene, rady z nastavení, pohyby sád, dlžníci. Unit-testované. */

export const KEYS_ROLES = ['admin', 'operations', 'cleaning', 'customer_service', 'assistant']
export function canKeys(me) { return !!(me && (me.roles || []).some((r) => KEYS_ROLES.includes(r))) }

export const DEFAULT_ROWS = [{ row: 1, from: 1, to: 67 }, { row: 2, from: 68, to: 132 }, { row: 3, from: 133, to: 148 }]

/** Rady (lišty) z nastavení: zoradené, platné rozsahy, bez prekryvu sa nekontroluje – stena je, aká je. */
export function normalizeRows(v) {
  const rows = (Array.isArray(v) ? v : []).map((r, i) => ({ row: Number(r.row) || i + 1, from: Number(r.from), to: Number(r.to), label: r.label ? String(r.label).slice(0, 40) : '' }))
    .filter((r) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to >= r.from && r.to <= 999)
    .sort((a, b) => a.from - b.from)
  return rows.length ? rows : DEFAULT_ROWS
}

/** Do ktorého radu patrí pozícia (null = mimo rozsahov). */
export function rowOf(rows, hookNo) {
  const n = Number(hookNo); if (!Number.isInteger(n)) return null
  const r = rows.find((x) => n >= x.from && n <= x.to); return r ? r.row : null
}

export const skCompare = (a, b) => String(a || '').localeCompare(String(b || ''), 'sk')

/** Poradie bytov: najprv so zaradenou pozíciou (podľa čísla), potom nezaradené abecedne – rovnaké radenie ako nástenka Práčovne. */
export function sortUnits(units) {
  return [...units].sort((a, b) => {
    const ha = a.hook_no == null, hb = b.hook_no == null
    if (ha !== hb) return ha ? 1 : -1
    if (!ha) return a.hook_no - b.hook_no
    return skCompare(a.listing_name, b.listing_name)
  })
}

/** Tabuľa: pre každý rad pole pozícií od..do, s bytom alebo prázdne; byty bez pozície zvlášť. */
export function board(units, rows) {
  const byHook = new Map(); for (const u of units) if (u.hook_no != null && u.active !== false) byHook.set(u.hook_no, u)
  const out = rows.map((r) => ({ ...r, hooks: Array.from({ length: r.to - r.from + 1 }, (_, i) => { const n = r.from + i; return { hook_no: n, unit: byHook.get(n) || null } }) }))
  const covered = new Set(out.flatMap((r) => r.hooks.map((h) => h.hook_no)))
  const outside = sortUnits(units.filter((u) => u.hook_no != null && !covered.has(u.hook_no) && u.active !== false))
  const unplaced = sortUnits(units.filter((u) => u.hook_no == null && u.active !== false))
  return { rows: out, outside, unplaced }
}

/** Stav dlaždice: ok (všetko na háčiku) · part (časť vonku) · out (všetko vonku) · none (0 sád). */
export function tileState(u) {
  const sets = Number(u.sets) || 0, out = Number(u.out_sets) || 0
  if (sets === 0) return 'none'
  if (out <= 0) return 'ok'
  return out >= sets ? 'out' : 'part'
}

const holder = (h) => ({ name: String(h.name || '').slice(0, 80), email: h.email ? String(h.email).toLowerCase() : null, sets: Math.max(1, Number(h.sets) || 1), at: h.at || new Date().toISOString(), move_id: h.move_id || null })

/** Zobratie n sád: zvýši out_sets (najviac na počet sád), pridá držiteľa. Vráti nový stav alebo chybu. */
export function applyTake(u, person, n = 1, at = new Date().toISOString(), moveId = null) {
  const sets = Number(u.sets) || 0, out = Number(u.out_sets) || 0, want = Math.max(1, Number(n) || 1)
  if (sets === 0) return { error: 'Tento byt nemá evidované žiadne sady kľúčov.' }
  if (out + want > sets) return { error: out >= sets ? 'Všetky sady tohto bytu sú už vonku.' : `Na háčiku je už len ${sets - out} sád.` }
  const holders = [...(Array.isArray(u.holders) ? u.holders : []), holder({ ...person, sets: want, at, move_id: moveId })]
  return { out_sets: out + want, holders }
}

/** Vrátenie n sád osobou: odpočíta z jej záznamov (najstaršie prvé). Ak osoba nič nedrží, vráti sa aj tak (náprava stavu), ale označí sa to. */
export function applyReturn(u, person, n = 1) {
  const out = Number(u.out_sets) || 0, want = Math.max(1, Number(n) || 1)
  if (out <= 0) return { error: 'Všetky sady tohto bytu sú na háčiku.' }
  const take = Math.min(want, out)
  let left = take, mismatch = false
  const mine = (h) => (person.email && h.email ? h.email === person.email : h.name === person.name)
  const holders = [...(Array.isArray(u.holders) ? u.holders : [])].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const kept = []
  for (const h of holders) { if (left > 0 && mine(h)) { const d = Math.min(left, h.sets); left -= d; if (h.sets - d > 0) kept.push({ ...h, sets: h.sets - d }) } else kept.push(h) }
  if (left > 0) { mismatch = true; for (let i = 0; i < kept.length && left > 0; i++) { const d = Math.min(left, kept[i].sets); left -= d; kept[i] = { ...kept[i], sets: kept[i].sets - d } } }
  return { out_sets: out - take, holders: kept.filter((h) => h.sets > 0), returned: take, mismatch }
}

/** Čo má osoba vonku (pre „Vrátiť kľúče“). */
export function owedBy(units, person) {
  const mine = (h) => (person.email && h.email ? h.email === person.email : h.name === person.name)
  const out = []
  for (const u of units) for (const h of (u.holders || [])) if (mine(h)) out.push({ listing_id: u.listing_id, listing_name: u.listing_name, hook_no: u.hook_no, sets: h.sets, at: h.at })
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

/** Držitelia dlhšie než limit hodín (upozornenie). */
export function overdue(units, hours = 24, now = Date.now()) {
  const lim = now - Math.max(1, Number(hours) || 24) * 3600e3
  const out = []
  for (const u of units) for (const h of (u.holders || [])) { const t = Date.parse(h.at); if (Number.isFinite(t) && t < lim) out.push({ listing_id: u.listing_id, listing_name: u.listing_name, hook_no: u.hook_no, name: h.name, sets: h.sets, at: h.at, hours: Math.floor((now - t) / 3600e3) }) }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

/** Zoznam na deň podľa tašiek (balíky z Práčovne): zoradené ako nástenka, s pozíciou a stavom kľúča. */
export function dayList(packages, units) {
  const byId = new Map(units.map((u) => [u.listing_id, u]))
  return [...packages].filter((p) => p.status !== 'cancelled' && !p.hidden)
    .map((p) => { const u = byId.get(p.listing_id) || null; return { package_id: p.id, listing_id: p.listing_id, listing_name: u ? u.listing_name : p.listing_name, date: p.date, status: p.status, same_day: !!p.same_day, hook_no: u ? u.hook_no : null, unit: u, key: u ? tileState(u) : 'unknown' } })
    .sort((a, b) => skCompare(a.listing_name, b.listing_name))
}

/** Hľadanie: číslo pozície alebo časť názvu bez diakritiky. */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function matches(u, q) {
  const s = String(q || '').trim(); if (!s) return true
  if (/^\d+$/.test(s)) return u.hook_no != null && String(u.hook_no).startsWith(s)
  return fold(u.listing_name).includes(fold(s))
}

/** Osoby do ponuky: z účtov appky a profilov Práčovne, bez duplicít a bez technických účtov. */
export function personOptions(appUsers = [], profiles = []) {
  const skip = /bot|automatiz|\binfo\b|management|udrzba|pracovna|\.(com|co|net|sk)$|^crm/i
  const seen = new Set(), out = []
  for (const u of appUsers) { const n = String(u.name || '').trim(); if (!n || skip.test(n) || (u.roles || []).includes('bot')) continue; const k = fold(n); if (seen.has(k)) continue; seen.add(k); out.push({ name: n, email: (u.email || '').toLowerCase() || null }) }
  for (const p of profiles) { const n = String(p.display_name || '').trim(); if (!n || skip.test(n)) continue; const k = fold(n); if ([...seen].some((s) => s === k || s.startsWith(k + ' '))) continue; seen.add(k); out.push({ name: n, email: null }) }
  return out.sort((a, b) => skCompare(a.name, b.name))
}

/** Hlava názvu: časť pred prvou čiarkou bez zátvoriek („Eurovea, 2 Sky“ → „Eurovea“). */
export const headOf = (s) => { const t = String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(); const i = t.indexOf(','); const h = (i > 0 ? t.slice(0, i) : t).trim(); return h.length >= 3 ? h : t }
/** Názvy, ktorých hlava sa opakuje medzi aktívnymi bytmi – tie sa na dlaždici ukážu celé, aby sa Eurovey a Skyparky nemýlili. */
const firstWord = (s) => fold(s).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || ''
export function dupHeads(units) {
  const c = new Map(); for (const u of units) if (u.active !== false) { const w = firstWord(u.listing_name); c.set(w, (c.get(w) || 0) + 1) }
  return new Set([...c].filter(([, n]) => n > 1).map(([w]) => w))
}
/** Text na dlaždicu: krátka hlava, alebo celý názov bez zátvoriek, keď by hlava bola nejednoznačná. */
export function tileName(name, dups) {
  const h = headOf(name)
  if (!dups || !dups.has(firstWord(name))) return h
  return String(name || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*,\s*/g, ' · ').trim()
}
