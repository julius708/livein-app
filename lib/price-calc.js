// Kalkulačka ceny: čistá logika (bez Reactu a bez databázy), aby ju šlo testovať.
// Vzorce sú prevzaté z kalkulačky od Niny (18. 11. 2026) a nemenia sa; pribudli kontroly vstupov, varovania a texty.
//
//  - Slabá cena: najnižšia cena, pri ktorej majiteľ ešte dostane dovolené minimum (30 € / noc, pri R2R príspevok 25 € / noc).
//  - Silná cena: základná cena z PriceLabs × noci, po týždennej (7+) alebo mesačnej (28+) zľave, plus extra osoby plus upratovanie.
//  - Stredná cena: v polovici medzi slabou a silnou.
//  - Majiteľ dostane = cena bez mestskej dane − provízia LIVE-IN podľa modelu − DPH 5 % z ubytovania − upratovanie − materiál 0,70 € / hosť / noc.
//  - Všetky ceny sa zaokrúhľujú nahor na celé eurá. Mestská daň sa pripočíta navrch a ide celá mestu.

export const WEAK_MONTHS = [10, 11, 1, 2]
export const MATERIAL_PER_GUEST_NIGHT = 0.7
/** DPH 5 % je v cene ubytovania obsiahnutá: podiel DPH z ceny s DPH. */
export const VAT_SHARE = 5 / 105
export const STRONG_FLOOR = 1.15
export const UNSET_FEE = -1

const DAY = 86400000
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
const utc = (s) => new Date(`${s}T12:00:00Z`)

/** Počet nocí medzi dvoma ISO dátumami (0, ak je vstup neplatný). */
export function nightsBetween(checkIn, checkOut) {
  if (!isIso(checkIn) || !isIso(checkOut)) return 0
  return Math.round((utc(checkOut) - utc(checkIn)) / DAY)
}

export function addDaysIso(iso, n) {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Podiel nocí v slabom období (október, november, január, február). */
export function weakShare(checkIn, nights) {
  if (!isIso(checkIn) || nights < 1) return 0
  let w = 0
  for (let k = 0; k < nights; k++) if (WEAK_MONTHS.includes(utc(addDaysIso(checkIn, k)).getUTCMonth() + 1)) w++
  return w / nights
}

/** Majiteľ dostane = ca × cena bez dane + cb. Model: H = hosting (provízia + DPH), C = bez DPH, S = special client, R = R2R. */
export function ownerCoefficients(apt, nights, guests, cleanings) {
  const cl = apt.cleaning * cleanings
  const sup = MATERIAL_PER_GUEST_NIGHT * guests * nights
  const v = VAT_SHARE
  const L = apt.commission
  switch (apt.model) {
    case 'H': return [1 - L - v, cl * v - cl - sup]
    case 'C': return [1 - L, -cl - sup]
    case 'S': return [1, -cl]
    case 'R': return [1 - v, cl * v - cl - sup]
    default: throw new Error(`Neznámy model ${apt.model}`)
  }
}

/** Príplatok za extra osoby podľa PriceLabs (Extra Person Fee). */
export function extraPeople(apt, guests, nights) {
  const unset = apt.extraFee < 0
  const fee = Math.max(0, apt.extraFee || 0)
  const included = apt.includedGuests || apt.cap
  const extra = Math.max(0, guests - included)
  return { unset, fee, included, extra, total: fee * extra * nights, applies: fee > 0 && included < apt.cap }
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Výpočet troch cien pre jeden pobyt.
 * input: { apt, checkIn, checkOut, guests, cleanings, cityTaxOn, cityTaxRate }
 */
export function quote(input) {
  const apt = input.apt
  if (!apt) return { ok: false, error: 'Vyber apartmán.' }
  const nights = nightsBetween(input.checkIn, input.checkOut)
  if (nights < 1) return { ok: false, error: 'Odchod musí byť po príchode.' }
  const guests = clampInt(input.guests, 1, apt.cap, Math.min(2, apt.cap))
  const cleanings = clampInt(input.cleanings, 1, 99, 1)
  const rateIn = Number(input.cityTaxRate)
  const rate = Number.isFinite(rateIn) && rateIn >= 0 ? rateIn : apt.cityTax
  const taxOn = !!input.cityTaxOn
  const tax = taxOn ? rate * guests * nights : 0
  const [ca, cb] = ownerCoefficients(apt, nights, guests, cleanings)
  const own = (gross) => ca * gross + cb

  const weak = Math.ceil((apt.weakMin * nights - cb) / ca)
  const discPct = nights >= 28 ? apt.monthlyDisc : nights >= 7 ? apt.weeklyDisc : 0
  const xp = extraPeople(apt, guests, nights)
  const cleaningTotal = apt.cleaning * cleanings
  const fromBase = apt.basePrice ? Math.ceil(apt.basePrice * nights * (1 - discPct / 100) + xp.total + cleaningTotal) : null
  let strong = fromBase !== null ? fromBase : Math.ceil(weak * 1.5 + xp.total)
  const floorApplied = strong < weak * STRONG_FLOOR
  if (floorApplied) strong = Math.ceil(weak * STRONG_FLOOR)
  const mid = Math.ceil((weak + strong) / 2)

  const share = weakShare(input.checkIn, nights)
  const r2r = apt.model === 'R'
  const tier = (key, label, gross, hint) => {
    const o = own(gross)
    return { key, label, hint, gross, total: gross + tax, perNight: (gross + tax) / nights, grossPerNight: gross / nights, owner: o, ownerPerNight: o / nights, extraTotal: key === 'weak' ? 0 : xp.total }
  }
  const tiers = [
    tier('strong', 'Silná rezervácia', strong, 'Výhodné pre majiteľa.'),
    tier('mid', 'Stredná rezervácia', mid, 'Stále výhodné pre majiteľa.'),
    tier('weak', 'Slabá rezervácia', weak, r2r ? 'Pokrýva dovolené minimum (príspevok 25 € / noc).' : 'Pokrýva majiteľovi dovolené minimum (30 € / noc).'),
  ]

  const warnings = []
  if (xp.unset) warnings.push({ code: 'fee_unset', text: 'V PriceLabs nie je pri tomto byte nastavený príplatok za extra osobu. Over s Ninou.' })
  if (!apt.basePrice) warnings.push({ code: 'no_base', text: 'Pri tomto byte chýba základná cena z PriceLabs, silná cena je len odhad (1,5 × slabá).' })
  if (floorApplied && fromBase !== null) warnings.push({ code: 'floor', text: 'Silná cena z PriceLabs vyšla pod 115 % slabej, preto je zdvihnutá na 115 % slabej.' })
  if (weakShare(input.checkIn, nights) < 0.5) warnings.push({ code: 'not_weak_period', text: 'Termín nie je v slabom období (október, november, január, február): slabú cenu neponúkať.' })
  if (nights >= 60 && taxOn) warnings.push({ code: 'long_stay_tax', text: 'Pri pobyte 2 mesiace a viac sa mestská daň zvyčajne neúčtuje.' })
  if (nights >= 28 && cleanings === 1) warnings.push({ code: 'cleanings', text: 'Pri dlhom pobyte pridaj priebežné upratovania, ak ich hosť dostane.' })

  return {
    ok: true, apt, nights, guests, cleanings, tax, taxOn, taxRate: rate, weakShare: share, weakPeriod: share >= 0.5,
    r2r, ownerLabel: r2r ? 'Príspevok na nájom' : 'Majiteľ dostane', tiers, warnings, ownerOf: own,
    explain: { discPct, baseNightly: apt.basePrice, extra: xp, cleaningTotal, fromBase, floorApplied, ca, cb, weakFormula: `(${apt.weakMin} × ${nights} − (${round2(cb)})) / ${round4(ca)}` },
  }
}

const round2 = (v) => Math.round(v * 100) / 100
const round4 = (v) => Math.round(v * 10000) / 10000

/** Kontrola ceny z Guesty (celkom, vrátane mestskej dane, ak je zapnutá). */
export function checkGuestyPrice(q, price) {
  const p = Number(price)
  if (!q.ok || !(p > 0)) return null
  const gross = p - q.tax
  const [strong, mid, weak] = q.tiers
  const owner = q.ownerOf(gross)
  let level = 'bad'
  if (gross >= strong.gross) level = 'strong'
  else if (gross >= mid.gross) level = 'mid'
  else if (gross >= weak.gross) level = 'weak'
  return { level, price: p, gross, owner, ownerPerNight: owner / q.nights, minimum: weak.gross + q.tax, label: { strong: 'Silná', mid: 'Stredná', weak: 'Slabá', bad: 'Pod minimom' }[level] }
}

/** Skupiny číslic po troch s pevnou medzerou, deterministicky (rovnaký výstup na serveri aj v prehliadači). */
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
export const fmtEur = (v) => `${v < 0 ? '−' : ''}${group(String(Math.round(Math.abs(v))))} €`
export const fmtEur1 = (v) => {
  const a = Math.abs(v)
  const [i, d] = a.toFixed(1).split('.')
  return `${v < 0 && a >= 0.05 ? '−' : ''}${group(i)},${d} €`
}
export const nightsWord = (n) => (n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí')
export const guestsWord = (n) => (n === 1 ? 'hosť' : n < 5 ? 'hostia' : 'hostí')

const dmy = (iso) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`

/** Hotový text ponuky pre hosťa (len ceny pre hosťa, nič o majiteľovi ani o tieroch). */
export function guestOffer(q, tierKey, checkIn, checkOut, lang = 'sk') {
  if (!q.ok) return ''
  const t = q.tiers.find((x) => x.key === tierKey)
  if (!t) return ''
  const total = Math.round(t.total)
  const perNight = Math.round(t.perNight)
  if (lang === 'en') {
    return `${q.apt.name.replace(/^(KE|TT): ?/, '')}: ${dmy(checkIn)} – ${dmy(checkOut)}, ${q.nights} night${q.nights === 1 ? '' : 's'}, ${q.guests} guest${q.guests === 1 ? '' : 's'}.\nTotal price: ${total} EUR${q.taxOn ? ' (including city tax)' : ''}, about ${perNight} EUR per night.`
  }
  return `${q.apt.name.replace(/^(KE|TT): ?/, '')}: ${dmy(checkIn)} – ${dmy(checkOut)}, ${q.nights} ${nightsWord(q.nights)}, ${q.guests} ${guestsWord(q.guests)}.\nCena spolu: ${total} €${q.taxOn ? ' (vrátane mestskej dane)' : ''}, to je asi ${perNight} € za noc.`
}

/** Najmenšia suma, ktorú ešte ponúkneme do rezervácie (po odpočítaní upratovania zostane kladné ubytovanie). */
const round2n = (v) => Math.round(v * 100) / 100

/**
 * Odkaz do Zákazníckeho servisu na založenie rezervácie s vybranou cenou (CS formulár ju predvyplní a pracovník ju ešte potvrdí).
 * Cena v Guesty = ubytovanie + upratovanie; cena z kalkulačky (bez dane) obsahuje upratovanie, preto sa rozdelí.
 */
export function reservationLink(q, tierKey, checkIn, checkOut) {
  if (!q.ok || !q.apt.guestyId) return null
  const t = q.tiers.find((x) => x.key === tierKey)
  if (!t) return null
  const cleaning = q.apt.cleaning
  const accommodation = round2n(t.gross - cleaning)
  if (!(accommodation > 0)) return null
  const p = new URLSearchParams({ listing: q.apt.guestyId, od: checkIn, do: checkOut, hostia: String(q.guests), cena: String(accommodation), upratovanie: String(cleaning), dan: String(round2n(q.tax)), ponuka: t.label.replace(' rezervácia', '') })
  return `/cs/rezervacia?${p.toString()}`
}

/** Odkaz na Voľné apartmány v CS pre rovnaký termín (je byt voľný?). */
export function availabilityLink(checkIn, checkOut, guests) {
  if (!isIso(checkIn) || !isIso(checkOut)) return null
  return `/cs/volne?od=${checkIn}&do=${checkOut}&hostia=${guests}`
}

/** Počiatočný výber z adresy (odkaz z Voľných bytov): ?byt=<Guesty ID alebo názov>&od=&do=&hostia= */
export function parseInitial(apartments, sp, today) {
  const one = (k) => (typeof sp?.[k] === 'string' ? sp[k] : '')
  const key = one('byt').trim()
  const idx = key ? apartments.findIndex((a) => a.guestyId === key || a.name === key) : -1
  const od = isIso(one('od')) && one('od') >= today ? one('od') : null
  const doo = isIso(one('do')) && od && one('do') > od ? one('do') : null
  const g = Math.trunc(Number(one('hostia')))
  return { aptIdx: idx >= 0 ? idx : null, checkIn: od, checkOut: doo, guests: Number.isFinite(g) && g >= 1 ? g : null }
}
