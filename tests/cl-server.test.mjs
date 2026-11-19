import test from 'node:test'
import assert from 'node:assert/strict'
import { isMissingTable, rpc, clContext, managerData, msgFor, MSG } from '../lib/cl-server.js'
import { demoData } from '../lib/cl-demo.js'
import { proposeAssignments } from '../lib/cl-assign.js'

const fakeS = (handlers) => ({
  rpc: async (fn, args) => handlers.rpc(fn, args),
  from: (t) => { const q = { _t: t, select() { return q }, eq() { return q }, maybeSingle: async () => handlers.row(t) } ; return q },
})

test('chýbajúca tabuľka sa pozná, ostatné chyby nie', () => {
  assert.ok(isMissingTable({ code: '42P01', message: 'relation "public.cl_staff" does not exist' }))
  assert.ok(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.cl_staff' in the schema cache" }))
  assert.ok(isMissingTable({ code: 'PGRST202', message: 'Could not find the function public.cl_sync_tasks' }))
  assert.ok(!isMissingTable({ code: '42501', message: 'permission denied' }))
  assert.ok(!isMissingTable(null))
})

test('rpc: stav z databázy sa zmení na slovenskú hlášku, oprávnenie a výpadok nepadnú', async () => {
  const r1 = await rpc(fakeS({ rpc: async () => ({ data: { ok: false, status: 'items_open', open: 2 }, error: null }) }), 'cl_finish_task', {})
  assert.equal(r1.ok, false); assert.equal(r1.error, MSG.items_open)
  const r2 = await rpc(fakeS({ rpc: async () => ({ data: null, error: { code: '42501', message: 'not allowed' } }) }), 'cl_assign', {})
  assert.deepEqual({ ok: r2.ok, e: r2.error }, { ok: false, e: 'Na toto nemáš oprávnenie.' })
  const r3 = await rpc(fakeS({ rpc: async () => ({ data: null, error: { code: '42P01', message: 'does not exist' } }) }), 'cl_assign', {})
  assert.equal(r3.demo, true)
  const r4 = await rpc(fakeS({ rpc: async () => ({ data: { ok: true, id: 'x' }, error: null }) }), 'cl_add_photo', {})
  assert.equal(r4.ok, true)
  assert.equal(msgFor({ status: 'nezname' }), 'Nepodarilo sa.')
})

test('clContext: manažérka, upratovačka, admin bez profilu, ukážkový režim', async () => {
  const v = (isAdmin = false) => ({ user: { email: 'X@x.sk' }, isAdmin })
  const row = (data, error = null) => fakeS({ row: async () => ({ data, error }) })
  assert.deepEqual(pick(await clContext({ ...v(), s: row({ email: 'x@x.sk', role: 'manager', active: true }) })), { demo: false, isManager: true, isCleaner: false })
  assert.deepEqual(pick(await clContext({ ...v(), s: row({ email: 'x@x.sk', role: 'cleaner', active: true }) })), { demo: false, isManager: false, isCleaner: true })
  assert.deepEqual(pick(await clContext({ ...v(), s: row({ email: 'x@x.sk', role: 'cleaner', active: false }) })), { demo: false, isManager: false, isCleaner: false }) // vypnutá
  assert.deepEqual(pick(await clContext({ ...v(true), s: row(null) })), { demo: false, isManager: true, isCleaner: false }) // admin je manažér aj bez profilu
  assert.deepEqual(pick(await clContext({ ...v(true), s: row(null, { code: '42P01', message: 'does not exist' }) })), { demo: true, isManager: true, isCleaner: false })
  assert.deepEqual(pick(await clContext({ ...v(), s: row(null, { code: '42P01', message: 'does not exist' }) })), { demo: true, isManager: false, isCleaner: false })
})
const pick = (c) => ({ demo: c.demo, isManager: c.isManager, isCleaner: c.isCleaner })

test('managerData: bez tabuliek vráti ukážkové dáta', async () => {
  const s = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) }
  const d = await managerData(s, { date: '2026-11-19', today: '2026-11-19' })
  assert.equal(d.demo, true); assert.ok(d.tasks.length > 5); assert.ok(d.staff.some((x) => x.role === 'cleaner'))
})

test('ukážkové dáta: všetko je označené ako ukážka a návrh priradenia na nich funguje', () => {
  const d = demoData('2026-11-19')
  assert.ok(d.staff.every((s) => /ukážka/.test(s.name)))
  assert.ok(Object.values(d.flats).every((f) => /ukážka/.test(f.listing_name)))
  assert.ok(d.staff.every((s) => /\.invalid$/.test(s.email))) // žiadne reálne adresy
  const open = d.tasks.filter((t) => !t.cleaner_email)
  const r = proposeAssignments({ tasks: open, staff: d.staff, flats: d.flats, assigned: d.tasks.filter((t) => t.cleaner_email) })
  assert.equal(r.assignments.length + r.unassigned.length, open.length)
  const two = r.assignments.filter((a) => a.email === 'ukazka-a@ukazka.invalid')
  assert.ok(two.length <= 8)
})
