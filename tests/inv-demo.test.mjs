import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { seedDemo, clearDemo } from '../lib/inv-demo.js'

const now = Date.parse('2026-11-12T10:00:00Z')
test('ukážkové dáta: nehnuteľnosti, klienti, dopyty, zhody, rozhodnutia, úloha a ponuka; nič sa nezdvojí; žiadne upozornenia', async () => {
  const s = fakeSupabase()
  const r = await seedDemo(s, { actor: 'julius@live-in.co.uk', now })
  assert.equal(r.ok, true)
  const t = s.db.tables
  assert.ok(t.inv_properties.length >= 11); assert.equal(t.leads.length, 3); assert.equal(t.inv_inquiries.length, 3)
  assert.ok(t.leads.every((l) => l.origin === 'demo' && l.name.startsWith('[UKÁŽKA]') && l.kind === 'not_lead' && l.due_at == null))
  assert.ok(t.inv_properties.every((p) => p.created_by === 'demo'))
  const cats = new Set(t.inv_matches.map((m) => m.category))
  assert.ok(cats.has('match') && cats.has('outside') && cats.has('unavailable'))
  assert.ok(t.inv_matches.some((m) => m.decision === 'shortlist') && t.inv_matches.some((m) => m.decision === 'rejected' && m.decision_reason) && t.inv_matches.some((m) => m.decision === 'viewing'))
  assert.equal(t.inv_offers.length, 1); assert.ok(t.inv_tasks.length >= 2)
  assert.equal((t.notifications || []).length, 0)   // ukážka nikoho neupozorňuje
  assert.ok((t.inv_merge_candidates || []).length >= 1)   // druhý portál = návrh na zlúčenie
  assert.ok(t.inv_price_history.some((h) => h.price === 161000))   // zmena ceny zachovaná v histórii
  const calc = t.inv_calcs.find((c) => c.id === t.inv_properties.find((p) => p.address === 'Dunajská 12').calc_id).result
  assert.equal(calc.str.base.adr, 98); assert.equal(calc.str.conservative.adr, 90)   // nastavenie podľa Lazaretskej 15
  assert.equal(calc.inputs.find((i) => i.key === 'str_adr').kind, 'setting')
  // opakované naplnenie nič nezdvojí
  assert.equal((await seedDemo(s, { actor: 'x', now })).already, true); assert.equal(t.leads.length, 3)
  // nastavenia podľa projektu sa uložili
  assert.equal(t.inv_settings.find((x) => x.key === 'calc').value.ops.portal_pct, 15)
})
test('odstránenie ukážky zmaže len ukážkové dáta a nechá ostatné', async () => {
  const s = fakeSupabase({ leads: [{ id: 'real-1', name: 'Skutočný Klient', origin: 'zapier', kind: 'lead' }], inv_properties: [{ id: 'real-p', created_by: 'zuzana@x.sk', status: 'new', city: 'Bratislava' }] })
  await seedDemo(s, { actor: 'a@b.sk', now })
  const c = await clearDemo(s)
  assert.equal(c.ok, true)
  const t = s.db.tables
  assert.deepEqual(t.leads.map((l) => l.id), ['real-1']); assert.deepEqual(t.inv_properties.map((p) => p.id), ['real-p'])
  for (const k of ['inv_inquiries', 'inv_listings', 'inv_calcs']) assert.equal((t[k] || []).filter((x) => x.property_id && x.property_id !== 'real-p').length, 0, k)
  assert.equal((t.inv_events || []).filter((e) => e.property_id !== 'real-p').length, 0)
})
