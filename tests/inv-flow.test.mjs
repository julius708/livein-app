import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { ingestListing, matchInquiry, matchProperty, updateProperty, setPropertyStatus, notifyDigest, decideMatch, mergeProperties, markMissing, recalcProperty, confirmAvailability, loadSettings } from '../lib/inv-store.js'
import { runAgent, runIfDue, isRunDue, nextPlannedRun, zonedTime, agentStatus, refreshListings } from '../lib/inv-agent.js'

const LEAD = '11111111-1111-1111-1111-111111111111'
const ZUZKA = 'zuzana@live-in.international'
const NOW = Date.parse('2026-11-12T10:00:00Z')
const FRESH = '2026-11-12T08:00:00Z'
const seedDb = (extra = {}) => fakeSupabase({ leads: [{ id: LEAD, name: 'Klient A', assigned_to: ZUZKA }], inv_inquiries: [{ id: 'q1', lead_id: LEAD, status: 'confirmed', owner_email: ZUZKA, cities: ['Bratislava'], types: ['byt'], budget_total: 200000, budget_kind: 'total' }], ...extra })
const L = (o = {}) => ({ source_key: 'portal-a.sk', external_id: '1001', url: 'https://portal-a.sk/byt/1001', city: 'Bratislava', district: 'Staré Mesto', address: 'Dunajská 12', type: 'byt', rooms: 3, area_interior: 62, floor: 3, price: 150000, checked_at: FRESH, ...o })
const COSTS = { legal_costs: 4000, reno: 5000, furnishing: 4000, setup: 1000, reserve: 1000, monthly_fixed: 250, parking_mandatory: false, commission_in_price: true }
const props = (s) => s.db.tables.inv_properties || []
const matches = (s) => s.db.tables.inv_matches || []
const events = (s, type) => (s.db.tables.inv_events || []).filter((e) => !type || e.type === type)

test('1–2: zber ponuky → uloženie → výpočet → párovanie; Zuzka vidí zhodu s dôvodom poradia', async () => {
  const s = seedDb()
  const r = await ingestListing(s, L(), { now: NOW })
  assert.equal(r.ok, true); assert.equal(r.created, true)
  assert.equal(props(s).length, 1); assert.equal((s.db.tables.inv_calcs || []).length, 1)
  const m = await matchInquiry(s, 'q1', { now: NOW })
  assert.equal(m.stats.created, 1)
  const row = matches(s)[0]
  assert.equal(row.category, 'match')
  assert.match(row.result.rank_reason, /kvalita podkladov/); assert.ok(row.result.next_step)
  assert.equal(row.decision, 'open')
})
test('3: byt za 195 000 € + ďalšie náklady 15 000 € nie je v rozpočte 200 000 € (mimo podmienok, nie vysoké skóre)', async () => {
  const s = seedDb()
  const r = await ingestListing(s, L({ price: 195000 }), { now: NOW })
  await updateProperty(s, r.property_id, { ...COSTS, legal_costs: 7000, reno: 4000, furnishing: 3000, setup: 500, reserve: 500 }, ZUZKA)   // spolu 15 000
  await matchInquiry(s, 'q1', { now: NOW })
  const row = matches(s)[0]
  assert.equal(row.result.budget.total, 210000); assert.equal(row.result.budget.status, 'over'); assert.equal(row.result.budget.over_by, 10000)
  assert.equal(row.category, 'outside')
})
test('4: chýbajúce náklady sú v zhode vypísané ako neznáme (nie nula)', async () => {
  const s = seedDb()
  await ingestListing(s, L({ price: 180000 }), { now: NOW })
  await matchInquiry(s, 'q1', { now: NOW })
  const row = matches(s)[0]
  assert.equal(row.result.budget.status, 'unverified')
  assert.ok(row.result.budget.unknown.length >= 4)
  assert.equal(props(s)[0].legal_costs ?? null, null)
})
test('5: opakovaný import nevytvorí duplicity (rovnaký inzerát aj ten istý byt z iného portálu)', async () => {
  const s = seedDb()
  await ingestListing(s, L(), { now: NOW }); await ingestListing(s, L(), { now: NOW + 1000 })
  assert.equal(props(s).length, 1); assert.equal(s.db.tables.inv_listings.length, 1)
  const b = await ingestListing(s, L({ source_key: 'portal-b.sk', external_id: 'B-77', url: 'https://portal-b.sk/x/B-77', address: 'ul. Dunajská 12', area_interior: 62.3, price: 151000 }), { now: NOW + 2000 })
  assert.equal(b.merged, true); assert.equal(props(s).length, 1); assert.equal(s.db.tables.inv_listings.length, 2)
  assert.equal(props(s)[0].price, 150000)   // cena z druhého portálu pri pripojení neprepíše pôvodnú, len sa zaznamená
  assert.equal(events(s, 'price_differs').length, 1)
  await ingestListing(s, L({ source_key: 'portal-b.sk', external_id: 'B-77', url: 'https://portal-b.sk/x/B-77', address: 'ul. Dunajská 12', area_interior: 62.3, price: 151000 }), { now: NOW + 3000 })
  assert.equal(s.db.tables.inv_listings.length, 2)
})
test('5b: neistá zhoda sa len navrhne na zlúčenie, zdroje a história sa zachovajú; zlúčenie ich presunie', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L(), { now: NOW })
  const b = await ingestListing(s, L({ source_key: 'portal-c.sk', external_id: 'c1', url: 'https://portal-c.sk/c1', address: 'Dunajská', floor: null, price: 149000 }), { now: NOW })
  assert.equal(props(s).length, 2); assert.ok(b.suggested); assert.equal(s.db.tables.inv_merge_candidates.length, 1)
  await matchInquiry(s, 'q1', { now: NOW })
  const mg = await mergeProperties(s, a.property_id, b.property_id, ZUZKA)
  assert.equal(mg.ok, true)
  assert.equal(props(s).find((p) => p.id === b.property_id).merged_into, a.property_id)
  assert.equal(s.db.tables.inv_listings.filter((l) => l.property_id === a.property_id).length, 2)
  assert.equal(s.db.tables.inv_merge_candidates[0].status, 'merged')
  assert.equal(matches(s).filter((m) => m.property_id === a.property_id).length, 1)
})
test('6: zmena ceny vytvorí novú verziu výpočtu, prepočíta zhody a zachová históriu', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L({ price: 190000 }), { now: NOW })
  await updateProperty(s, a.property_id, COSTS, ZUZKA)
  await matchInquiry(s, 'q1', { now: NOW })
  assert.equal(matches(s)[0].result.budget.total, 205000)   // 190 000 + 15 000
  assert.equal(matches(s)[0].category, 'outside')
  const v1 = s.db.tables.inv_calcs.length
  const r = await ingestListing(s, L({ price: 170000, checked_at: '2026-11-13T08:00:00Z' }), { now: NOW + 864e5 })
  assert.equal(r.price.changed, true); assert.equal(r.price.significant, true); assert.equal(r.calc_changed, true)
  assert.equal(s.db.tables.inv_calcs.length, v1 + 1)
  assert.deepEqual(s.db.tables.inv_calcs.map((c) => c.version), [1, 2, 3].slice(0, s.db.tables.inv_calcs.length))
  await matchProperty(s, a.property_id, { now: NOW + 864e5 })
  assert.equal(matches(s)[0].category, 'match'); assert.equal(matches(s)[0].result.budget.total, 185000)
  const hist = s.db.tables.inv_price_history.map((h) => h.price)
  assert.ok(hist.includes(190000) && hist.includes(170000))
  assert.equal(events(s, 'price_change').length, 1)
})
test('6b: už pripravená ponuka si drží pôvodný výpočet (verzia výpočtu ostáva uložená)', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L({ price: 150000 }), { now: NOW })
  const first = props(s)[0].calc_id
  await ingestListing(s, L({ price: 140000, checked_at: '2026-11-13T08:00:00Z' }), { now: NOW })
  assert.notEqual(props(s)[0].calc_id, first)
  const old = s.db.tables.inv_calcs.find((c) => c.id === first)
  assert.equal(old.result.investment.items.find((i) => i.key === 'price').amount, 150000)
  void a
})
test('7: nedostupná ponuka zmizne z aktívnych odporúčaní, ale zostane v histórii; upozorní sa pri dotknutom dopyte', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L(), { now: NOW })
  await matchInquiry(s, 'q1', { now: NOW })
  await notifyDigest(s, { now: NOW })
  const n0 = s.db.tables.notifications.length
  await decideMatch(s, matches(s)[0].id, 'shortlist', ZUZKA)
  await setPropertyStatus(s, a.property_id, 'sold', ZUZKA, { note: 'predajca potvrdil' })
  assert.equal(matches(s)[0].category, 'unavailable'); assert.equal(matches(s).length, 1)   // záznam ostáva
  assert.ok(events(s).some((e) => e.type === 'status'))
  const dg = await notifyDigest(s, { now: NOW + 1000 })
  assert.equal(dg.sent, 1); assert.match(s.db.tables.notifications.at(-1).title, /už nie je dostupná/)
  assert.ok(s.db.tables.notifications.length > n0)
  assert.equal((await notifyDigest(s, { now: NOW + 2000 })).sent, 0)   // rovnaká zmena sa neoznámi dvakrát
})
test('upozornenia: nová zhoda sa oznámi raz, významná zmena znova, jedna správa na osobu', async () => {
  const s = seedDb({ inv_inquiries: [{ id: 'q1', lead_id: LEAD, status: 'confirmed', owner_email: ZUZKA, cities: ['Bratislava'], budget_total: 200000, budget_kind: 'total' }, { id: 'q2', lead_id: LEAD, status: 'new', owner_email: ZUZKA, cities: ['Bratislava'], budget_total: 300000, budget_kind: 'total' }] })
  const a = await ingestListing(s, L(), { now: NOW })
  await matchProperty(s, a.property_id, { now: NOW })
  const d1 = await notifyDigest(s, { now: NOW })
  assert.equal(d1.sent, 1); assert.equal(d1.matches, 2)   // dve zhody, jedna notifikácia
  assert.equal((await notifyDigest(s, { now: NOW })).sent, 0)
  await ingestListing(s, L({ price: 120000, checked_at: '2026-11-13T08:00:00Z' }), { now: NOW })
  await matchProperty(s, a.property_id, { now: NOW })
  const d2 = await notifyDigest(s, { now: NOW })
  assert.equal(d2.sent, 1); assert.match(s.db.tables.notifications.at(-1).title, /zmena/)
})
test('zamietnutá zhoda: rozhodnutie a dôvod ostanú; významný pokles ceny ju navrhne na opätovné posúdenie', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L({ price: 195000 }), { now: NOW })
  await matchInquiry(s, 'q1', { now: NOW })
  const id = matches(s)[0].id
  assert.equal((await decideMatch(s, id, 'rejected', ZUZKA, { reason: '' })).ok, false)   // dôvod je povinný
  await decideMatch(s, id, 'rejected', ZUZKA, { reason: 'Príliš drahé' })
  await ingestListing(s, L({ price: 150000, checked_at: '2026-11-13T08:00:00Z' }), { now: NOW })
  await matchProperty(s, a.property_id, { now: NOW })
  const m = matches(s)[0]
  assert.equal(m.decision, 'rejected'); assert.equal(m.decision_reason, 'Príliš drahé'); assert.equal(m.needs_review, true); assert.match(m.review_reason, /Cena klesla/)
  assert.equal(matches(s).length, 1)   // dvojica dopyt–nehnuteľnosť je len raz
  const dg = await notifyDigest(s, { now: NOW })
  assert.equal(dg.sent, 1); assert.match(s.db.tables.notifications.at(-1).title, /opätovné posúdenie/)
})

/* ---------- zdroje, agent a plánovač ---------- */
const resp = (status, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body })
const feedItems = (items) => JSON.stringify({ items })
const mkFetch = (routes) => async (url) => { const k = Object.keys(routes).find((x) => url.startsWith(x)); const r = k ? routes[k] : resp(404); return typeof r === 'function' ? r(url) : r }
const SRC = (o = {}) => ({ key: 'feed-a', name: 'Feed A', kind: 'feed', url: 'https://feed.example/listings.json', config: { complete_snapshot: true, map: { external_id: 'id', url: 'link', price: 'cena', city: 'mesto', address: 'ulica', area_interior: 'm2', rooms: 'izby', district: 'cast' } }, enabled: true, mode: 'both', consecutive_failures: 0, ...o })
const item = (id, o = {}) => ({ id, link: `https://feed.example/inzerat/${id}00001`, cena: 150000, mesto: 'Bratislava', ulica: `Ulica ${id} 5`, m2: 55 + Number(id), izby: 3, cast: 'Staré Mesto', ...o })
const MIN = { settings: undefined }

test('8: výpadok zdroja (5xx, blokovanie, sieť) neoznačí byty ako predané ani stiahnuté', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const ok = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems([item(1), item(2)])) })
  const r1 = await runAgent(s, { fetchImpl: ok, now: NOW, maxMs: 20000 })
  assert.equal(r1.ok, true); assert.equal(r1.stats.created, 2); assert.equal(props(s).length, 2)
  for (const failing of [resp(500), resp(503), resp(403), resp(429)]) {
    const bad = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': failing })
    const r = await runAgent(s, { fetchImpl: bad, now: NOW + 3600e3, maxMs: 20000 })
    assert.equal(r.ok, true); assert.notEqual(r.status, 'ok')
    assert.ok(props(s).every((p) => p.status === 'new'), 'stav sa nesmie zmeniť pri výpadku zdroja')
    assert.ok(s.db.tables.inv_listings.every((l) => l.state === 'active' && l.missing_checks === 0))
  }
  const src = s.db.tables.inv_sources[0]
  assert.equal(src.blocked, true); assert.ok(src.last_error); assert.ok(src.consecutive_failures >= 1)
  const netErr = async (u) => { if (u.endsWith('robots.txt')) return resp(404); throw new Error('ECONNRESET') }
  const r = await runAgent(s, { fetchImpl: netErr, now: NOW + 7200e3, maxMs: 20000 })
  assert.notEqual(r.status, 'ok'); assert.ok(props(s).every((p) => p.status === 'new'))
  assert.ok(props(s).every((p) => p.last_checked_at === new Date(NOW).toISOString()))   // posledné platné údaje a čas ich overenia ostali
})
test('úplný prehľad zdroja: chýbajúci inzerát sa označí až po 2. kontrole a je „stiahnuté“, nie „predané“', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const f = (items) => mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems(items)) })
  await runAgent(s, { fetchImpl: f([item(1), item(2)]), now: NOW, maxMs: 20000 })
  await runAgent(s, { fetchImpl: f([item(1)]), now: NOW + 864e5, maxMs: 20000 })
  assert.ok(props(s).every((p) => p.status === 'new'))   // prvýkrát len „chýba“
  assert.equal(s.db.tables.inv_listings.find((l) => l.external_id === '2').missing_checks, 1)
  await runAgent(s, { fetchImpl: f([item(1)]), now: NOW + 2 * 864e5, maxMs: 20000 })
  const gone = props(s).find((p) => p.address === 'Ulica 2 5')
  assert.equal(gone.status, 'withdrawn'); assert.notEqual(gone.status, 'sold')
  assert.equal(props(s).find((p) => p.address === 'Ulica 1 5').status, 'new')
  assert.equal(s.db.tables.inv_listings.length, 2)   // nič sa nezmazalo
})
test('markMissing sa pri neúplnom alebo zlyhanom zdroji nevykoná', async () => {
  const s = seedDb()
  await ingestListing(s, L(), { now: NOW })
  assert.equal((await markMissing(s, 'portal-a.sk', [], { complete: false, ok: true })).skipped, true)
  assert.equal((await markMissing(s, 'portal-a.sk', [], { complete: true, ok: false })).skipped, true)
  assert.equal(s.db.tables.inv_listings[0].state, 'active')
})
test('overenie evidovaných ponúk: 404 dvakrát = odstránený (stiahnutý); 403 a 5xx nič nemenia; cena sa aktualizuje', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L({ price: 150000 }), { now: NOW })
  const settings = await loadSettings(s)
  const page = (price) => `<html><script type="application/ld+json">{"@type":"Apartment","name":"3-izbový byt","offers":{"price":${price}},"address":{"addressLocality":"Bratislava"},"floorSize":{"value":62}}</script></html>`
  const f = (st, body) => mkFetch({ 'https://portal-a.sk/robots.txt': resp(404), 'https://portal-a.sk/byt/1001': resp(st, body) })
  let r = await refreshListings(s, { settings, fetchImpl: f(200, page(145000)), now: NOW + 864e5, skipRecentHours: 1 })
  assert.equal(r.updated, 1); assert.equal(props(s)[0].price, 145000)
  r = await refreshListings(s, { settings, fetchImpl: f(403), now: NOW + 2 * 864e5, skipRecentHours: 1 })
  assert.equal(r.blocked, 1); assert.equal(props(s)[0].status, 'new')
  r = await refreshListings(s, { settings, fetchImpl: f(503), now: NOW + 3 * 864e5, skipRecentHours: 1 })
  assert.equal(r.errors, 1); assert.equal(s.db.tables.inv_listings[0].missing_checks, 0)
  await refreshListings(s, { settings, fetchImpl: f(404), now: NOW + 4 * 864e5, skipRecentHours: 1 })
  assert.equal(props(s)[0].status, 'new'); assert.equal(s.db.tables.inv_listings[0].missing_checks, 1)
  r = await refreshListings(s, { settings, fetchImpl: f(410), now: NOW + 5 * 864e5, skipRecentHours: 1 })
  assert.equal(r.removed, 1); assert.equal(props(s)[0].status, 'withdrawn')
  void a
})
test('robots.txt zakazuje: zdroj sa nesťahuje a označí sa ako zablokovaný', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const f = mkFetch({ 'https://feed.example/robots.txt': resp(200, 'User-agent: *\nDisallow: /'), 'https://feed.example/listings.json': resp(200, feedItems([item(1)])) })
  const r = await runAgent(s, { fetchImpl: f, now: NOW, maxMs: 20000 })
  assert.equal(props(s).length, 0); assert.equal(s.db.tables.inv_sources[0].blocked, true); assert.match(s.db.tables.inv_sources[0].blocked_reason, /robots/); assert.notEqual(r.status, 'ok')
})
test('všeobecné filtre: inzerát mimo firemných filtrov sa v všeobecnom režime nezapíše; cielený režim vezme to, čo hľadá dopyt', async () => {
  const s = seedDb({ inv_sources: [SRC()], inv_inquiries: [] })
  const f = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems([item(1), item(2, { mesto: 'Žilina' })])) })
  const r = await runAgent(s, { fetchImpl: f, now: NOW, maxMs: 20000, mode: 'general' })
  assert.equal(r.stats.created, 1); assert.equal(r.stats.filtered, 1)
})
test('zámok: súbežný druhý beh sa nespustí a nevznikne duplicitný zápis', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const f = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems([item(1), item(2)])) })
  const [a, b] = await Promise.all([runAgent(s, { fetchImpl: f, now: NOW, maxMs: 20000 }), runAgent(s, { fetchImpl: f, now: NOW, maxMs: 20000 })])
  const locked = [a, b].filter((x) => x.locked)
  assert.equal(locked.length, 1); assert.equal(props(s).length, 2); assert.equal(s.db.tables.inv_listings.length, 2)
  const c = await runAgent(s, { fetchImpl: f, now: NOW + 1000, maxMs: 20000 })   // po uvoľnení zámku znova ide
  assert.equal(c.ok, true); assert.equal(props(s).length, 2)
})
test('súbežný import toho istého inzerátu nevytvorí duplicitu', async () => {
  const s = seedDb()
  await Promise.all([ingestListing(s, L(), { now: NOW }), ingestListing(s, L(), { now: NOW })])
  assert.equal(s.db.tables.inv_listings.length, 1); assert.equal(props(s).length, 1)
})
test('10: plánovaný beh o 07:00 Europe/Bratislava prebehne bez prehliadača a zanechá výsledok; skôr nebeží', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const f = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems([item(1)])) })
  const at = (hhmm) => zonedTime('2026-11-12', hhmm)   // november = CET (UTC+1)
  assert.equal(new Date(at('07:00')).toISOString(), '2026-11-12T06:00:00.000Z')
  assert.equal(new Date(zonedTime('2026-07-15', '07:00')).toISOString(), '2026-07-15T05:00:00.000Z')   // letný čas UTC+2
  const early = await runIfDue(s, { fetchImpl: f, now: at('06:30'), maxMs: 20000 })
  assert.equal(early.ran, false); assert.equal(early.next, '2026-11-12T06:00:00.000Z')
  const r = await runIfDue(s, { fetchImpl: f, now: at('07:05'), maxMs: 20000 })
  assert.equal(r.ran, true); assert.equal(r.status, 'ok'); assert.equal(r.stats.created, 1)
  const run = s.db.tables.inv_runs[0]
  assert.equal(run.trigger, 'cron'); assert.equal(run.status, 'ok'); assert.ok(run.finished_at)
  const again = await runIfDue(s, { fetchImpl: f, now: at('07:35'), maxMs: 20000 })
  assert.equal(again.ran, false)                      // v ten deň už bežal
  assert.equal(new Date(nextPlannedRun((await loadSettings(s)).agent, run, at('07:35'))).toISOString(), '2026-11-13T06:00:00.000Z')
  const st = agentStatus({ settings: await loadSettings(s), runs: [run], sources: s.db.tables.inv_sources, now: at('07:40') })
  assert.equal(st.active, true); assert.equal(st.state, 'aktívne')
})
test('opakovanie po chybe: neúspešný beh sa zopakuje po čakacej dobe, najviac 3×, a pokračuje od nedokončených zdrojov', async () => {
  const s = seedDb({ inv_sources: [SRC(), SRC({ key: 'feed-b', name: 'Feed B', url: 'https://feed-b.example/l.json' })] })
  const good = resp(200, feedItems([item(1)]))
  const f1 = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed-b.example/robots.txt': resp(404), 'https://feed.example/listings.json': good, 'https://feed-b.example/l.json': resp(500) })
  const at = (hhmm) => zonedTime('2026-11-12', hhmm)
  const r1 = await runIfDue(s, { fetchImpl: f1, now: at('07:05'), maxMs: 20000 })
  assert.equal(r1.status, 'partial')
  assert.equal((await runIfDue(s, { fetchImpl: f1, now: at('07:35'), maxMs: 20000 })).ran, false)   // ešte neuplynula čakacia doba
  const f2 = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed-b.example/robots.txt': resp(404), 'https://feed.example/listings.json': good, 'https://feed-b.example/l.json': resp(200, feedItems([item(9)])) })
  const r2 = await runIfDue(s, { fetchImpl: f2, now: at('08:10'), maxMs: 20000 })
  assert.equal(r2.ran, true); assert.equal(r2.reason, 'opakovanie po chybe'); assert.equal(r2.status, 'ok')
  assert.equal(s.db.tables.inv_runs[1].attempt, 2)
  assert.equal(r2.sources.find((x) => x.key === 'feed-a').resumed, true)   // už hotový zdroj sa neťahá znova
  assert.equal(props(s).length, 2)
})
test('agent sa neoznačí ako aktívny bez zdroja a bez úspešného behu', async () => {
  const s = seedDb()
  const st0 = agentStatus({ settings: await loadSettings(s), runs: [], sources: [], now: NOW })
  assert.equal(st0.active, false); assert.match(st0.state, /nenakonfigurované/)
  const r = await runAgent(s, { now: NOW, maxMs: 5000, fetchImpl: mkFetch({}) })
  assert.equal(r.stats.no_sources, true)
  const st1 = agentStatus({ settings: await loadSettings(s), runs: s.db.tables.inv_runs.slice().reverse(), sources: [], now: NOW })
  assert.equal(st1.active, false)
})
test('beh prepočíta zhody a pošle prehľad; rovnaký beh znova neposiela rovnaké upozornenia', async () => {
  const s = seedDb({ inv_sources: [SRC()] })
  const f = mkFetch({ 'https://feed.example/robots.txt': resp(404), 'https://feed.example/listings.json': resp(200, feedItems([item(1)])) })
  const r1 = await runAgent(s, { fetchImpl: f, now: NOW, maxMs: 20000 })
  assert.equal(r1.stats.matches_created, 1); assert.equal(r1.stats.notifications, 1)
  const r2 = await runAgent(s, { fetchImpl: f, now: NOW + 3600e3, maxMs: 20000 })
  assert.equal(r2.stats.notifications, 0); assert.equal(matches(s).length, 1)
})
test('potvrdenie dostupnosti predajcom je oddelené od existencie inzerátu', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L(), { now: NOW })
  assert.equal(props(s)[0].last_confirmed_at, null); assert.notEqual(props(s)[0].status, 'confirmed')
  await confirmAvailability(s, a.property_id, ZUZKA, { viewingPossible: true })
  assert.equal(props(s)[0].status, 'confirmed'); assert.ok(props(s)[0].last_confirmed_at); assert.equal(props(s)[0].last_confirmed_by, ZUZKA)
})
test('ručne potvrdené polia agent neprepíše; neznáme hodnoty zo zdroja nevymažú známe', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L(), { now: NOW })
  await updateProperty(s, a.property_id, { area_interior: 70, ...COSTS }, ZUZKA)
  await ingestListing(s, L({ area_interior: 62, checked_at: '2026-11-13T08:00:00Z' }), { now: NOW })
  assert.equal(props(s)[0].area_interior, 70)
  await ingestListing(s, { ...L({ checked_at: '2026-11-14T08:00:00Z' }), floor: null, district: null }, { now: NOW })
  assert.equal(props(s)[0].floor, 3); assert.equal(props(s)[0].district, 'Staré Mesto')
})
test('úprava: nula v cene alebo výmere sa odmietne, prázdne pole = neznáme', async () => {
  const s = seedDb()
  const a = await ingestListing(s, L(), { now: NOW })
  assert.equal((await updateProperty(s, a.property_id, { price: 0 }, ZUZKA)).ok, false)
  assert.equal((await updateProperty(s, a.property_id, { reno: 'abc' }, ZUZKA)).ok, false)
  await updateProperty(s, a.property_id, { reno: '' }, ZUZKA)
  assert.equal(props(s)[0].reno ?? null, null)
})
test('prístup k odpočtu: isRunDue nespúšťa vypnutého agenta', async () => {
  const s = seedDb()
  const settings = await loadSettings(s)
  assert.equal(isRunDue({ agent: { ...settings.agent, enabled: false }, lastRun: null, now: NOW }).due, false)
})
import { isPublicHttpsUrl, fetchText, checkUrl } from '../lib/inv-sources.js'
test('bezpečnosť: čítajú sa len verejné https adresy (nie localhost, IP, interné názvy, http, prihlasovacie údaje)', async () => {
  for (const ok of ['https://www.nehnutelnosti.sk/123/byt', 'https://feed.example/l.json']) assert.equal(isPublicHttpsUrl(ok), true, ok)
  for (const bad of ['http://portal.sk/1', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://svc.internal/x', 'https://intranet/x', 'https://user:pw@portal.sk/x', 'ftp://portal.sk/x', 'nie url']) assert.equal(isPublicHttpsUrl(bad), false, bad)
  let called = false
  const r = await fetchText('https://169.254.169.254/latest', { fetchImpl: async () => { called = true; return resp(200) } })
  assert.equal(r.status, 0); assert.equal(called, false)
  assert.equal((await checkUrl('https://10.0.0.5/inzerat/1234567', { fetchImpl: async () => { called = true; return resp(200) } })).state === 'ok', false)
})
