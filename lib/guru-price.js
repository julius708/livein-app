// Guru vie počítať ceny: nástroj price_quote používa tú istú Kalkulačku ceny ako stránka /kalkulacka (rovnaké vzorce a tabuľka bytov).
import { APARTMENTS, PRICE_DATA_DATE } from './price-calc-data.js'
import { addDaysIso, nightsBetween, quote } from './price-calc.js'

export const PRICE_TOOL = {
  name: 'price_quote',
  description: 'Spočíta cenu pobytu v byte podľa Kalkulačky ceny LIVE-IN (silná, stredná a slabá cena; cena s mestskou daňou, na noc, a čo z nej dostane majiteľ). Použi pri otázkach typu "koľko stojí byt X od-do pre N hostí" alebo "je táto cena v poriadku". Čísla nikdy nevymýšľaj, vždy ich zisti týmto nástrojom. Hosťovi komunikuj len celkovú cenu, podiel majiteľa a typ ponuky sú interné.',
  input_schema: {
    type: 'object',
    properties: {
      apartment: { type: 'string', description: 'Názov (prezývka) bytu alebo jeho časť, napr. "Antolská" alebo "KE: Hlavná, Royal", prípadne Guesty ID.' },
      check_in: { type: 'string', description: 'Príchod YYYY-MM-DD.' },
      check_out: { type: 'string', description: 'Odchod YYYY-MM-DD (po príchode). Môžeš namiesto neho dať nights.' },
      nights: { type: 'integer', description: 'Počet nocí, ak nie je check_out.' },
      guests: { type: 'integer', description: 'Počet hostí (predvolene 2).' },
      city_tax: { type: 'boolean', description: 'Pripočítať mestskú daň (predvolene áno; pri pobyte 2 mesiace a viac zvyčajne nie).' },
      cleanings: { type: 'integer', description: 'Počet upratovaní (predvolene 1).' },
    },
    required: ['apartment', 'check_in'],
  },
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Nájde byt podľa názvu, časti názvu alebo Guesty ID: jeden zásah, inak zoznam kandidátov (nič sa nehádá). */
export function findApartment(query, apartments = APARTMENTS) {
  const raw = String(query || '').trim()
  const byId = apartments.find((a) => a.guestyId && a.guestyId === raw)
  if (byId) return { apt: byId }
  const q = norm(raw)
  if (!q) return { error: 'Chýba názov bytu.' }
  const exact = apartments.filter((a) => norm(a.name) === q)
  if (exact.length === 1) return { apt: exact[0] }
  const tokens = q.split(' ')
  const hits = apartments.filter((a) => tokens.every((t) => norm(a.name).includes(t)))
  if (hits.length === 1) return { apt: hits[0] }
  if (hits.length === 0) return { error: `Byt "${raw}" sa v tabuľke cien nenašiel.` }
  return { error: 'Viac bytov sa zhoduje, spresni názov.', candidates: hits.slice(0, 10).map((a) => a.name) }
}

/** Vykoná nástroj price_quote; vždy vráti objekt (chyby ako { error }). */
export function runPriceTool(input = {}, { today } = {}) {
  const found = findApartment(input.apartment)
  if (!found.apt) return found
  const apt = found.apt
  const checkIn = String(input.check_in || '')
  let checkOut = String(input.check_out || '')
  if (!checkOut && Number(input.nights) >= 1) checkOut = addDaysIso(checkIn, Math.trunc(Number(input.nights)))
  const n = nightsBetween(checkIn, checkOut)
  if (n < 1) return { error: 'Dátumy nie sú platné (príchod a odchod vo formáte YYYY-MM-DD, odchod po príchode).' }
  if (n > 365) return { error: 'Pobyt je dlhší ako 365 nocí, spočítaj ho po častiach.' }
  const guestsAsked = Math.trunc(Number(input.guests)) || 2
  const taxOn = input.city_tax === undefined ? n < 60 : !!input.city_tax
  const q = quote({ apt, checkIn, checkOut, guests: guestsAsked, cleanings: input.cleanings, cityTaxOn: taxOn, cityTaxRate: apt.cityTax })
  if (!q.ok) return { error: q.error }
  const t = Object.fromEntries(q.tiers.map((x) => [x.key, {
    total_eur: Math.round(x.total), per_night_eur: Math.round(x.perNight * 10) / 10, price_without_city_tax_eur: x.gross,
    owner_receives_total_eur: Math.round(x.owner), owner_receives_per_night_eur: Math.round(x.ownerPerNight * 10) / 10,
  }]))
  return {
    apartment: apt.name, city: apt.city, capacity: apt.cap, nights: n, check_in: checkIn, check_out: checkOut,
    guests: q.guests, guests_note: guestsAsked > apt.cap ? `Byt má kapacitu ${apt.cap}, počítané pre ${q.guests}.` : undefined,
    city_tax_included: q.taxOn, city_tax_eur: Math.round(q.tax * 10) / 10, cleanings: q.cleanings,
    weak_period: q.weakPeriod, prices: t, warnings: q.warnings.map((w) => w.text),
    data_date: PRICE_DATA_DATE, today,
    link: `/kalkulacka?byt=${apt.guestyId}&od=${checkIn}&do=${checkOut}&hostia=${q.guests}`,
    note: 'Ceny sú zaokrúhlené nahor na celé eurá. Silná = výhodné pre majiteľa, stredná = v polovici, slabá = len v slabom období (október, november, január, február).',
  }
}
