import test from 'node:test'
import assert from 'node:assert/strict'
import { projectAllowed } from '../lib/guru-asana.js'

test('citlivé projekty: prihlasovacie údaje nikto, financie a HR len admin', () => {
  const creds = { gid: '1', name: 'Objednávky, nákupy, prihlasovacie údaje' }
  const invoices = { gid: '2', name: 'Faktury' }
  const acc = { gid: '3', name: 'Účtovníctvo' }
  const hr = { gid: '4', name: 'Dochádzka & dovolenky' }
  const cs = { gid: '5', name: 'Požiadavky z customer service & upratovanie' }
  const dmg = { gid: '6', name: 'Damages Reporting' }
  assert.equal(projectAllowed(creds, { isAdmin: true }), false)
  assert.equal(projectAllowed(creds, { isAdmin: false }), false)
  assert.equal(projectAllowed(invoices, { isAdmin: true }), true)
  assert.equal(projectAllowed(invoices, { isAdmin: false }), false)
  assert.equal(projectAllowed(acc, { isAdmin: false }), false)
  assert.equal(projectAllowed(hr, { isAdmin: false }), false)
  assert.equal(projectAllowed(cs, { isAdmin: false }), true)
  assert.equal(projectAllowed(dmg, { isAdmin: false }), true)
})

test('config prepíše predvolené pravidlá', () => {
  const p = { gid: '9', name: 'Reviews' }
  assert.equal(projectAllowed(p, { isAdmin: true, cfg: { deny_all: ['9'] } }), false)
  assert.equal(projectAllowed(p, { isAdmin: false, cfg: { deny_staff: ['9'] } }), false)
  assert.equal(projectAllowed({ gid: '2', name: 'Faktury' }, { isAdmin: false, cfg: { allow_staff: ['2'] } }), true)
})
