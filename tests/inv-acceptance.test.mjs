// Akceptačný tok: zber ponuky → uloženie → výpočet → párovanie → kontrola Zuzkou → príprava klientskej ponuky a úloha na overenie obhliadky.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { ingestListing, updateProperty, matchInquiry, decideMatch, createTask, notifyDigest } from '../lib/inv-store.js'
import { buildOffer, clientView } from '../lib/inv-offer.js'
import { runAgent } from '../lib/inv-agent.js'
import { canInv } from '../lib/inv-core.js'
import { cleanInquiry } from '../lib/inv-inquiry.js'

const LEAD = '11111111-1111-1111-1111-111111111111', Z = 'zuzana@live-in.international'
const NOW = Date.parse('2026-11-12T10:00:00Z')
const resp = (st, body = '') => ({ status: st, ok: st < 300, text: async () => body })
const feed = (items) => async (u) => (u.endsWith('robots.txt') ? resp(404) : resp(200, JSON.stringify({ items })))

test('celý tok: agent nájde ponuky, Zuzka vytvorí dopyt na 200 000 € (celková investícia), skontroluje, pripraví ponuku a úlohu na obhliadku', async () => {
  const s = fakeSupabase({ leads: [{ id: LEAD, name: 'Klient', assigned_to: Z }], inv_sources: [{ key: 'feed', name: 'Feed', kind: 'feed', enabled: true, mode: 'both', consecutive_failures: 0, url: 'https://feed.example/x.json', config: { map: { external_id: 'id', url: 'u', price: 'p', city: 'c', address: 'a', area_interior: 'm', rooms: 'r', district: 'd' } } }] })
  const items = [{ id: 'A1', u: 'https://feed.example/a/A1', p: 150000, c: 'Bratislava', a: 'Dunajská 12', m: 62, r: 3, d: 'Staré Mesto' }, { id: 'B2', u: 'https://feed.example/a/B2', p: 195000, c: 'Bratislava', a: 'Miletičova 40', m: 48, r: 2, d: 'Ružinov' }]
  // 1. agent na pozadí (bez prehliadača) uloží ponuky a vypočíta ich
  const run = await runAgent(s, { fetchImpl: feed(items), now: NOW, maxMs: 20000 })
  assert.equal(run.ok, true); assert.equal(run.stats.created, 2)
  const props = s.db.tables.inv_properties
  assert.equal(props.length, 2); assert.ok(props.every((p) => p.calc_id))
  // 2. Zuzka pri existujúcom kontakte vytvorí dopyt (nový kontakt sa nevytvára)
  const c = cleanInquiry({ label: 'Byt do 200 000 €', budget_total: 200000, budget_kind: 'total', cities: 'Bratislava', types: 'byt' })
  const q = (await s.from('inv_inquiries').insert({ ...c.patch, lead_id: LEAD, owner_email: Z, status: 'confirmed' }).select('*').single()).data
  assert.equal(s.db.tables.leads.length, 1)
  await matchInquiry(s, q.id, { now: NOW })
  // 3. byt za 195 000 € s ďalšími nákladmi 15 000 € nie je v rozpočte; chýbajúce náklady sú neznáme
  const B = props.find((p) => p.address === 'Miletičova 40'), A = props.find((p) => p.address === 'Dunajská 12')
  await updateProperty(s, B.id, { legal_costs: 7000, reno: 4000, furnishing: 3000, setup: 500, reserve: 500, monthly_fixed: 250, parking_mandatory: false, commission_in_price: true }, Z)
  await matchInquiry(s, q.id, { now: NOW })
  const mB = s.db.tables.inv_matches.find((m) => m.property_id === B.id), mA0 = s.db.tables.inv_matches.find((m) => m.property_id === A.id)
  assert.equal(mB.category, 'outside'); assert.equal(mB.result.budget.status, 'over')
  assert.equal(mA0.category, 'match'); assert.equal(mA0.result.budget.status, 'unverified'); assert.ok(mA0.result.budget.unknown.length >= 4)
  // 4. Zuzka doplní náklady, vyberie kandidáta, vytvorí úlohu na overenie dostupnosti a obhliadky
  await updateProperty(s, A.id, { legal_costs: 4000, reno: 5000, furnishing: 4000, setup: 1000, reserve: 1000, monthly_fixed: 250, parking_mandatory: false, commission_in_price: true }, Z)
  const mA = s.db.tables.inv_matches.find((m) => m.property_id === A.id)
  assert.equal(mA.result.budget.status, 'within')
  assert.equal((await decideMatch(s, mA.id, 'shortlist', Z)).ok, true)
  const t = await createTask(s, { property_id: A.id, inquiry_id: q.id, match_id: mA.id, title: 'Overiť dostupnosť a možnosť obhliadky u predajcu', due: '2026-11-14' }, Z)
  assert.equal(t.ok, true); assert.equal(s.db.tables.inv_tasks[0].status, 'open')
  // 5. druhý agent pripraví návrh ponuky z kontrolovaného bytu; klientsky náhľad nemá interné údaje; nič sa neodosiela
  const pA = s.db.tables.inv_properties.find((p) => p.id === A.id), cA = s.db.tables.inv_calcs.find((x) => x.id === pA.calc_id).result
  const offer = await buildOffer({ inquiry: q, picks: [{ match: s.db.tables.inv_matches.find((m) => m.id === mA.id), property: { ...pA, notes_internal: 'TAJNÉ' }, calc: cA }], now: NOW })
  assert.equal(offer.ok, true)
  const view = JSON.stringify(clientView({ content: offer.content, reviewed_at: null }))
  assert.equal(view.includes('TAJNÉ'), false); assert.match(view, /Dostupnosť zatiaľ nepotvrdil/)
  assert.ok(offer.content.items[0].scenarios.length === 3 && offer.content.items[0].risks.length > 0)
  assert.equal((s.db.tables.notifications || []).filter((n) => /odoslan/i.test(n.title)).length, 0)
  void notifyDigest
})
test('neoprávnený používateľ: bez roly CRM nemá prístup (server kontroluje rolu pri každej akcii a stránke; RLS v databáze overené na lokálnom Postgrese)', () => {
  for (const roles of [['cleaning'], ['customer_service'], ['operations'], ['marketing'], []]) assert.equal(canInv({ roles, active: true }), false, roles.join())
  assert.equal(canInv({ roles: ['crm'], active: true }), true)
})
