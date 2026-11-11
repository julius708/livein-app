// Ukážkový scenár (len testovacie dáta, nie reálne ponuky): používa skutočné funkcie modulu, takže vznikne to, čo by vznikol v produkcii.
import { fakeSupabase } from './fake-supabase.mjs'
import { ingestListing, updateProperty, matchInquiry, matchProperty, decideMatch, notifyDigest, setPropertyStatus, loadSettings } from '../../lib/inv-store.js'
import { buildOffer } from '../../lib/inv-offer.js'

export const LEAD = '11111111-1111-1111-1111-111111111111'
export const ZUZKA = 'zuzana@live-in.international'
const COSTS = { legal_costs: 4000, reno: 5000, furnishing: 4000, setup: 1000, reserve: 1000, monthly_fixed: 250, parking_mandatory: false, commission_in_price: true }
const mk = (n, o) => ({ source_key: 'testportal.sk', external_id: String(1000 + n), url: `https://testportal.sk/byt/${1000 + n}`, city: 'Bratislava', type: 'byt', checked_at: '2026-11-12T08:00:00Z', ...o })

export async function buildScenario() {
  const s = fakeSupabase({ leads: [{ id: LEAD, name: 'Testovací Klient', assigned_to: ZUZKA }] })
  s.db.tables.inv_inquiries = [{ id: '22222222-2222-2222-2222-222222222222', lead_id: LEAD, label: 'Byt do 200 000 € v Bratislave', status: 'confirmed', owner_email: ZUZKA, source: 'CRM kontakt', cities: ['Bratislava'], types: ['byt'], rooms: [2, 3], excluded_areas: ['Petržalka'], budget_total: 200000, budget_kind: 'total', equity: 80000, loan_planned: 120000, prefer: { balcony: true }, must: {}, goal: 'str', last_confirmed_at: '2026-11-05T10:00:00Z', created_at: '2026-11-05T10:00:00Z', areas: [], conditions: [], created_by: ZUZKA }]
  const now = Date.parse('2026-11-12T10:00:00Z')
  const A = await ingestListing(s, mk(1, { district: 'Staré Mesto', address: 'Dunajská 12', rooms: 3, area_interior: 62, area_exterior: 6, floor: 3, price: 150000, equipment: ['balkón', 'výťah'] }), { now }); await updateProperty(s, A.property_id, COSTS, ZUZKA)
  const B = await ingestListing(s, mk(2, { district: 'Ružinov', address: 'Miletičova 40', rooms: 2, area_interior: 48, floor: 5, price: 195000 }), { now }); await updateProperty(s, B.property_id, { ...COSTS, legal_costs: 7000, reno: 4000, furnishing: 3000, setup: 500, reserve: 500 }, ZUZKA)
  const C = await ingestListing(s, mk(3, { district: 'Nové Mesto', address: 'Kramáre 3', rooms: 3, area_interior: 70, price: 180000 }), { now })
  await ingestListing(s, mk(4, { district: 'Petržalka', address: 'Rusovská 8', rooms: 2, area_interior: 45, price: 130000 }), { now })
  const E = await ingestListing(s, mk(5, { district: 'Staré Mesto', address: 'Obchodná 5', rooms: 2, area_interior: 55, price: 170000 }), { now }); await updateProperty(s, E.property_id, COSTS, ZUZKA)
  await ingestListing(s, mk(5, { district: 'Staré Mesto', address: 'Obchodná 5', rooms: 2, area_interior: 55, price: 160000, checked_at: '2026-11-13T08:00:00Z' }), { now })
  const F = await ingestListing(s, mk(6, { district: 'Staré Mesto', address: 'Ventúrska 9', rooms: 2, area_interior: 52, price: 140000 }), { now }); await updateProperty(s, F.property_id, COSTS, ZUZKA); await setPropertyStatus(s, F.property_id, 'sold', ZUZKA, { note: 'predajca potvrdil' })
  await ingestListing(s, { ...mk(7, { city: 'Košice', district: 'Staré Mesto', address: 'Hlavná 20', rooms: 2, area_interior: 58, price: 120000 }) }, { now })
  await ingestListing(s, mk(8, { source_key: 'druhy-portal.sk', external_id: 'DP-8', url: 'https://druhy-portal.sk/DP-8', address: 'Dunajská', rooms: 3, area_interior: 62, price: 149000 }), { now })   // možný duplikát k A
  const q = '22222222-2222-2222-2222-222222222222'
  await matchInquiry(s, q, { now })
  const ms = s.db.tables.inv_matches
  const mA = ms.find((m) => m.property_id === A.property_id)
  await decideMatch(s, mA.id, 'shortlist', ZUZKA)
  await notifyDigest(s, { now })
  s.db.tables.inv_sources = [{ key: 'feed-agentura', name: 'Feed agentúry X', kind: 'feed', url: 'https://feed.example/l.json', config: {}, mode: 'both', enabled: true, blocked: false, last_ok_at: '2026-11-12T06:01:00Z', consecutive_failures: 0, created_at: '2026-11-01T00:00:00Z' }, { key: 'portal-y', name: 'Portál Y', kind: 'url', url: null, config: { urls: [] }, mode: 'both', enabled: true, blocked: true, blocked_reason: 'zakázané v robots.txt', last_error: 'zakázané v robots.txt', consecutive_failures: 2, last_error_at: '2026-11-12T06:02:00Z', created_at: '2026-11-01T00:00:00Z' }]
  s.db.tables.inv_runs = [{ id: 2, mode: 'both', trigger: 'cron', status: 'partial', attempt: 1, started_at: '2026-11-12T06:00:00Z', finished_at: '2026-11-12T06:02:30Z', heartbeat_at: '2026-11-12T06:02:30Z', stats: { sources_ok: 1, created: 3, updated: 2, merged: 1, matches_created: 4, sources_blocked: 1 }, error: 'Portál Y: zakázané v robots.txt' }, { id: 1, mode: 'both', trigger: 'manual', status: 'ok', attempt: 1, started_at: '2026-11-11T09:00:00Z', finished_at: '2026-11-11T09:01:00Z', heartbeat_at: '2026-11-11T09:01:00Z', stats: { sources_ok: 1, created: 5, updated: 0, merged: 0, matches_created: 2 }, error: null }]
  // návrh ponuky z kandidáta A
  const props = s.db.tables.inv_properties, calcs = s.db.tables.inv_calcs
  const pA = props.find((p) => p.id === A.property_id), cA = calcs.find((c) => c.id === pA.calc_id).result
  const o = await buildOffer({ inquiry: s.db.tables.inv_inquiries[0], picks: [{ match: s.db.tables.inv_matches.find((m) => m.id === mA.id), property: pA, calc: cA }], now })
  s.db.tables.inv_offers = [{ id: '33333333-3333-3333-3333-333333333333', inquiry_id: q, status: 'draft', match_ids: [mA.id], content: o.content, internal: o.internal, calc_snapshot: o.calc_snapshot, created_by: ZUZKA, created_at: '2026-11-12T10:05:00Z' }]
  return { s, ids: { A: A.property_id, B: B.property_id, C: C.property_id, E: E.property_id, F: F.property_id, q, offer: '33333333-3333-3333-3333-333333333333' }, settings: await loadSettings(s) }
}
