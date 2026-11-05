import test from 'node:test'
import assert from 'node:assert/strict'
import * as N from '../lib/newsletter.js'

const leads = [
  { id: '1', kind: 'client', name: 'Anna Nová', email: 'Anna@x.sk', city_group: 'Bratislava', stage: 'client' },
  { id: '2', kind: 'client', name: 'Peter', email: 'peter@x.sk', city_group: 'Košice', email_optout: true },
  { id: '3', kind: 'client', name: 'Dup', email: 'anna@x.sk', city_group: 'Bratislava' },
  { id: '4', kind: 'lead', name: 'Lead Nový', email: 'lead@x.sk', stage: 'new' },
  { id: '5', kind: 'lead', name: 'Lead Stratený', email: 'lost@x.sk', stage: 'lost' },
  { id: '6', kind: 'client', name: 'Bez mailu', email: null },
  { id: '7', kind: 'client', name: 'Nemarketing', email: 'nm@x.sk', marketing_ok: false },
  { id: '8', kind: 'client', name: 'Odhlásený', email: 'odhl@x.sk' },
]
test('publikum: klienti bez odhlásených a duplicít, leady len výslovne', () => {
  const r = N.pickRecipients(leads, { kind: 'clients' }, { unsubscribed: ['ODHL@x.sk'] })
  assert.deepEqual(r.map((x) => x.email), ['anna@x.sk'])
  assert.equal(N.pickRecipients(leads, { kind: 'clients_city', city_group: 'Košice' }).length, 0)
  assert.deepEqual(N.pickRecipients(leads, { kind: 'leads_open' }).map((x) => x.email), ['lead@x.sk'])
  assert.deepEqual(N.pickRecipients(leads, { kind: 'custom', emails: 'x@y.sk, peter@x.sk\nbad' }).map((x) => x.email), ['x@y.sk'])
})
test('čistenie HTML a personalizácia', () => {
  const h = N.sanitizeHtml('<p onclick="x()">Ahoj <script>evil()</script><a href="javascript:alert(1)">a</a> <a href="https://live-in.international">web</a><img src="http://x/y.png"></p><style>p{}</style>')
  assert.equal(h, '<p>Ahoj <a>a</a> <a href="https://live-in.international">web</a></p>')
  assert.equal(N.personalize('Dobrý deň, {{meno}}!', 'Anna Nová'), 'Dobrý deň, Anna!')
  assert.equal(N.personalize('Dobrý deň, {{ meno }}!', ''), 'Dobrý deň, majiteľ!')
  const mail = N.renderEmail({ subject: 'S', preheader: 'P', bodyHtml: '<h1>{{meno}}</h1>', unsubscribeUrl: 'https://u/x', name: 'Jana K' })
  assert.ok(mail.includes('<h1>Jana</h1>') && mail.includes('https://u/x') && mail.includes('Odhlásiť'))
  assert.equal(N.htmlToText('<p>A&amp;B</p><ul><li>x</li></ul>'), 'A&B\nx')
})
test('JSON z odpovede modelu', () => {
  assert.deepEqual(N.extractJson('Tu je: ```json\n[{"a":1}]\n```'), [{ a: 1 }])
  assert.deepEqual(N.extractJson('{"subject":"x"} koniec'), { subject: 'x' })
  assert.equal(N.extractJson('nič'), null)
  assert.deepEqual(N.parseEmails('A@b.sk; c@d.sk,a@b.sk'), ['a@b.sk', 'c@d.sk'])
})
