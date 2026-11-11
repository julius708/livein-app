import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { runAgent } from '../lib/inv-agent.js'
import { parseListings, cleanFound, buildQuery, searchOnce } from '../lib/inv-websearch.js'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const resp = (st, body = '') => ({ status: st, ok: st < 300, text: async () => body, json: async () => JSON.parse(body) })
const ld = (price, area) => `<html><script type="application/ld+json">{"@type":"Apartment","name":"2-izbový byt","offers":{"price":${price}},"address":{"addressLocality":"Bratislava","streetAddress":"Obchodná 5"},"floorSize":{"value":${area}}}</script></html>`
const anthropic = (items) => async () => resp(200, JSON.stringify({ content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] }, { type: 'text', text: 'Tu sú výsledky:\n```json\n' + JSON.stringify(items) + '\n```' }] }))
const found = [
  { url: 'https://portal-a.sk/inzerat/1234567?utm_source=x', title: '2-izbový byt', city: 'Bratislava', address: 'Obchodná 5', price: 165000, area_interior: 55, rooms: 2 },
  { url: 'https://portal-b.sk/inzerat/7654321', title: '3-izbový byt', city: 'Bratislava', address: 'Dunajská 12', price: 190000, area_interior: 70, rooms: 3 },
  { url: 'https://portal-c.sk/inzerat/1111111', title: 'mŕtvy', city: 'Bratislava', address: 'Zámocká 1', price: 120000, area_interior: 40, rooms: 2 },
  { url: 'https://portal-d.sk/inzerat/2222222', title: 'blokovaný', city: 'Bratislava', address: 'Šancová 3', price: 150000, area_interior: 50, rooms: 2 },
  { url: 'http://nebezpecny.sk/1', title: 'http', city: 'Bratislava', price: 100000 },
  { url: 'https://portal-e.sk/inzerat/3333333', title: 'bez ceny', city: 'Bratislava' },
]
const pages = async (u) => {
  if (u.endsWith('robots.txt')) return resp(404)
  if (u.startsWith('https://portal-a.sk/inzerat')) return resp(200, ld(162000, 55))   // cena na stránke sa líši od AI (AI neoverené, stránka platí)
  if (u.startsWith('https://portal-b.sk/inzerat')) return resp(200, '<html>bez štruktúrovaných údajov</html>')
  if (u.startsWith('https://portal-c.sk')) return resp(404)
  if (u.startsWith('https://portal-d.sk')) return resp(403)
  return resp(500)
}
const SRC = { key: 'web-search', name: 'Vyhľadávanie na internete (AI)', kind: 'feed', enabled: true, mode: 'both', consecutive_failures: 0, config: { engine: 'web_search' } }

test('AI vyhľadávanie: nájdené inzeráty sa overia na stránke; mŕtve sa zahodia; neoverené sú označené ako predpoklad; nič sa neoznačí ako odstránené', async () => {
  const s = fakeSupabase({ inv_sources: [SRC] })
  process.env.ANTHROPIC_API_KEY = 'test-key'
  try {
    const r = await runAgent(s, { fetchImpl: pages, aiFetch: anthropic(found), now: NOW, maxMs: 30000, mode: 'general' })
    assert.equal(r.ok, true); assert.equal(r.status, 'ok')
    const props = s.db.tables.inv_properties
    assert.equal(props.length, 3)   // a, b, d; c je mŕtvy odkaz, http a bez ceny sa zahodili
    const a = props.find((p) => p.address === 'Obchodná 5')
    assert.equal(a.price, 162000)   // overené zo stránky
    assert.equal(a.prov.price.kind, 'source')
    const b = props.find((p) => p.address === 'Dunajská 12')
    assert.equal(b.price, 190000); assert.equal(b.prov.price.kind, 'assumption'); assert.match(b.prov.price.ref, /neoverené/)
    assert.ok(props.every((p) => p.status === 'new'))
    assert.equal(s.db.tables.inv_listings.length, 3); assert.ok(s.db.tables.inv_listings.every((l) => l.state === 'active'))
    const row = r.sources[0]; assert.match(row.notes.join(' '), /overených na stránke 1/)
    // opakovanie nezdvojí; chýbajúci výsledok pri ďalšom hľadaní neznamená odstránené
    const r2 = await runAgent(s, { fetchImpl: pages, aiFetch: anthropic(found.slice(0, 1)), now: NOW + 864e5, maxMs: 30000, mode: 'general' })
    assert.equal(r2.ok, true); assert.equal(s.db.tables.inv_properties.length, 3); assert.ok(s.db.tables.inv_listings.every((l) => l.state === 'active' && l.missing_checks === 0))
  } finally { delete process.env.ANTHROPIC_API_KEY }
})
test('AI vyhľadávanie: bez kľúča alebo pri chybe API je zdroj označený chybou a nič sa nezmení', async () => {
  const s = fakeSupabase({ inv_sources: [SRC] })
  delete process.env.ANTHROPIC_API_KEY
  const r = await runAgent(s, { fetchImpl: pages, aiFetch: anthropic(found), now: NOW, maxMs: 20000, mode: 'general' })
  assert.notEqual(r.status, 'ok'); assert.match(r.sources[0].error, /ANTHROPIC_API_KEY/); assert.equal((s.db.tables.inv_properties || []).length, 0)
  assert.ok(s.db.tables.inv_sources[0].last_error)
  process.env.ANTHROPIC_API_KEY = 'k'
  try {
    const bad = async () => resp(500, 'chyba')
    const r2 = await runAgent(s, { fetchImpl: pages, aiFetch: bad, now: NOW + 3600e3, maxMs: 20000, mode: 'general' })
    assert.notEqual(r2.status, 'ok'); assert.match(r2.sources[0].error, /Vyhľadávanie zlyhalo/)
    const e = await searchOnce('x', { key: 'k', fetchImpl: async () => { throw new Error('ECONNRESET') } })
    assert.equal(e.ok, false)
  } finally { delete process.env.ANTHROPIC_API_KEY }
})
test('AI vyhľadávanie: cielený režim hľadá podľa dopytu klienta (mesto, strop ceny, dispozícia, vylúčené lokality)', async () => {
  const q = buildQuery({ city: 'Bratislava', types: ['byt'], rooms: [2, 3], priceMax: 200000, excluded: ['Petržalka'] })
  for (const part of ['Bratislava', '200000', '2 alebo 3', 'Petržalka', 'priamy odkaz']) assert.ok(q.includes(part), part)
  const seen = []
  const s = fakeSupabase({ inv_sources: [SRC], inv_inquiries: [{ id: 'q1', lead_id: 'l', status: 'confirmed', cities: ['Košice'], types: ['byt'], rooms: [2], budget_kind: 'total', budget_total: 120000, excluded_areas: [] }] })
  process.env.ANTHROPIC_API_KEY = 'k'
  try {
    await runAgent(s, { fetchImpl: pages, aiFetch: async (u, o) => { seen.push(JSON.parse(o.body).messages[0].content); return anthropic([])() }, now: NOW, maxMs: 20000, mode: 'targeted' })
    assert.ok(seen.some((t) => /Košice/.test(t) && /120000/.test(t)))
  } finally { delete process.env.ANTHROPIC_API_KEY }
})
test('parsovanie a čistenie výsledkov AI', () => {
  assert.equal(parseListings('nič').length, 0); assert.equal(parseListings('[1,2]').length, 0); assert.equal(parseListings('text [ {"url":"x"} ] koniec').length, 1)
  const c = cleanFound([{ url: 'https://a.sk/inzerat/1234567', price: '150 000' }, { url: 'https://a.sk/inzerat/1234567?utm_source=z', price: 150000 }, { url: 'https://127.0.0.1/x', price: 1 }, { url: 'https://b.sk/i/987654', price: 0 }])
  assert.equal(c.found.length, 1); assert.equal(c.found[0].price, 150000); assert.equal(c.rejected.length, 2)
})
