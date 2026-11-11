// Vyúčtovanie majiteľom: čistá logika (bez siete a bez Reactu), pokrytá testami v tests/billing.test.mjs.
// Správanie zodpovedá prototypu vyuctovanie_artefakt.html a pravidlám zo zadania (J. Honsch, 11. 11. 2026).
// Sumy sa počítajú v centoch, aby sa pri sčítaní nehromadili chyby zaokrúhľovania.

export const BILLING_ROLES = ['admin', 'assistant', 'operations']
export const canBilling = (me) => !!(me && me.active !== false && (me.roles || []).some((r) => BILLING_ROLES.includes(r)))

// ——— Stavy, kategórie, firmy ———
export const STAVY_FIXED = ['Suma OK', 'Doplniť sumu', 'Čaká na Patrika (cena opravy)', 'Skontrolovať duplicitu', 'Nepriradené k bytu', 'Neúčtovať', 'Cenník (bežná cena)']
export const MONTHS_SK = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
export const KATS = ['Nový byt – zariadenie', 'Nový byt – štartovné náklady', 'Modrá guľa – 3 nové byty (október)', 'Oprava (Hotové opravy)', 'Poznámka z Účtovníctva', 'Všeobecné položky do bytov', 'Alza – LIVE-IN Management', 'Alza – LIVE-IN International', 'Iné']
export const CENNIK_KAT = 'Všeobecné položky do bytov'
export const NEW_BYTY = ['Antolská 2', 'Kristína Dicer (Záhradnícka 52 + Miletičova 38)', 'Modrá guľa (3 nové byty)', 'Modrá guľa (Suché mýto 4)', 'Klariská 12']
export const FIRMS = { I: 'International', M: 'Management', S: 'Slovakia', x: 'Firma ?' }
export const FIRM_FULL = { I: 'LIVE-IN International', M: 'LIVE-IN Management', S: 'LIVE-IN Slovakia', x: 'Firma nezistená' }
export const FIRM_DB = { I: 'International', M: 'Management', S: 'Slovakia' }
export const FIRM_CODE = { International: 'I', Management: 'M', Slovakia: 'S', I: 'I', M: 'M', S: 'S' }
export const GROUP_B = 'BEŽNÉ POLOŽKY NA BYTY'
export const GROUP_O = 'Nepriradené k bytu'
export const NO_PART = 'Spoločné / neurčený byt'

const pad = (n) => String(n).padStart(2, '0')
/** 2026-10-01 → „október 2026“ */
export function monthLabel(ymd) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ymd || ''))
  return m ? `${MONTHS_SK[Number(m[2]) - 1] || m[2]} ${m[1]}` : ''
}
export const monthName = (ymd) => { const m = /^(\d{4})-(\d{2})/.exec(String(ymd || '')); return m ? MONTHS_SK[Number(m[2]) - 1] || '' : '' }
/** Prvý deň nasledujúceho mesiaca: 2026-12-01 → 2027-01-01 */
export function nextMonth(ymd) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ymd || '')); if (!m) return null
  let y = Number(m[1]), mo = Number(m[2]) + 1; if (mo > 12) { mo = 1; y += 1 }
  return `${y}-${pad(mo)}-01`
}
/** Stav „Pravdepodobne [ďalší mesiac]“ pre obdobie: október → „Pravdepodobne november“ */
export const probableStav = (ymd) => `Pravdepodobne ${monthName(nextMonth(ymd))}`
export const isProbable = (stav) => String(stav || '').startsWith('Pravdepodobne')
/** Zoznam stavov do ponuky pre dané obdobie (poradie ako v prototype). */
export function stavyFor(ymd) {
  const f = STAVY_FIXED
  return [...f.slice(0, 5), probableStav(ymd), ...f.slice(5)]
}
export const validStav = (s) => STAVY_FIXED.includes(s) || /^Pravdepodobne \S/.test(String(s || ''))
export const stavClass = (s) => ({ 'Suma OK': 's-ok', 'Doplniť sumu': 's-doplnit', 'Čaká na Patrika (cena opravy)': 's-patrik', 'Skontrolovať duplicitu': 's-dup', 'Neúčtovať': 's-neuct', 'Nepriradené k bytu': 's-nov', 'Cenník (bežná cena)': 's-nov' }[s] || (isProbable(s) ? 's-nov' : ''))

/** Poradie kategórie v karte bytu: známe podľa zoznamu, skupiny nových bytov na treťom mieste, ostatné nakoniec. */
export function katOrder(kat) {
  const i = KATS.indexOf(kat)
  if (i >= 0) return i
  if (/ – \d+ nové byty/i.test(String(kat || ''))) return 2
  return 99
}

// ——— Čísla a sumy ———
export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const toC = (x) => Math.round(x * 100 + (x >= 0 ? 1e-7 : -1e-7))
/** Suma riadku v centoch: ks × cena, inak suma. null = suma nie je známa. */
export function lineCents(it) {
  const ks = num(it.ks), c = num(it.cena)
  if (ks != null && c != null) return toC(ks * c)
  const s = num(it.suma)
  return s == null ? null : toC(s)
}
export const lineTotal = (it) => { const c = lineCents(it); return c == null ? null : c / 100 }
/** Započítava sa do súčtu? Nie: Neúčtovať, Cenník (bežná cena), Pravdepodobne …, Nepriradené k bytu. */
export const counted = (it) => !(it.stav === 'Neúčtovať' || it.stav === 'Cenník (bežná cena)' || it.stav === 'Nepriradené k bytu' || isProbable(it.stav))
/** Počíta sa, ale nemá sumu → „bez sumy“ (žlto). */
export const missingAmount = (it) => counted(it) && lineCents(it) == null

const NB = ' '
/** 1 234,56 € (pevná medzera, deterministické na serveri aj v prehliadači) */
export function eurC(cents) {
  const neg = cents < 0, a = Math.abs(Math.round(cents))
  const i = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NB)
  return `${neg && a ? '−' : ''}${i},${pad(a % 100)}${NB}€`
}
/** Číslo do poľa: 12,5 (desatinná čiarka) */
export const decStr = (v, digits = 2) => { const n = num(v); return n == null ? '' : n.toFixed(digits).replace('.', ',') }

// ——— Firma bytu ———
/** Firma z tagu listingu v Guesty: „LIVE-IN Management s.r.o.“, „LIVE - IN Slovakia s.r.o.“ … */
export function firmFromTags(tags) {
  for (const t of tags || []) {
    const x = String(t || '').toLowerCase().replace(/[\s-]+/g, '')
    if (!x.includes('livein')) continue
    if (x.includes('management')) return 'M'
    if (x.includes('international')) return 'I'
    if (x.includes('slovakia')) return 'S'
  }
  return ''
}
/** [[názov, kód]] z listingov Guesty (public.listings): len byty s jasnou firmou, bez Košíc. */
export function guestyFirmList(listings) {
  const out = []
  for (const l of listings || []) { const f = firmFromTags(l.tags); if (f && l.name && !isKosice(l.name, l.city)) out.push([l.name, f]) }
  return out
}
const normTokens = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
/** Dopočíta firmu podľa prvých 4 písmen ulice a ďalších slov názvu (rímske I/II k číslam 1/2). '' = nejednoznačné. */
export function autoFirm(byt, list) {
  const t = normTokens(byt)
  if (!t.length) return ''
  const st = t[0].slice(0, 4)
  let best = -1, found = new Set()
  for (const [name, firm] of list) {
    const e = normTokens(name)
    if (!e.length || e[0].slice(0, 4) !== st) continue
    let sc = 0
    for (const x of t.slice(1)) { const y = x === '1' ? ['1', 'i'] : x === '2' ? ['2', 'ii'] : [x]; if (y.some((z) => e.includes(z))) sc++ }
    if (sc > best) { best = sc; found = new Set([firm]) } else if (sc === best) found.add(firm)
  }
  return found.size === 1 ? [...found][0] : ''
}
/** Firma riadku: vyplnená → tá; inak z Guesty; inak zo statického zoznamu z prototypu; inak 'x'. */
export function firmOf(it, lists = {}) {
  if (it && it.firma && FIRM_CODE[it.firma]) return FIRM_CODE[it.firma]
  const byt = it && it.byt
  return autoFirm(byt, lists.guesty || []) || autoFirm(byt, APTS) || 'x'
}
/** Firma celého bytu: prvá výslovne zadaná firma na ktoromkoľvek riadku, inak dopočítaná z názvu. */
export function aptFirm(items, lists = {}) {
  const explicit = items.find((x) => x.firma && FIRM_CODE[x.firma])
  if (explicit) return FIRM_CODE[explicit.firma]
  const real = items.find((x) => x.byt)
  return real ? firmOf(real, lists) : 'x'
}

/** Košické byty (KE) sa v module nezobrazujú. */
export const isKosice = (name, city) => /^\s*KE\s*[:\-–]/i.test(String(name || '')) || /ko[sš]ic/i.test(String(city || ''))

// ——— Skupiny, karty, medzisúčty ———
export function isNew(it) {
  if (it.typ === 'novy') return true
  if (it.typ === 'existujuci') return false
  return NEW_BYTY.includes(it.byt) || String(it.kat || '').startsWith('Nový byt') || String(it.kat || '').startsWith('Modrá guľa –')
}
/** Časť bytu: zadaná, alebo pri Kristíne Dicer z predpony položky („Záhradnícka 52: …“). */
export function castOf(it) {
  if (it.cast) return it.cast
  if (String(it.byt || '').startsWith('Kristína Dicer')) { const m = /^([^:]+):/.exec(it.polozka || ''); return m ? m[1].trim() : '' }
  return ''
}
/** N = nové byty, E = existujúce, B = bežné položky (cenník), O = nepriradené */
export function groupOf(it) {
  if (!it.byt && it.kat === CENNIK_KAT) return 'B'
  if (!it.byt) return 'O'
  return isNew(it) ? 'N' : 'E'
}
const skCmp = (a, b) => String(a).localeCompare(String(b), 'sk', { numeric: true })
const sumCounted = (arr) => arr.reduce((t, it) => { const c = lineCents(it); return t + (counted(it) && c != null ? c : 0) }, 0)

/** Karta bytu: súčet, počty a medzisúčty častí. */
export function aptCard(name, group, list, lists = {}) {
  const items = [...list].sort((a, b) => katOrder(a.kat) - katOrder(b.kat) || (num(a.ord) || 0) - (num(b.ord) || 0))
  let miss = 0, patrik = 0, zistit = 0
  for (const it of items) { if (missingAmount(it)) miss++; if (it.stav === 'Čaká na Patrika (cena opravy)') patrik++; if (it.zistit) zistit++ }
  let subs = null
  if (items.some((x) => castOf(x))) {
    const m = new Map()
    for (const it of items) { const c = castOf(it) || NO_PART; if (!m.has(c)) m.set(c, []); m.get(c).push(it) }
    subs = [...m.entries()]
      .sort((a, b) => (a[0].startsWith('Spoločné') ? 1 : 0) - (b[0].startsWith('Spoločné') ? 1 : 0) || skCmp(a[0], b[0]))
      .map(([n, arr]) => ({ name: n, sumC: sumCounted(arr), items: arr }))
  }
  const real = group === 'B' || group === 'O' ? null : aptFirm(items, lists)
  return { key: `${group}:${name}`, name, group, items, sumC: sumCounted(items), count: items.length, miss, patrik, zistit, subs, firm: real, byt: items.find((x) => x.byt) ? items.find((x) => x.byt).byt : '' }
}
/** Skupiny v poradí: Nové byty, Existujúce byty, Bežné položky (bez súčtu), Nepriradené. */
export function buildGroups(items, lists = {}) {
  const g = { N: {}, E: {}, B: {}, O: {} }
  for (const it of items) {
    const k = groupOf(it)
    const name = k === 'B' ? GROUP_B : k === 'O' ? GROUP_O : it.byt
    ;(g[k][name] = g[k][name] || []).push(it)
  }
  const out = {}
  for (const k of ['N', 'E', 'B', 'O']) out[k] = Object.keys(g[k]).sort(skCmp).map((n) => aptCard(n, k, g[k][n], lists))
  return out
}
/** Hlavička: súčet za mesiac, nové / existujúce, počet bytov, bez sumy, čaká na Patrika, treba zistiť. */
export function billingStats(items) {
  let sumC = 0, newC = 0, exC = 0, missing = 0, patrik = 0, zistit = 0
  const apts = new Set()
  for (const it of items) {
    const c = lineCents(it)
    if (counted(it)) { if (c != null) { sumC += c; if (it.byt) { if (isNew(it)) newC += c; else exC += c } } else missing++ }
    if (it.stav === 'Čaká na Patrika (cena opravy)') patrik++
    if (it.zistit) zistit++
    if (it.byt) apts.add(it.byt)
  }
  return { sumC, newC, exC, missing, patrik, zistit, apts: apts.size }
}
/** Filter: hľadanie, firma (M/I/S/x), stav. */
export function matchItem(it, { q = '', firma = '', stav = '' } = {}, lists = {}) {
  if (stav && it.stav !== stav) return false
  if (firma && (!it.byt || firmOf(it, lists) !== firma)) return false
  const t = String(q || '').trim().toLowerCase()
  if (t && !`${it.byt} ${it.polozka} ${it.pozn || ''} ${it.zistit || ''}`.toLowerCase().includes(t)) return false
  return true
}

// ——— Úpravy riadku (validácia na serveri aj v klientovi) ———
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
/** Overí a vyčistí zmenu riadku. Neznáme polia sa zahodia. Vracia { patch } alebo { error }. */
export function cleanPatch(raw) {
  const p = {}
  const r = raw || {}
  const text = { byt: 160, cast: 160, kat: 160, polozka: 800, pozn: 3000, zistit: 400, asana: 300 }
  for (const k of Object.keys(text)) if (k in r) p[k] = k === 'byt' || k === 'kat' || k === 'polozka' ? str(r[k], text[k]) : str(r[k], text[k]) || null
  for (const k of ['ks', 'cena', 'suma', 'ord']) if (k in r) {
    const n = num(r[k])
    if (r[k] !== null && r[k] !== '' && r[k] !== undefined && n == null) return { error: `Pole „${k}“ nie je číslo.` }
    if (n != null && Math.abs(n) > 10000000) return { error: `Pole „${k}“ je mimo rozsahu.` }
    if (k === 'ord' && n == null) continue
    p[k] = n
  }
  if ('stav' in r) { if (!validStav(r.stav)) return { error: 'Neplatný stav.' }; p.stav = r.stav }
  if ('firma' in r) { if (r.firma && !FIRM_DB[FIRM_CODE[r.firma]]) return { error: 'Neplatná firma.' }; p.firma = r.firma ? FIRM_DB[FIRM_CODE[r.firma]] : null }
  if ('typ' in r) { if (r.typ && !['novy', 'existujuci'].includes(r.typ)) return { error: 'Neplatný typ.' }; p.typ = r.typ || null }
  if ('datum' in r) { if (r.datum && !/^\d{4}-\d{2}-\d{2}$/.test(r.datum)) return { error: 'Dátum musí byť vo tvare RRRR-MM-DD.' }; p.datum = r.datum || null }
  if ('foto' in r) p.foto = (Array.isArray(r.foto) ? r.foto : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 40)
  return { patch: p }
}
/** Pravidlo z prototypu: keď je ks aj cena a stav bol „Doplniť sumu“, prepne sa na „Suma OK“. Zadaná celková suma (cena sa vymaže) tiež dá „Suma OK“, okrem duplicity. */
export function autoStav(current, patch) {
  const out = { ...patch }
  if (!('stav' in patch)) {
    const m = { ...current, ...patch }
    if (('cena' in patch || 'ks' in patch) && num(m.ks) != null && num(m.cena) != null && m.stav === 'Doplniť sumu') out.stav = 'Suma OK'
    if ('suma' in patch && patch.suma != null && patch.cena === null && m.stav !== 'Skontrolovať duplicitu' && m.stav !== 'Neúčtovať') out.stav = 'Suma OK'
  }
  return out
}

// ——— Nový mesiac ———
/** Riadky so stavom „Pravdepodobne [mesiac nového obdobia]“ sa prenesú; stav sa prepočíta podľa toho, či je suma známa. */
export function carryOver(items, newMonthYmd) {
  const label = `Pravdepodobne ${monthName(newMonthYmd)}`
  return items.filter((it) => it.stav === label).map((it) => ({ id: it.id, stav: lineCents(it) != null ? 'Suma OK' : 'Doplniť sumu' }))
}
/** Riadky cenníka pre nové obdobie: z aktívnych položiek price_list. */
export function priceRows(priceList) {
  return (priceList || []).filter((p) => p.active !== false).map((p, i) => ({
    byt: '', kat: CENNIK_KAT, polozka: p.obchod ? `${p.polozka} (${p.obchod})` : p.polozka, ks: 1, cena: num(p.cena), stav: 'Cenník (bežná cena)',
    pozn: p.poznamka || 'Bežná cena za kus/balenie – na fakturáciu', ord: 900 + i,
  }))
}
/** Z riadku cenníka v období: „Sprchová hlavica s hadicou (OBI)“ → { polozka, obchod }. */
export function splitShop(polozka) {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(String(polozka || '').trim())
  return m ? { polozka: m[1].trim(), obchod: m[2].trim() } : { polozka: String(polozka || '').trim(), obchod: null }
}

// ——— Kalkulačka prádla ———
// Ceny: Horeca s DPH po zľave (zadanie). Sady na lôžko: A = posteľ s veľkým paplónom, B = posteľ s 2 malými paplónmi, C = rozťahovací gauč.
export const LINEN = [
  { id: 'pillow', name: 'vankúš 70×90', price: 14.07 },
  { id: 'pillowcase', name: 'obliečka na vankúš', price: 3.25 },
  { id: 'duvetL', name: 'paplón 200×220', price: 27.68 },
  { id: 'duvetcaseL', name: 'obliečka 200×220', price: 22.69 },
  { id: 'duvetS', name: 'paplón 140×200', price: 18.94 },
  { id: 'duvetcaseS', name: 'obliečka 140×200', price: 14.07 },
  { id: 'sheet', name: 'plachta 180×200', price: 17.71 },
  { id: 'protector', name: 'chránič 180×200', price: 14.39 },
  { id: 'bathtowel', name: 'osuška 70×140', price: 6.31 },
  { id: 'towel', name: 'uterák 50×100', price: 3.25 },
  { id: 'bathmat', name: 'predložka 50×70', price: 3.1 },
]
export const LINEN_SETS = {
  A: { label: 'A: posteľ, veľký paplón', pillow: 2, pillowcase: 6, duvetL: 1, duvetcaseL: 3, sheet: 3, protector: 1, bathtowel: 6, towel: 6 },
  B: { label: 'B: posteľ, 2 malé paplóny', pillow: 2, pillowcase: 6, duvetS: 2, duvetcaseS: 6, sheet: 3, protector: 1, bathtowel: 6, towel: 6 },
  C: { label: 'C: rozťahovací gauč', pillow: 2, pillowcase: 4, duvetL: 1, duvetcaseL: 2, sheet: 2, protector: 0, bathtowel: 4, towel: 4 },
}
export const LINEN_PRESETS = { '4': { label: 'Byt pre 4 osoby (A + C)', beds: { A: 1, B: 0, C: 1 } }, '2': { label: 'Byt pre 2 osoby (B)', beds: { A: 0, B: 1, C: 0 } } }
export const BATHMATS_PER_BATHROOM = 3

/** Čo treba na jeden byt: počty kusov podľa lôžok (sady A/B/C) a kúpeľní. */
export function linenNeeds({ beds = {}, bathrooms = 1 } = {}) {
  const need = {}
  for (const l of LINEN) need[l.id] = 0
  for (const k of ['A', 'B', 'C']) { const n = Math.max(0, Math.floor(Number(beds[k]) || 0)); for (const l of LINEN) need[l.id] += n * (LINEN_SETS[k][l.id] || 0) }
  need.bathmat = BATHMATS_PER_BATHROOM * Math.max(0, Math.floor(Number(bathrooms) || 0))
  return need
}
/** Riadky prádla do vyúčtovania: potreba − to, čo mal majiteľ (na byt), × počet bytov. */
export function linenRows({ beds, bathrooms = 1, owned = {}, apartments = 1 } = {}) {
  const need = linenNeeds({ beds, bathrooms })
  const n = Math.max(1, Math.floor(Number(apartments) || 1))
  const per = Object.fromEntries(LINEN.map((l) => [l.id, Math.max(0, need[l.id] - Math.max(0, Math.floor(Number(owned[l.id]) || 0)))]))
  const rows = LINEN.filter((l) => per[l.id] > 0).map((l) => ({ id: l.id, polozka: `Prádlo Horeca: ${l.name}`, ks: per[l.id] * n, cena: l.price, sumC: toC(per[l.id] * n * l.price) }))
  const perC = LINEN.reduce((t, l) => t + toC(per[l.id] * l.price), 0)
  return { rows, perApartmentC: perC, totalC: rows.reduce((t, r) => t + r.sumC, 0), apartments: n, per }
}

/** Poznámka k riadkom prádla: čo – pre koho – čo mal majiteľ. */
export function linenNote({ beds = {}, bathrooms = 1, owned = {}, apartments = 1 } = {}) {
  const parts = ['A', 'B', 'C'].filter((k) => Number(beds[k]) > 0).map((k) => `${Number(beds[k])}× ${LINEN_SETS[k].label}`)
  const own = LINEN.filter((l) => Number(owned[l.id]) > 0).map((l) => `${Number(owned[l.id])}× ${l.name}`)
  const n = Math.max(1, Math.floor(Number(apartments) || 1))
  return `Ceny Horeca s DPH po zľave. Sada na byt: ${parts.join(' + ') || 'bez lôžok'}, ${Math.max(0, Math.floor(Number(bathrooms) || 0))} kúpeľ${Math.floor(Number(bathrooms) || 0) === 1 ? 'ňa' : 'ne'}${n > 1 ? `, počet bytov ${n}` : ''}.${own.length ? ` Odpočítané, čo mal majiteľ (na byt): ${own.join(', ')}.` : ''}`
}

// ——— Export: riadky hárkov (balíčkuje ich lib/xlsx-lite.js) ———
export const asanaUrl = (a) => (!a ? '' : /^https?:/i.test(a) ? a : `https://app.asana.com/0/0/${a}`)
const eurNum = (c) => c / 100
/** Dáta pre dva hárky ako v Vyuctovanie_oktober_2026.xlsx: „Prehľad“ a „Položky po bytoch“. */
export function exportSheets(monthYmd, items, lists = {}) {
  const groups = buildGroups(items, lists)
  const label = monthLabel(monthYmd)
  const S = { head: 'head', aptRow: 'apt', partRow: 'part', money: 'money', moneyApt: 'moneyApt', moneyPart: 'moneyPart', num: 'num', bold: 'bold', title: 'title', moneyBold: 'moneyBold' }
  // Prehľad
  const ov = [[{ v: `Vyúčtovanie ${label} – prehľad po bytoch`, s: S.title }], []]
  ov.push(['Typ', 'Byt', 'Firma', 'Suma €', 'Položiek', 'Bez sumy', 'Čaká na Patrika', 'Treba zistiť'].map((v) => ({ v, s: S.head })))
  let total = 0
  for (const [g, typ] of [['N', 'Nový byt'], ['E', 'Existujúci'], ['O', 'Nepriradené']]) for (const a of groups[g]) {
    total += a.sumC
    ov.push([typ, a.name, FIRM_FULL[a.firm] || '', { v: eurNum(a.sumC), s: S.money }, a.count, a.miss, a.patrik, a.zistit])
    if (a.subs) for (const sb of a.subs) ov.push([null, `   ↳ ${sb.name}`, null, { v: eurNum(sb.sumC), s: S.money }])
  }
  ov.push([], [null, { v: 'SPOLU (bez cenníka)', s: S.bold }, null, { v: eurNum(total), s: S.moneyBold }])
  // Položky po bytoch
  const it = [['Byt / časť', 'Kategória', 'Položka', 'Ks', 'Cena/ks €', 'Suma €', 'Stav', 'Poznámka', 'Zistiť od', 'Asana'].map((v) => ({ v, s: S.head }))]
  const itemRow = (x) => { const c = lineCents(x); return [null, x.kat || 'Iné', x.polozka, num(x.ks), num(x.cena) == null ? null : { v: num(x.cena), s: S.num }, c == null ? null : { v: eurNum(c), s: S.money }, x.stav, x.pozn || null, x.zistit || null, asanaUrl(x.asana) || null] }
  for (const g of ['N', 'E', 'O', 'B']) for (const a of groups[g]) {
    const head = g === 'B' ? a.name : `${a.name}  (${FIRM_FULL[a.firm] || ''})`
    it.push([{ v: head, s: S.aptRow }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }, g === 'B' ? { v: null, s: S.aptRow } : { v: eurNum(a.sumC), s: S.moneyApt }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }, { v: null, s: S.aptRow }])
    if (a.subs) for (const sb of a.subs) {
      it.push([{ v: `  ${sb.name}`, s: S.partRow }, { v: null, s: S.partRow }, { v: null, s: S.partRow }, { v: null, s: S.partRow }, { v: null, s: S.partRow }, { v: eurNum(sb.sumC), s: S.moneyPart }, { v: null, s: S.partRow }, { v: null, s: S.partRow }, { v: null, s: S.partRow }, { v: null, s: S.partRow }])
      for (const x of sb.items) it.push(itemRow(x))
    } else for (const x of a.items) it.push(itemRow(x))
  }
  return [
    { name: 'Prehľad', cols: [12, 48, 24, 14, 10, 10, 15, 13], rows: ov },
    { name: 'Položky po bytoch', cols: [40, 26, 50, 6, 10, 12, 24, 50, 30, 30], freeze: true, rows: it },
  ]
}
export const exportFileName = (monthYmd) => `Vyuctovanie_${monthName(monthYmd).normalize('NFD').replace(/[̀-ͯ]/g, '')}_${String(monthYmd).slice(0, 4)}.xlsx`

// ——— Zoznam bytov a firiem z prototypu (fallback, keď Guesty byt nenájde) ———
export const APTS = [
  ["Antolská 2", "M"], ["Kristína Dicer (Záhradnícka 52 + Miletičova 38)", "M"], ["Dunajská 66", "M"], ["29. Augusta, Grand", "I"],
  ["Dobrovského, Spacious", "I"], ["Dunajská, 1: The Historical", "I"], ["Dunajská, 2: The Elegant", "I"], ["Dunajská, 3: The Modern", "I"],
  ["Ferienčikova A", "I"], ["Ferienčikova B", "I"], ["Gorkého A, Family", "I"], ["Gorkého B, Luxe", "I"],
  ["Gross. 23, Central", "I"], ["Gross. 38, Elegant", "I"], ["Pionierska B, Family", "I"], ["Pribinová, Luxury", "I"],
  ["Strakova, Exclusive", "I"], ["Ventúrs. A, Charming", "I"], ["Ventúrska B, Urban", "I"], ["Vysoká, President", "I"],
  ["Zahradnícka, Paradis", "I"], ["Zámocká, Family", "I"], ["Žižkova, Riverside", "I"], ["Eurovea, 1 Danube", "S"],
  ["Eurovea, 2 Sky", "S"], ["Eurovea, 3 River", "S"], ["Lermont. C, Modern", "S"], ["Lermont. D, Garden", "S"],
  ["Bajkalská, Luxe", "M"], ["Baštová, Mi Apt.", "M"], ["Bernolákova, Sunny", "M"], ["Chalupkova, Modern", "M"],
  ["Dohnanyho, Unique", "M"], ["Družstevná, Colorful", "M"], ["Dunajská A, Danube", "M"], ["Dunajská B, White", "M"],
  ["Dunajská C, Sophisticated", "M"], ["E. Wenzla, Business", "M"], ["Eurovea, Luxus", "M"], ["Floriánska, Castle", "M"],
  ["Gorkeho C, Lime", "M"], ["Green Atrium, Brand", "M"], ["Gunduličova B, Boutique", "M"], ["Heuhaus A, Central", "M"],
  ["Heuhaus B, Scandi", "M"], ["Heuhaus Paradise 1", "M"], ["Heuhaus Paradise 2", "M"], ["Hlavatého, Art", "M"],
  ["Hrobákova, Family", "M"], ["Ivanská, Airport", "M"], ["Jarabinková B,Bright", "M"], ["Jelšová, Horizon", "M"],
  ["Jungmannova, City", "M"], ["Jégého A, Premium", "M"], ["Jégého B, Modern", "M"], ["Klariská, Historical", "M"],
  ["Koceľova, Homely", "M"], ["Konventna, Double", "M"], ["Kopčianka, Haven", "M"], ["Krížna, Suites", "M"],
  ["Landererova, Panor.", "M"], ["Mestská, Modern", "M"], ["Mickie. A, Modern", "M"], ["Mickie. B , Stylish", "M"],
  ["Modrá Guľa 1:  Light (2nd Floor)", "M"], ["Modrá Guľa 3: Bright (4th floor)", "M"], ["Moskovská, Classic", "M"], ["Moyzesova, Spacious", "M"],
  ["Na Revíne, Cloud", "M"], ["Nam. 1. mája, Flagship", "M"], ["Obchodná A, Wooden", "M"], ["Obchodná B, Romantic", "M"],
  ["Odborárska, Stylish", "M"], ["Odborárske, Loft", "M"], ["Pionierska A, Retreat", "M"], ["Pionierska C, Large", "M"],
  ["Poštová, Heart", "M"], ["Poštová, Shopping", "M"], ["Pražská, Panorama", "M"], ["Sienkiewiczova, Nordic", "M"],
  ["Skalická 3A, Bright", "M"], ["Skalická 3B, Shiny", "M"], ["Skypark Luxe I", "M"], ["Skypark Luxe II", "M"],
  ["Skypark, Elegant", "M"], ["Skypark, Elite", "M"], ["Skypark, Golden", "M"], ["Skypark, Haven", "M"],
  ["Skypark, Luxury I", "M"], ["Skypark, Luxury II", "M"], ["Skypark, Modern", "M"], ["Skypark, Royal", "M"],
  ["Tomášikova, Family", "M"], ["Tri Veže, Sky", "M"], ["Trnavská A, Fabulous", "M"], ["Trnavská B, Sunny", "M"],
  ["Vajnorská, Terrazzo", "M"], ["Vienna Gate, Bright", "M"], ["Vyšehradská, Spacious", "M"], ["Zochova, Vintage", "M"],
  ["Závodná, Panoramic", "M"], ["Šancová, Design", "M"], ["Šoltésovej, Bus", "M"], ["Štef., City Heart", "M"],
  ["Šustekova, Sky", "M"], ["Žilinska A, Castle", "M"], ["Žilinska B, Urban", "M"], ["Žilinská C, Art-touched", "M"],
  ["Hrubá Borša, Nature", "M"], ["TT: Pekárska, Modern", "M"], ["TT: V. Clementisa, Bright", "M"], ["TT: Športová, Little Rome", "M"],
]
