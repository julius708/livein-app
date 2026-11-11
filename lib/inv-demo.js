// Ukážkové dáta (FIKTÍVNE): nehnuteľnosti, klienti, dopyty, zhody, rozhodnutia, úloha a návrh ponuky. Slúži na to, aby sa dalo vidieť a vyskúšať, ako modul vyzerá.
// Všetko je označené „[UKÁŽKA]“ / created_by = 'demo', žiadne upozornenia sa nikomu neposielajú a celé sa dá jedným tlačidlom odstrániť. Používa skutočné funkcie modulu.
import { ingestListing, updateProperty, setPropertyStatus, matchInquiry, decideMatch, createTask, notifyDigest, loadSettings, recalcProperty } from './inv-store.js'
import { buildOffer } from './inv-offer.js'
import { LAZARETSKA_15 } from './inv-presets.js'

export const DEMO = 'demo'
export const DEMO_TAG = '[UKÁŽKA]'
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data }
const day = (now, d) => new Date(now + d * 864e5).toISOString()

const FULL = { legal_costs: 4200, reno: 6000, furnishing: 9000, setup: 1500, reserve: 2500, monthly_fixed: 210, parking_mandatory: false, commission_in_price: true }
// [kľúč, údaje inzerátu, náklady (null = necháme neznáme), stav]
const PROPS = [
  ['p1', { city: 'Bratislava', district: 'Staré Mesto', address: 'Dunajská 12', rooms: 3, area_interior: 62, area_exterior: 6, floor: 3, price: 149000, equipment: ['balkón', 'výťah'], condition: 'po rekonštrukcii' }, FULL],
  ['p2', { city: 'Bratislava', district: 'Ružinov', address: 'Miletičova 40', rooms: 2, area_interior: 48, floor: 5, price: 195000, equipment: ['výťah'] }, { ...FULL, legal_costs: 7000, reno: 4000, furnishing: 3000, setup: 500, reserve: 500 }],
  ['p3', { city: 'Bratislava', district: 'Nové Mesto', address: 'Kramárska 3', rooms: 3, area_interior: 70, price: 168000, condition: 'pôvodný stav' }, null],
  ['p4', { city: 'Bratislava', district: 'Petržalka', address: 'Rusovská cesta 8', rooms: 2, area_interior: 45, price: 129000, equipment: ['balkón'] }, { ...FULL, reno: 12000 }],
  ['p5', { city: 'Bratislava', district: 'Staré Mesto', address: 'Obchodná 5', rooms: 2, area_interior: 55, price: 172000, equipment: ['výťah'], parking: 'garážové státie za príplatok' }, { ...FULL, parking_mandatory: true, parking_in_price: false, parking_price: 18000 }],
  ['p6', { city: 'Bratislava', district: 'Staré Mesto', address: 'Ventúrska 9', rooms: 2, area_interior: 52, price: 159000 }, FULL],
  ['p7', { city: 'Bratislava', district: 'Dúbravka', address: 'Sekurisova 14', rooms: 1, area_interior: 32, area_exterior: 4, price: 98000, equipment: ['balkón'] }, FULL],
  ['p8', { city: 'Košice', district: 'Staré Mesto', address: 'Hlavná 20', rooms: 2, area_interior: 58, price: 118000, equipment: ['výťah'] }, { ...FULL, legal_costs: 3000, reno: 8000 }],
  ['p9', { city: 'Bratislava', district: 'Karlova Ves', address: 'Molecova 21', rooms: 2, area_interior: 50, price: 139000, equipment: ['balkón', 'výťah'] }, null],
  ['p10', { city: 'Bratislava', district: 'Ružinov', address: 'Ráztočná 6', rooms: 3, area_interior: 66, price: 184000 }, FULL],
]
const LEADS = [
  { key: 'l1', name: `${DEMO_TAG} Marta Vzorová`, email: 'demo.marta@example.invalid', city: 'Bratislava' },
  { key: 'l2', name: `${DEMO_TAG} Peter Ukážkový`, email: 'demo.peter@example.invalid', city: 'Bratislava' },
  { key: 'l3', name: `${DEMO_TAG} Dana Testovacia`, email: 'demo.dana@example.invalid', city: 'Košice' },
]

/** Naplní ukážkové dáta. Opakované spustenie nič nezdvojí. Vyžaduje klienta s právami (service role). */
export async function seedDemo(s, { actor, now = Date.now(), applyPreset = true } = {}) {
  const existing = must(await s.from('leads').select('id').eq('origin', DEMO).limit(1), 'ukážkové kontakty') || []
  if (existing.length) return { ok: true, already: true }
  const owner = (actor || 'zuzana@live-in.international').toLowerCase()
  if (applyPreset) {
    const r = await s.from('inv_settings').upsert({ key: 'calc', value: LAZARETSKA_15.calc, updated_by: owner, updated_at: new Date(now).toISOString() })
    if (r.error) throw new Error('nastavenia: ' + r.error.message)
  }
  const settings = await loadSettings(s)
  const leads = {}
  for (const l of LEADS) {
    const ins = await s.from('leads').insert({ name: l.name, email: l.email, city: l.city, city_group: l.city, source: 'Iné / neznáme', kind: 'not_lead', stage: 'new', priority: 'low', received_at: new Date(now).toISOString(), due_at: null, alarm_hours: 24, assigned_to: owner, notes: 'Fiktívny kontakt na ukážku modulu Investície. Dá sa odstrániť tlačidlom v Agent a nastavenia.', origin: DEMO, origin_detail: 'ukážka' }).select('id').single()
    leads[l.key] = must(ins, 'ukážkový kontakt').id
  }
  const ids = {}
  for (const [k, raw, costs] of PROPS) {
    const r = await ingestListing(s, { ...raw, source_key: DEMO, external_id: `demo-${k}`, type: 'byt', title: `${DEMO_TAG} ${raw.rooms}-izbový byt, ${raw.address}`, checked_at: day(now, -(1 + (k.length + Number(k.slice(1))) % 3)) }, { settings, actor: DEMO, via: DEMO, now })
    ids[k] = r.property_id
    if (costs) await updateProperty(s, r.property_id, costs, DEMO)
  }
  // ten istý byt z druhého portálu (neistá zhoda → návrh na zlúčenie)
  await ingestListing(s, { source_key: 'demo-portal-b', external_id: 'demo-b1', city: 'Bratislava', address: 'Dunajská', rooms: 3, area_interior: 62, price: 148500, type: 'byt', title: `${DEMO_TAG} 3-izbový byt Dunajská (druhý portál)`, checked_at: day(now, -1) }, { settings, actor: DEMO, via: DEMO, now })

  const base = { owner_email: owner, source: 'CRM kontakt', created_by: DEMO, created_at: day(now, -7) }
  const inq = []
  for (const row of [
    { lead: 'l1', label: `${DEMO_TAG} Byt do 200 000 € v Bratislave`, status: 'confirmed', cities: ['Bratislava'], types: ['byt'], rooms: [2, 3], excluded_areas: ['Petržalka'], budget_total: 200000, budget_kind: 'total', equity: 80000, loan_planned: 120000, prefer: { balcony: true }, goal: 'str', last_confirmed_at: day(now, -3), next_step: 'Poslať výber a dohodnúť obhliadku', next_due: day(now, 3).slice(0, 10) },
    { lead: 'l2', label: `${DEMO_TAG} 150 000 € vlastné zdroje + úver`, status: 'selection', cities: ['Bratislava', 'Košice'], types: ['byt'], rooms: [1, 2], budget_total: 150000, budget_kind: 'equity', equity: 150000, loan_planned: 60000, must: { elevator: true }, goal: 'compare', risk: 'medium', wants_management: true, last_confirmed_at: day(now, -10) },
    { lead: 'l3', label: `${DEMO_TAG} Dlhodobý prenájom, rozpočet neurčený`, status: 'new', cities: ['Bratislava'], types: ['byt'], rooms: [2], budget_total: 130000, budget_kind: 'unknown', goal: 'ltr', notes: 'Klient povedal „okolo 130 000 €“, zatiaľ nevieme, či je to celá investícia alebo vlastné zdroje.' },
  ]) {
    const { lead, ...rest } = row
    const r = await s.from('inv_inquiries').insert({ ...base, ...rest, lead_id: leads[lead] }).select('*').single()
    inq.push(must(r, 'ukážkový dopyt'))
  }
  for (const q of inq) await matchInquiry(s, q.id, { settings, now })
  // zmeny po prvom párovaní: pokles ceny, predaný a rezervovaný byt, potvrdená dostupnosť (zhody sa prepočítajú)
  await ingestListing(s, { source_key: DEMO, external_id: 'demo-p5', city: 'Bratislava', district: 'Staré Mesto', address: 'Obchodná 5', rooms: 2, area_interior: 55, price: 161000, type: 'byt', title: `${DEMO_TAG} 2-izbový byt, Obchodná 5`, checked_at: day(now, -0.2) }, { settings, actor: DEMO, via: DEMO, now })
  await setPropertyStatus(s, ids.p6, 'sold', DEMO, { note: 'ukážka: predajca potvrdil predaj' })
  await setPropertyStatus(s, ids.p10, 'reserved', DEMO, { note: 'ukážka: rezervované' })
  await setPropertyStatus(s, ids.p1, 'confirmed', DEMO, { note: 'ukážka: predajca potvrdil dostupnosť a obhliadku', confirmed: true })
  // rozhodnutia Zuzky: kandidát, zamietnutie s dôvodom, obhliadka s úlohou, návrh ponuky
  const find = async (qi, pk) => must(await s.from('inv_matches').select('*').eq('inquiry_id', inq[qi].id).eq('property_id', ids[pk]).maybeSingle(), 'zhoda')
  const m1 = await find(0, 'p1'); if (m1) await decideMatch(s, m1.id, 'shortlist', owner)
  const m2 = await find(0, 'p9'); if (m2 && m2.category === 'match') { await decideMatch(s, m2.id, 'viewing', owner, { viewing_at: day(now, 4), note: 'ukážka' }); await createTask(s, { property_id: ids.p9, inquiry_id: inq[0].id, match_id: m2.id, title: 'Overiť dostupnosť a možnosť obhliadky u predajcu', due: day(now, 2).slice(0, 10) }, owner) }
  const m3 = await find(1, 'p8'); if (m3) await decideMatch(s, m3.id, 'rejected', owner, { reason: 'Klient nechce Košice' })
  const m4 = await find(0, 'p5'); if (m4 && m4.category === 'match') await decideMatch(s, m4.id, 'review', owner)
  if (m1) {
    const prop = must(await s.from('inv_properties').select('*').eq('id', ids.p1).single(), 'byt')
    const calc = must(await s.from('inv_calcs').select('result').eq('id', prop.calc_id).single(), 'výpočet').result
    const match = await find(0, 'p1')
    const o = await buildOffer({ inquiry: inq[0], picks: [{ match, property: { ...prop, notes_internal: 'Ukážka: predajca ochotný zľaviť o 3 %' }, calc }], now })
    if (o.ok) await s.from('inv_offers').insert({ inquiry_id: inq[0].id, match_ids: [match.id], content: o.content, internal: o.internal, calc_snapshot: o.calc_snapshot, created_by: owner })
  }
  await s.from('inv_tasks').insert({ inquiry_id: inq[1].id, title: 'Potvrdiť s klientom, či chce aj Košice', due: day(now, 1).slice(0, 10), owner_email: owner, created_by: owner })
  await notifyDigest(s, { now, silent: true, only: inq.map((q) => q.id) })
  return { ok: true, properties: Object.keys(ids).length + 1, leads: LEADS.length, inquiries: inq.length }
}

/** Odstráni všetky ukážkové dáta (kontakty, dopyty, nehnuteľnosti s created_by = 'demo' a ich históriu). */
export async function clearDemo(s) {
  const leadIds = (must(await s.from('leads').select('id').eq('origin', DEMO), 'kontakty') || []).map((l) => l.id)
  const inqIds = leadIds.length ? (must(await s.from('inv_inquiries').select('id').in('lead_id', leadIds), 'dopyty') || []).map((q) => q.id) : []
  const propIds = (must(await s.from('inv_properties').select('id').eq('created_by', DEMO), 'nehnuteľnosti') || []).map((p) => p.id)
  const del = async (t, col, ids) => { for (let i = 0; i < ids.length; i += 100) must(await s.from(t).delete().in(col, ids.slice(i, i + 100)), 'mazanie ' + t) }
  await del('inv_events', 'inquiry_id', inqIds); await del('inv_events', 'property_id', propIds)
  await del('inv_offers', 'inquiry_id', inqIds); await del('inv_tasks', 'inquiry_id', inqIds); await del('inv_tasks', 'property_id', propIds); await del('inv_matches', 'inquiry_id', inqIds); await del('inv_matches', 'property_id', propIds)
  for (const t of ['inv_listings', 'inv_calcs', 'inv_price_history']) await del(t, 'property_id', propIds)
  await del('inv_merge_candidates', 'property_a', propIds); await del('inv_merge_candidates', 'property_b', propIds)   // v databáze by to spravila aj kaskáda
  await del('notifications', 'lead_id', leadIds)
  await del('inv_inquiries', 'id', inqIds)          // zhody, úlohy a ponuky sa zmažú kaskádou
  await del('inv_properties', 'id', propIds)        // zdroje, výpočty, história ceny a duplicity kaskádou
  await del('leads', 'id', leadIds)
  return { ok: true, leads: leadIds.length, inquiries: inqIds.length, properties: propIds.length }
}
void recalcProperty
