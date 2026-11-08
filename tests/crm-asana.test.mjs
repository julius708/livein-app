import test from 'node:test'
import assert from 'node:assert/strict'
import { contactKeys, leadKeys, duplicateGroups, looksLikeLead, leadNotes, leadTaskName } from '../lib/crm-asana.js'

test('kľúče kontaktu z textu úlohy: telefón (posledných 9 číslic) a e-mail, dátumy nie', () => {
  assert.deepEqual(contactKeys('Facebook Lead ID: 1156101827365832 | Name: Jan | Phone: +421 948 888 187 | Email: Jan.P@Proton.me | 2026-11-04'), ['p:948888187', 'e:jan.p@proton.me'])
  assert.deepEqual(leadKeys({ phone: '+421905192128', email: 'SL.Heimova@gmail.com' }), ['p:905192128', 'e:sl.heimova@gmail.com'])
  assert.deepEqual(contactKeys('Komu: zuzana@live-in.international · V appke: https://app.live-in.international/crm/lead/x · Telefón: +421 905 192 128'), ['p:905192128'])
  assert.equal(looksLikeLead({ name: 'Nový kontakt: X' }), true); assert.equal(looksLikeLead({ name: 'Florian Residence - obhliadka 16:00', notes: '' }), false)
})
test('duplikáty: rovnaký telefón alebo e-mail = jedna skupina, ponechá sa najstaršia; bežné úlohy sa nemažú', () => {
  const T = (gid, name, created, text) => ({ gid, name, created_at: created, keys: contactKeys(text), notes: text })
  const tasks = [T('1', 'Web dopyt: Slavomíra', '2026-10-28T10:00:00Z', 'sl.heimova@gmail.com 0905 192 128'), T('2', 'Nový kontakt: Slávka Heimová', '2026-10-28T11:00:00Z', 'Phone: +421905192128'), T('3', 'Nový kontakt: Iný', '2026-10-29T00:00:00Z', 'Email: iny@x.sk'), T('4', 'Obhliadka 16:00', '2026-10-30T00:00:00Z', '0905 192 128')]
  const g = duplicateGroups(tasks)
  assert.equal(g.length, 1); assert.equal(g[0].keep.gid, '1'); assert.deepEqual(g[0].remove.map((t) => t.gid), ['2'])
})
test('popis a názov úlohy leadu bez PII v názve navyše', () => {
  const n = leadNotes({ id: 'u1', name: 'Ján N.', phone: '+421900000000', email: 'a@b.sk', city_group: 'Košice', source: 'Web', stage: 'contacted', assigned_to: 'patrik@live-in.co.uk', received_at: '2026-11-01T00:00:00Z' }, { notes: [{ at: '2026-11-02', by: 'Zuzana', text: '2-izbový byt' }] })
  assert.ok(n.includes('Stav: Kontaktovaný') && n.includes('• 2026-11-02 Zuzana: 2-izbový byt') && n.includes('/crm/lead/u1'))
  assert.equal(leadTaskName({ name: 'Ján N.', city_group: 'Košice' }), 'Lead: Ján N. · Košice')
})

test('úvodný e-mail: šablóna podľa služby, oslovenie, podpis; obhliadka: navigácia a e-mail klientovi', async () => {
  const { fillTemplate, TEMPLATES, greeting, mapsLink, viewingEmail } = await import('../lib/crm-tasks.js')
  const lead = { name: 'Ján Novák', email: 'jan@example.com' }, me = { name: 'Zuzana Pavlíková', email: 'zuzana@live-in.international' }
  const m = fillTemplate(TEMPLATES.management, { lead, me, personal: 'Spomínali ste dvojizbový byt v Ružinove voľný od januára.' })
  assert.ok(m.body.startsWith('Dobrý deň, Ján,') && m.body.includes('dvojizbový byt v Ružinove') && m.body.includes('Zuzana Pavlíková') && m.body.includes('provízia'))
  assert.ok(!fillTemplate(TEMPLATES.rent_to_rent, { lead, me }).body.includes('{{'))
  assert.equal(greeting({ name: 'jan@example.com' }), 'Dobrý deň')
  assert.equal(mapsLink('Dunajská 3, Bratislava'), 'https://www.google.com/maps/dir/?api=1&destination=Dunajsk%C3%A1%203%2C%20Bratislava')
  const v = viewingEmail({ lead, at: '2026-11-12T09:00:00Z', address: 'Dunajská 3, Bratislava', withName: 'Zuzana', me })
  assert.ok(v.subject.startsWith('Potvrdenie obhliadky') && v.text.includes('Dunajská 3') && v.text.includes('Kto príde: Zuzana'))
})
