import test from 'node:test'
import assert from 'node:assert/strict'
import { safeHref, eventLabel, moduleLabel, unreadLabel, inboxCard } from '../lib/core.js'
import { buildCards } from '../lib/myday.js'

test('safeHref pustí len cesty v appke', () => {
  assert.equal(safeHref('/uprat?u=1'), '/uprat?u=1')
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', '', null, undefined, 5]) assert.equal(safeHref(bad), null)
})
test('názvy udalostí a modulov, neznáme ostanú ako kód', () => {
  assert.equal(eventLabel('task.finish'), 'dokončila upratovanie')
  assert.equal(eventLabel('x.y'), 'x.y')
  assert.equal(moduleLabel('upratovanie'), 'Upratovanie')
  assert.equal(moduleLabel('nieco'), 'nieco')
})
test('slovenské číslovky pri neprečítaných', () => {
  assert.equal(unreadLabel(1), '1 neprečítaná správa')
  assert.equal(unreadLabel(3), '3 neprečítané správy')
  assert.equal(unreadLabel(7), '7 neprečítaných správ')
})
test('karta Schránka len keď je niečo neprečítané', () => {
  assert.equal(inboxCard(0), null)
  assert.equal(inboxCard(undefined), null)
  const c = inboxCard(2, [{ title: 'A', kind: 'alert' }, { title: 'B', kind: 'info' }])
  assert.equal(c.big.value, 2)
  assert.equal(c.cta.href, '/schranka')
  assert.equal(c.items[0].tag, 'dôležité')
})
test('Môj deň zahrnie schránku pre každú rolu', () => {
  const cards = buildCards({ inbox: { n: 1, items: [{ title: 'Nový byt', kind: 'task' }] } }, { roles: ['cleaning'], isAdmin: false })
  assert.ok(cards.find((c) => c.id === 'inbox'))
})
