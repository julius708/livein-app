// Spoločný kód appiek: kópie v ostatných appkách sa nesmú líšiť od zdroja v hlavnej appke.
import test from 'node:test'
import assert from 'node:assert/strict'
import { appsList, appsMenuSource, planSync } from '../tools/sync-shared.mjs'
import { MODULES } from '../lib/modules.js'
import { readFileSync } from 'node:fs'

test('zoznam aplikácií obsahuje domov, pripojené moduly a nové dlaždice', () => {
  const ids = appsList(MODULES).map((a) => a.id)
  for (const id of ['home', 'cs', 'ring', 'pracovna', 'kb', 'onboarding', 'upratovanie', 'uprat']) assert.ok(ids.includes(id), id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(appsList(MODULES).every((a) => /^https:\/\//.test(a.url)))
})
test('vygenerovaný AppsMenu je platný a obsahuje všetky aplikácie', () => {
  const src = appsMenuSource(readFileSync(new URL('../components/AppsMenu.js', import.meta.url), 'utf8'), appsList(MODULES))
  assert.match(src, /^'use client'/)
  assert.match(src, /export default function AppsMenu\(\{ current, roles \}\)/)
  for (const a of appsList(MODULES)) assert.ok(src.includes(`id: '${a.id}'`), a.id)
})
test('kópie v susedných appkách sú rovnaké ako zdroj (preskočí sa, ak repozitáre nie sú vedľa)', async (t) => {
  const res = await planSync({ write: false })
  const present = res.filter((r) => r.status !== 'missing')
  if (!present.length) return t.skip('susedné repozitáre nie sú k dispozícii')
  const drift = present.filter((r) => r.status === 'drift').map((r) => `${r.target}/${r.file}`)
  assert.deepEqual(drift, [], 'spusti: node tools/sync-shared.mjs')
})
