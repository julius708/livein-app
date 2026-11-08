// Digitálny sprievodca bytom a QR nálepky: čistá logika bez DB (testovateľná).
export const TEMPLATE_VERSION = 1
export const GUIDE_ROLES = ['admin', 'operations', 'customer_service']
export const canGuide = (me) => !!(me && (me.roles || []).some((r) => GUIDE_ROLES.includes(r)))

/** Abeceda bez zameniteľných znakov (0/O, 1/l/I). 8 znakov = 29^8 ≈ 5×10^11 kombinácií. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345679'
export const CODE_LENGTH = 8
export function randomCode(len = CODE_LENGTH) {
  const a = new Uint8Array(len * 2); crypto.getRandomValues(a)
  let out = ''
  for (let i = 0; i < a.length && out.length < len; i++) { const v = a[i]; if (v < 256 - (256 % CODE_ALPHABET.length)) out += CODE_ALPHABET[v % CODE_ALPHABET.length] }
  return out.length === len ? out : randomCode(len)
}
export const isCode = (s) => typeof s === 'string' && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(s)
/** Verejné odkazy: iba trvalé HTTPS s verejným kódom. */
export const guideUrl = (base, code) => `${String(base).replace(/\/+$/, '')}/g/${code}`
export const reviewUrl = (base, code) => `${guideUrl(base, code)}/recenzia`

/** Overenie Wi-Fi: rezervácia musí patriť k tomu istému bytu, byť aktívna a e-mail musí sedieť. Vracia len ok/false, dôvod je interný. */
export function wifiDecision({ unit, reservation, email, today }) {
  const em = String(email || '').trim().toLowerCase()
  if (!unit || !reservation || !em) return { ok: false, why: 'missing' }
  if (String(reservation.listingId || '') !== String(unit.listing_id)) return { ok: false, why: 'other_unit' }
  if (!['confirmed', 'checked_in'].includes(String(reservation.status || '').toLowerCase())) return { ok: false, why: 'status' }
  const d = today || new Date().toISOString().slice(0, 10)
  const ci = String(reservation.checkIn || '').slice(0, 10), co = String(reservation.checkOut || '').slice(0, 10)
  if (!ci || !co || d < ci || d >= co) return { ok: false, why: 'inactive' }
  const emails = [reservation.guestEmail, ...(reservation.guestEmails || [])].filter(Boolean).map((x) => String(x).trim().toLowerCase())
  if (!emails.includes(em)) return { ok: false, why: 'email' }
  return { ok: true, reservationId: reservation.id }
}

/** Limity pokusov na viacerých úrovniach (IP, rezervácia, byt). attempts = počty v okne. */
export const WIFI_LIMITS = { ip: { max: 10, minutes: 15 }, reservation: { max: 5, minutes: 60 }, unit: { max: 40, minutes: 60 } }
export function rateLimited(counts, limits = WIFI_LIMITS) {
  return Object.keys(limits).some((k) => Number(counts[k] || 0) >= limits[k].max)
}
/** Log bez PII: iba výsledok, kód bytu a čas. */
export function anonLog({ code, outcome, at = new Date().toISOString() }) {
  return { code: String(code || '').slice(0, 8), outcome: ['success', 'fail', 'limited', 'error'].includes(outcome) ? outcome : 'fail', at }
}

/** Podmienky vydania štítku (všetky musia platiť). */
export function issuePlan({ unit, card, support_phone, links, existing = [], templateVersion = TEMPLATE_VERSION }) {
  const reasons = []
  if (!unit || !unit.listing_id || !unit.listing_verified) reasons.push('neoverené Guesty ID')
  if (!(card && card.address) && !(unit && unit.address)) reasons.push('chýba adresa')
  if (!unit || !isCode(unit.public_code)) reasons.push('chýba verejný kód')
  if (!String(support_phone || '').trim()) reasons.push('chýba overené číslo podpory')
  if (!(links && links.guide_ok)) reasons.push('odkaz sprievodcu nefunguje')
  if (!(links && links.review_ok)) reasons.push('odkaz spätnej väzby nefunguje')
  if (!(unit && /^https:\/\//.test(String(unit.gbp_url || '')))) reasons.push('chýba schválený odkaz Google Business Profile')
  if (reasons.length) return { issue: false, status: 'review', reasons }
  const already = (existing || []).find((e) => String(e.listing_id) === String(unit.listing_id) && Number(e.template_version) === Number(templateVersion))
  if (already) return { issue: false, status: 'issued', reasons: [], existing: already, notify: !already.notified_at }
  return { issue: true, status: 'ready', reasons: [], key: `${unit.listing_id}:${templateVersion}`, notify: true }
}

/** Podujatia: skončené sa skryjú automaticky. */
export const visibleEvents = (events, now = Date.now()) => (events || []).filter((e) => e.active !== false && (!e.ends_at || Date.parse(e.ends_at) >= now)).sort((a, b) => Date.parse(a.starts_at || 0) - Date.parse(b.starts_at || 0))

/** Pravidlá: spoločné + výnimka bytu nahrádza spoločné (ak je). */
export function effectiveRules(common, override, lang = 'sk') {
  const o = override && override[lang] && String(override[lang]).trim()
  if (o) return o
  return (common || []).map((r) => (r.body && r.body[lang]) || '').filter(Boolean).join('\n')
}

/** Normalizácia adresy na párovanie Prílohy A s registrom (bez diakritiky, PSČ, štátu a mestskej časti). */
export function addressKey(s) {
  let t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  t = t.replace(/apartmanovy dom [^,]+,/g, '').replace(/\b\d{3} ?\d{2}\b/g, '').replace(/slovakia|slovensko|old town|stare mesto|nove mesto|bratislavsky kraj|bratislava region|kosice region|kosicky kraj/g, '')
  t = t.replace(/\b(bratislava|kosice|trnava|hruba borsa)\b[^,]*/g, '')
  const first = t.split(',').map((x) => x.trim()).filter(Boolean)[0] || ''
  return first.replace(/\b(\d+)\/(\d+)\b/g, '$2').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
/** Páruje karty z Prílohy A s registrom podľa adresy. Jedna adresa môže mať viac jednotiek: jednoznačné = 1 karta ↔ 1 byt. */
export function matchCards(cards, apartments) {
  const byKey = new Map()
  for (const a of apartments) { const k = addressKey(a.a || a.address); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(a) }
  const cardsByKey = new Map()
  for (const c of cards) { const k = addressKey(c.address_full || c.address_key); if (!cardsByKey.has(k)) cardsByKey.set(k, []); cardsByKey.get(k).push(c) }
  const out = []
  for (const [k, cs] of cardsByKey) {
    const apts = byKey.get(k) || []
    if (apts.length === 1 && cs.length === 1) out.push({ status: 'matched', listing_id: apts[0].id || apts[0].guesty_id, card: cs[0], apartment: apts[0] })
    else if (!apts.length) out.push({ status: 'unmatched', card: cs[0], cards: cs, reason: 'adresa nie je v registri' })
    else out.push({ status: 'review', cards: cs, apartments: apts, reason: `${cs.length} kariet pre ${apts.length} jednotiek na adrese` })
  }
  return out
}
