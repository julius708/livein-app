import test from 'node:test'
import assert from 'node:assert/strict'
import { assignMessage, eveningMessage, alertMessage, proposalMessage, emailFor, notifyOn, bytWord, upratWord } from '../lib/cl-notify.js'
import { notifyPeople } from '../lib/cl-notify-server.js'

const T = (name, date) => ({ listing_name: name, date })

test('texty: skloňovanie a správy pre upratovačku aj manažéra', () => {
  assert.equal(bytWord(1), '1 byt'); assert.equal(bytWord(3), '3 byty'); assert.equal(bytWord(7), '7 bytov')
  assert.equal(upratWord(1), '1 upratovanie'); assert.equal(upratWord(2), '2 upratovania'); assert.equal(upratWord(5), '5 upratovaní')
  const a = assignMessage([T('Byt 1', '2026-11-23'), T('Byt 2', '2026-11-23')])
  assert.equal(a.title, 'Nové upratovania: 2'); assert.match(a.body, /Po 23\. 11\.: Byt 1, Byt 2/); assert.equal(a.url, '/uprat')
  assert.equal(assignMessage([T('Byt 1', '2026-11-23')]).title, 'Nové upratovanie')
  assert.match(assignMessage([T('A', '2026-11-23'), T('B', '2026-11-25')]).body, /Po 23\. 11\. – St 25\. 11\./)
  const many = assignMessage(Array.from({ length: 9 }, (_, i) => T('B' + i, '2026-11-23'))).body
  assert.match(many, /a 3 ďalších/)
  const e = eveningMessage([T('Byt 1', '2026-11-23'), T('Byt 2', '2026-11-23'), T('Byt 3', '2026-11-23')], '2026-11-23')
  assert.equal(e.title, 'Zajtra máš 3 upratovania')
  const al = alertMessage({ kind: 'late', cleaner: 'Anna', flat: 'Byt 1', date: '2026-11-23', text: '20 minút' })
  assert.match(al.title, /Meškám: Anna/); assert.match(al.body, /Byt 1 · Po 23\. 11\.: 20 minút/)
  const p = proposalMessage({ day: '2026-11-23', assignments: [{ name: 'Anna' }, { name: 'Anna' }, { name: 'Beáta' }], unassigned: [{}], total: 4 }, '/x')
  assert.match(p.title, /Na Po 23\. 11\. je 4 byty bez upratovačky/); assert.match(p.body, /Anna 2, Beáta 1/); assert.match(p.body, /Nepriradené: 1/)
})

test('e-mail: absolútny odkaz, escapovanie; nastavenia upozornení sú predvolene zapnuté', () => {
  const m = emailFor({ title: 'A <b>', body: 'x & y', url: '/uprat' }, 'https://app.example.org')
  assert.equal(m.subject, 'A <b>'); assert.ok(m.html.includes('A &lt;b&gt;') && m.html.includes('x &amp; y')); assert.ok(m.html.includes('https://app.example.org/uprat')); assert.ok(m.text.endsWith('https://app.example.org/uprat'))
  assert.equal(notifyOn({}, 'assign'), true); assert.equal(notifyOn(null, 'assign'), true)
  assert.equal(notifyOn({ notify: { assign: false } }, 'assign'), false); assert.equal(notifyOn({ notify: { assign: false } }, 'evening_reminder'), true)
})

test('odosielanie: push tým, čo majú odber, e-mail ostatným; chyba nezhodí nič', async () => {
  const sentPush = [], sentMail = []
  const subs = [{ id: 1, user_email: 'a@x.sk', endpoint: 'https://p/1', p256dh: 'k', auth: 'a' }]
  const admin = { from: () => { const q = { select: () => q, eq: () => q, is: () => q, in: async () => ({ data: subs }), update: () => ({ eq: async () => ({}) }) }; return q } }
  const deps = { admin, pushReady: () => true, mailReady: () => true, pusher: async () => ({ sendNotification: async (s, body) => { sentPush.push([s.endpoint, JSON.parse(body).title]) } }), sendMail: async (m) => { sentMail.push(m.to); return { ok: true } } }
  const r = await notifyPeople([{ email: 'A@x.sk', title: 'T1', body: 'b' }, { email: 'b@x.sk', title: 'T2', body: 'b' }], 'https://o', deps)
  assert.deepEqual(r, { push: 1, email: 1, failed: 0 }); assert.deepEqual(sentPush, [['https://p/1', 'T1']]); assert.deepEqual(sentMail, ['b@x.sk'])
  // bez VAPID kľúčov idú všetci e-mailom
  sentMail.length = 0
  const r2 = await notifyPeople([{ email: 'a@x.sk', title: 'T', body: 'b' }], 'https://o', { ...deps, pushReady: () => false })
  assert.deepEqual(r2, { push: 0, email: 1, failed: 0 })
  // zlyhanie e-mailu sa len započíta
  const r3 = await notifyPeople([{ email: 'z@x.sk', title: 'T', body: 'b' }], 'https://o', { ...deps, pushReady: () => false, sendMail: async () => ({ ok: false }) })
  assert.deepEqual(r3, { push: 0, email: 0, failed: 1 })
  // výnimka zo servisného klienta nezhodí volajúceho
  const r4 = await notifyPeople([{ email: 'z@x.sk', title: 'T', body: 'b' }], 'https://o', { ...deps, admin: { from: () => { throw new Error('boom') } } })
  assert.equal(r4.failed, 1)
  assert.deepEqual(await notifyPeople([], 'https://o', deps), { push: 0, email: 0, failed: 0 })
})
