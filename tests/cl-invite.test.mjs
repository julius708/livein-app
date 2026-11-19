import test from 'node:test'
import assert from 'node:assert/strict'
import { siteOrigin, inviteLink, applyLink, inviteEmail } from '../lib/cl-invite.js'

const h = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null })

test('adresa appky: pevná z prostredia, inak z hlavičiek, lokálne http', () => {
  assert.equal(siteOrigin(h({}), { NEXT_PUBLIC_SITE_URL: 'https://app.example.org/' }), 'https://app.example.org')
  assert.equal(siteOrigin(h({ 'x-forwarded-host': 'app.example.org', 'x-forwarded-proto': 'https' }), {}), 'https://app.example.org')
  assert.equal(siteOrigin(h({ host: 'localhost:3017' }), {}), 'http://localhost:3017')
  assert.equal(siteOrigin(null, {}), 'http://localhost:3000')
  assert.equal(inviteLink('https://a.sk', 'abc'), 'https://a.sk/uprat/prihlaska?t=abc')
  assert.equal(applyLink('https://a.sk'), 'https://a.sk/uprat/prihlaska')
})

test('pozvánka: slovenský text s odkazom a návodom na prihlásenie bez hesla; html je escapované', () => {
  const e = inviteEmail({ name: 'Anna <b>Nováková', link: 'https://a.sk/uprat/prihlaska?t=1&x="2"', loginUrl: 'https://a.sk/login' })
  assert.equal(e.subject, 'LIVE-IN upratovanie: vyplň svoje údaje')
  assert.match(e.text, /^Ahoj Anna,/); assert.ok(e.text.includes('https://a.sk/uprat/prihlaska?t=1&x="2"'))
  assert.match(e.text, /Heslo nepotrebuješ/)
  assert.ok(!e.html.includes('<b>') && e.html.includes('&lt;b&gt;') === false) // meno sa skracuje na prvé slovo, značky sa nedostanú do html
  assert.ok(e.html.includes('&quot;2&quot;')) // úvodzovky v odkaze sú escapované
  assert.equal(inviteEmail({ name: '', link: 'l', loginUrl: 'u' }).text.startsWith('Ahoj,'), true)
})
