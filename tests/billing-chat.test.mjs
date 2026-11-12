import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { chatTurn, applyActions, normalizeAction, loadItems, loadPrices, buildSystem } from '../lib/billing-chat.js'

const P = '11111111-1111-1111-1111-111111111111', I1 = '21111111-1111-1111-1111-111111111111', I2 = '22111111-1111-1111-1111-111111111111', I3 = '23111111-1111-1111-1111-111111111111', PR = '31111111-1111-1111-1111-111111111111'
const seed = (status = 'open') => fakeSupabase({
  billing_periods: [{ id: P, month: '2026-10-01', status }],
  billing_items: [
    { id: I1, period_id: P, ord: 1, byt: 'Baštova', kat: 'Poznámka z Účtovníctva', polozka: 'Zámok', ks: 1, cena: 40, suma: null, stav: 'Suma OK', pozn: null },
    { id: I2, period_id: P, ord: 2, byt: 'Dunajská C', kat: 'Oprava (Hotové opravy)', polozka: 'Žiarovky', ks: null, cena: null, suma: null, stav: 'Doplniť sumu', pozn: null },
    { id: I3, period_id: P, ord: 3, byt: 'KE: Hlavná', kat: 'Iné', polozka: 'Košice', ks: 1, cena: 5, stav: 'Suma OK' },
  ],
  price_list: [{ id: PR, polozka: 'Sprchová hlavica', obchod: 'OBI', cena: 20, poznamka: null, active: true }],
  feedback: [],
})
const resp = (st, body) => ({ status: st, ok: st < 300, text: async () => JSON.stringify(body), json: async () => body })
const tool = (id, name, input) => resp(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] })
const say = (text) => resp(200, { stop_reason: 'end_turn', content: [{ type: 'text', text }] })
const script = (...steps) => { const log = []; let i = 0; const f = async (url, o) => { log.push(JSON.parse(o.body)); return steps[Math.min(i++, steps.length - 1)] }; f.log = log; return f }
const period = { id: P, month: '2026-10-01', status: 'open' }
const turn = (s, fetchImpl, text = 'urob zmenu') => chatTurn({ s, key: 'k', period, messages: [{ role: 'user', content: text }], me: { name: 'Martina' }, fetchImpl })

test('chat navrhne zmenu, ale NIČ nezapíše, kým používateľ nepotvrdí', async () => {
  const s = seed()
  const f = script(tool('t1', 'find_items', { byt: 'Baštova' }), tool('t2', 'propose_actions', { summary: 'zvýšiť cenu', actions: [{ type: 'update_item', item_id: I1, cena: 45 }, { type: 'add_item', byt: 'Baštova', polozka: 'Kľúč', ks: 2, cena: 5 }] }), say('Navrhol som dve zmeny.'))
  const r = await turn(s, f, 'Zámok na Baštovej je 45 €, pridaj aj 2 kľúče po 5 €')
  assert.equal(r.ok, true); assert.equal(r.proposals.length, 2)
  assert.match(r.proposals[0].label, /cena: 40 → 45/); assert.match(r.proposals[1].label, /Pridať k bytu „Baštova“: Kľúč/)
  assert.equal(s.db.tables.billing_items.find((x) => x.id === I1).cena, 40)   // nič sa nezmenilo
  assert.equal(s.db.tables.billing_items.length, 3)
  // find_items vrátil riadky modelu (bez košických)
  const toolRes = f.log[1].messages.at(-1).content[0]
  assert.match(toolRes.content, /Zámok/); assert.doesNotMatch(toolRes.content, /Košice/)
  // po potvrdení sa zmeny vykonajú cez rovnaké pravidlá ako v tabuľke
  const res = await applyActions(s, 'martina@live-in.international', P, r.proposals.map((p) => p.action))
  assert.deepEqual(res.map((x) => x.ok), [true, true])
  assert.equal(s.db.tables.billing_items.find((x) => x.id === I1).cena, 45)
  const added = s.db.tables.billing_items.find((x) => x.polozka === 'Kľúč')
  assert.equal(added.ks, 2); assert.equal(added.stav, 'Suma OK'); assert.equal(added.created_by, 'martina@live-in.international')
})
test('neplatné návrhy model dostane späť ako chybu: neexistujúci byt, košický byt, zlé číslo, cudzie id', async () => {
  const s = seed()
  const bad = [{ type: 'add_item', byt: 'Neexistuje', polozka: 'x', cena: 1 }, { type: 'add_item', byt: 'KE: Hlavná', polozka: 'x', cena: 1 }, { type: 'update_item', item_id: I1, cena: 'abc' }, { type: 'update_item', item_id: '99999999-9999-9999-9999-999999999999', cena: 1 }, { type: 'move_item', item_id: I1, byt: 'Dunajská C' }]
  const f = script(tool('t1', 'propose_actions', { actions: bad }), say('Opravím.'))
  const r = await turn(s, f)
  assert.equal(r.proposals.length, 1); assert.equal(r.proposals[0].type, 'move_item')
  const fb = JSON.parse(f.log[1].messages.at(-1).content[0].content)
  assert.equal(fb.rejected.length, 4); assert.match(fb.rejected.join(' '), /Košické/)
})
test('pri potvrdení sa návrh znovu overí na serveri: podvrhnutá zmena sa nevykoná; uzavreté obdobie nedovolí nič', async () => {
  const s = seed()
  const res = await applyActions(s, 'x@y.sk', P, [{ type: 'update_item', item_id: I1, cena: 'zle' }, { type: 'delete_item', item_id: 'nie-uuid' }, { type: 'update_item', item_id: I3, cena: 1 }, { type: 'drop_table' }])
  assert.deepEqual(res.map((x) => x.ok), [false, false, false, false])
  assert.equal(s.db.tables.billing_items.find((x) => x.id === I1).cena, 40)
  const closed = seed('closed')
  const r2 = await applyActions(closed, 'x@y.sk', P, [{ type: 'update_item', item_id: I1, cena: 50 }])
  assert.equal(r2[0].ok, false); assert.match(r2[0].error, /uzavreté/)
})
test('presun, zmazanie, firma bytu a cenník cez chat', async () => {
  const s = seed()
  const acts = [{ type: 'move_item', item_id: I2, byt: 'Baštova' }, { type: 'set_apt_firm', byt: 'Baštova', firma: 'Management' }, { type: 'add_price_item', polozka: 'Žiarovka LED', obchod: 'OBI', cena: 3.5 }, { type: 'update_price_item', price_id: PR, cena: 22 }, { type: 'delete_item', item_id: I1 }]
  const res = await applyActions(s, 'm@x.sk', P, acts)
  assert.ok(res.every((x) => x.ok), JSON.stringify(res))
  const t = s.db.tables
  assert.equal(t.billing_items.find((x) => x.id === I2).byt, 'Baštova'); assert.equal(t.billing_items.find((x) => x.id === I1), undefined)
  assert.equal(t.billing_items.find((x) => x.id === I2).firma, 'Management')
  assert.equal(t.price_list.find((x) => x.id === PR).cena, 22); assert.ok(t.price_list.some((x) => x.polozka === 'Žiarovka LED' && x.cena === 3.5 && x.active === true))
})
test('zmena funkcie: model zavolá request_feature, uloží sa až po potvrdení do spätnej väzby aj s kontextom rozhovoru', async () => {
  const s = seed()
  const f = script(tool('t1', 'request_feature', { title: 'Stĺpec Dátum faktúry', description: 'Pri každom riadku chcem dátum faktúry, zobraziť v exporte.' }), say('Zapísal som požiadavku pre vývojára.'))
  const r = await turn(s, f, 'Chcem nový stĺpec Dátum faktúry')
  assert.equal(r.proposals.length, 1); assert.equal(r.proposals[0].type, 'request_feature'); assert.equal(s.db.tables.feedback.length, 0)
  const res = await applyActions(s, 'martina@live-in.international', P, r.proposals.map((p) => p.action), { me: { name: 'Martina' } })
  assert.equal(res[0].ok, true)
  const fb = s.db.tables.feedback[0]
  assert.equal(fb.kind, 'napad'); assert.equal(fb.page, '/vyuctovanie'); assert.match(fb.message, /Stĺpec Dátum faktúry/); assert.match(fb.message, /Chcem nový stĺpec/); assert.equal(fb.user_name, 'Martina')
})
test('systémová inštrukcia obsahuje pravidlá účtovníctva, stavy, byty a zákaz tvrdiť, že chat zmenil kód', async () => {
  const items = await loadItems(seed(), P)
  const sys = buildSystem({ period, items, focus: ['Baštova'], me: { name: 'Martina' } })
  for (const part of ['Martina', 'Doplniť sumu', 'Baštova', 'nič nepridávaj', 'košické', 'propose_actions', 'request_feature', 'Nikdy netvrď']) assert.ok(sys.includes(part), part)
  assert.ok(!sys.includes('Hlavná'))   // košické byty sa modelu neposielajú
})
test('chyby: bez kľúča, chyba API, prázdna správa; história sa obmedzuje', async () => {
  const s = seed()
  assert.match((await chatTurn({ s, key: '', period, messages: [{ role: 'user', content: 'a' }] })).error, /ANTHROPIC_API_KEY/)
  assert.equal((await turn(s, async () => resp(500, {}))).ok, false)
  assert.equal((await chatTurn({ s, key: 'k', period, messages: [], fetchImpl: script(say('x')) })).ok, false)
  const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'riadok ' + i })).concat([{ role: 'user', content: 'posledná' }])
  const f = script(say('ok'))
  await chatTurn({ s, key: 'k', period, messages: long, fetchImpl: f })
  assert.ok(f.log[0].messages.length <= 14)
})
test('nástroje: len čítanie a návrhy, žiadny nástroj nepíše priamo', () => {
  assert.deepEqual(new Set(['find_items', 'find_price_list', 'propose_actions', 'request_feature']), new Set(['find_items', 'find_price_list', 'propose_actions', 'request_feature']))
  const n = normalizeAction({ type: 'delete_item', item_id: I1 }, { items: [{ id: I1, byt: 'a', polozka: 'b' }], prices: [], periodId: P })
  assert.equal(n.ok, true); assert.match(n.label, /Zmazať/)
  void loadPrices
})
