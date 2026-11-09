// Sprievodca bytom – čistá logika obsahu: čistenie kódov a hesiel, detekcia jazyka, štruktúra sekcií, úplnosť karty.
// Bez závislostí, testovateľné (tests/guide-content.test.mjs).

/** Vstupné kódy, PIN-y a heslá do sprievodcu nepatria: nahradia sa zástupným textom (kód dostane hosť v správe pred príchodom). */
export const CODE_PLACEHOLDER = { sk: '[kód dostanete v správe pred príchodom]', en: '[you will receive the code in a message before arrival]' }
const CODE_RE = [
  /\b(k[oó]d(?:om|u|y)?|code|pin|heslo|password|passcode|zámok|lock)\b[^0-9A-Za-z#*]{0,12}([0-9#*]{3,}[0-9A-Za-z#*]*)/gi,
  /\b[0-9]{4,8}\s*[#*]/g,
  /\bwifi\b[^\n]{0,40}(heslo|password)[^\n]*/gi,
]
export function stripCodes(text, lang = 'en') {
  let t = String(text || '')
  const ph = CODE_PLACEHOLDER[lang] || CODE_PLACEHOLDER.en
  for (const re of CODE_RE) t = t.replace(re, (m, a) => (a && /^(wifi)/i.test(m) ? ph : `${a || ''} ${ph}`.trim()))
  return t.replace(/[ \t]+\n/g, '\n').trim()
}
/** Vyzerá text ako slovenčina/čeština? (diakritika alebo typické slová) */
export const looksSlovak = (s) => /[áäčďéíĺľňóôŕšťúýž]/i.test(String(s || '')) || /\b(prosím|apartmán|kľúč|vchod|pri odchode|choďte|byt)\b/i.test(String(s || ''))
/** Text do dvojjazyčného objektu podľa detekcie jazyka; druhý jazyk ostáva prázdny (doplní AI alebo tím). */
export const bilingual = (text) => { const t = String(text || '').trim(); if (!t) return { sk: '', en: '' }; return looksSlovak(t) ? { sk: t, en: '' } : { sk: '', en: t } }

/** Kľúče sekcií v poradí, v akom sa zobrazujú hosťovi. */
export const SECTION_KEYS = ['apartment', 'appliances', 'heating', 'trash', 'house_rules', 'neighborhood', 'important']
export const SECTION_ICONS = { apartment: '🏠', appliances: '🔌', heating: '🌡️', trash: '🗑️', house_rules: '📋', neighborhood: '🗺️', important: '⚠️' }
const txt = (o, max = 2000) => ({ sk: String((o && o.sk) || '').trim().slice(0, max), en: String((o && o.en) || '').trim().slice(0, max) })
/** Vyčistí a overí sekcie (max 12 sekcií × 20 položiek, bez kódov). Neznáme kľúče ostanú, ale bez ikony. */
export function sanitizeSections(sections) {
  if (!Array.isArray(sections)) return []
  return sections.slice(0, 12).map((s) => {
    const key = String((s && s.key) || 'other').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30) || 'other'
    const items = (Array.isArray(s && s.items) ? s.items : []).slice(0, 20).map((it) => ({ title: txt(it && it.title, 120), body: { sk: stripCodes(txt(it && it.body).sk, 'sk'), en: stripCodes(txt(it && it.body).en, 'en') } })).filter((it) => it.title.sk || it.title.en || it.body.sk || it.body.en)
    return { key, icon: String((s && s.icon) || SECTION_ICONS[key] || '•').slice(0, 4), title: txt(s && s.title, 80), items }
  }).filter((s) => s.items.length && (s.title.sk || s.title.en))
}
const has2 = (o) => !!(o && (String(o.sk || '').trim() || String(o.en || '').trim()))
/** Úplnosť karty 0–100: čo hosť naozaj potrebuje. */
export function completeness({ unit = {}, card = {}, wifi = false } = {}) {
  const parts = [
    ['address', !!(card.address || unit.address), 15],
    ['wifi', !!wifi, 15],
    ['arrival', has2(card.arrival), 15],
    ['checkout', has2(card.checkout) || !!card.checkout_time, 10],
    ['parking', has2(card.parking), 10],
    ['help', has2(card.help), 5],
    ['sections', Array.isArray(card.sections) && card.sections.length >= 2, 15],
    ['approved', !!card.approved, 10],
    ['gbp', !!unit.gbp_url, 5],
  ]
  const score = parts.reduce((n, [, ok, w]) => n + (ok ? w : 0), 0)
  return { score, missing: parts.filter(([, ok]) => !ok).map(([k]) => k) }
}
/** Návrh karty z Guesty listingu (bez AI): texty bez kódov, dvojjazyčne podľa detekcie, štruktúrované sekcie z vybavenia. */
export function draftFromGuesty(l, { customFieldIds = {} } = {}) {
  const cf = {}; for (const c of l.customFields || []) { const id = c.fieldId && typeof c.fieldId === 'object' ? c.fieldId._id : c.fieldId; if (c.value != null && String(c.value).trim()) cf[String(id)] = String(c.value).trim() }
  const pickCf = (name) => cf[customFieldIds[name]] || ''
  const a = l.address || {}
  const ci = (l.checkInInstructions && l.checkInInstructions.notes) || ''
  const arrival = { sk: stripCodes(pickCf('checkin_sk'), 'sk'), en: stripCodes(ci, 'en') }
  const checkout = { sk: stripCodes(pickCf('checkout_sk'), 'sk'), en: stripCodes(l.checkOutInstructions || '', 'en') }
  const parking = bilingual(stripCodes(l.parkingInstructions || pickCf('parking') || ''))
  const important = [pickCf('important_sk'), l.houseManual || ''].filter(Boolean)
  const heating = pickCf('heating_sk')
  const sections = []
  const am = Array.isArray(l.amenities) ? l.amenities : []
  if (am.length) sections.push({ key: 'apartment', items: [{ title: { sk: 'Vybavenie', en: 'Amenities' }, body: { sk: '', en: am.join(' · ') } }, ...(l.accommodates ? [{ title: { sk: 'Kapacita', en: 'Capacity' }, body: { sk: `${l.accommodates} osôb · spální: ${l.bedrooms ?? '–'} · kúpeľní: ${l.bathrooms ?? '–'}`, en: `${l.accommodates} guests · bedrooms: ${l.bedrooms ?? '–'} · bathrooms: ${l.bathrooms ?? '–'}` } }] : [])] })
  if (heating) sections.push({ key: 'heating', items: [{ title: { sk: 'Kúrenie a teplá voda', en: 'Heating and hot water' }, body: bilingual(stripCodes(heating)) }] })
  if (l.trashCollectedOn) sections.push({ key: 'trash', items: [{ title: { sk: 'Odpad', en: 'Trash' }, body: bilingual(stripCodes(l.trashCollectedOn)) }] })
  if (l.publicDescription && l.publicDescription.houseRules) sections.push({ key: 'house_rules', items: [{ title: { sk: 'Pravidlá domu', en: 'House rules' }, body: bilingual(l.publicDescription.houseRules) }] })
  if (l.publicDescription && (l.publicDescription.neighborhood || l.publicDescription.transit)) sections.push({ key: 'neighborhood', items: [{ title: { sk: 'Okolie a doprava', en: 'Neighbourhood and transport' }, body: bilingual([l.publicDescription.neighborhood, l.publicDescription.transit].filter(Boolean).join('\n')) }] })
  if (important.length) sections.push({ key: 'important', items: important.map((t) => ({ title: { sk: 'Dôležité', en: 'Important' }, body: bilingual(stripCodes(t)) })) })
  return {
    address: a.full || null, lat: a.lat ?? null, lng: a.lng ?? null, city: a.city || null,
    checkin_time: l.defaultCheckInTime || null, checkout_time: l.defaultCheckOutTime || null,
    arrival, checkout, parking, sections: sanitizeSections(sections.map((s) => ({ ...s, title: SECTION_TITLES[s.key] }))),
    wifi: l.wifiName && l.wifiPassword ? { ssid: String(l.wifiName).trim(), password: String(l.wifiPassword).trim() } : null,
    raw: { summary: (l.publicDescription && l.publicDescription.summary) || '', notes: (l.publicDescription && l.publicDescription.notes) || '', houseManual: l.houseManual || '', petFee: pickCf('pet_fee') || '', checkInType: (l.checkInInstructions && l.checkInInstructions.primaryCheckIn) || '' },
  }
}
export const SECTION_TITLES = {
  apartment: { sk: 'Byt a vybavenie', en: 'Apartment and amenities' }, appliances: { sk: 'Spotrebiče a ako na to', en: 'Appliances and how-to' }, heating: { sk: 'Kúrenie a voda', en: 'Heating and water' },
  trash: { sk: 'Odpad', en: 'Trash' }, house_rules: { sk: 'Pravidlá domu', en: 'House rules' }, neighborhood: { sk: 'Okolie a doprava', en: 'Neighbourhood and transport' }, important: { sk: 'Dôležité informácie', en: 'Important information' },
}
/** Guesty custom fields účtu LIVE-IN (ID polí; názvy odvodené z obsahu 9. 11. 2026). Interné polia (posteľná bielizeň, zámky, kontrola kúrenia) sa neimportujú. */
export const GUESTY_CUSTOM_FIELDS = { checkin_sk: '68da7697f9ebcd00138bfb0e', checkout_sk: '69035407866182005abf8def', important_sk: '69035e07adf86800138ec6e6', heating_sk: '6ace549a63d93d0062e66f87', pet_fee: '6ab25e49606ef7001113bb02', parking: '6ad5e0a1b15caa0013e09b59' }
/** Overí, že výstup AI neobsahuje nič, čo vyzerá ako kód alebo heslo. */
export const containsCode = (s) => /\b(k[oó]d(?:om|u)?|code|pin|heslo|password)\b\s*[:=]?\s*(?:je\s+|is\s+)?[A-Za-z#*]*\d[A-Za-z0-9#*]{2,}/i.test(String(s || ''))
