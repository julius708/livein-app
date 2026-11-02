import test from 'node:test'
import assert from 'node:assert/strict'
import { stripMarkdown, visemeFor, visAt, timelineFrom, clampPos, speechText, MOUTH } from '../lib/guru-widget-core.js'

test('stripMarkdown odstráni hviezdičky, nadpisy, odrážky a tabuľky, text ostane', () => {
  const md = '## Príchody\n\n**Dnes** máme *3* príchody:\n- Antolská\n- Eurovea\n\n| Byt | Hostia |\n|---|---|\n| Antolská | 2 |\n\n`kód 1234` a [Guesty](https://app.guesty.com)'
  const out = stripMarkdown(md)
  assert.ok(!/[*#`|]/.test(out), out)
  assert.match(out, /Príchody/)
  assert.match(out, /Dnes máme 3 príchody:/)
  assert.match(out, /Antolská\nEurovea/)
  assert.match(out, /Byt, Hostia/)
  assert.match(out, /kód 1234/)
  assert.match(out, /Guesty \(https:\/\/app\.guesty\.com\)/)
})

test('stripMarkdown nechá bežný text a čísla nedotknuté', () => {
  const s = 'Dnes je 20 príchodov a 16 odchodov. Kód od dverí je 4471#.'
  assert.equal(stripMarkdown(s), s)
})

test('visemeFor: vokály otvárajú ústa, m/b/p ich zatvárajú, spoluhláska pred vokálom pootvorí', () => {
  assert.deepEqual(visemeFor(['a'], 0), [0.95, 0.2])
  assert.deepEqual(visemeFor(['m'], 0), [0, 0])
  assert.deepEqual(visemeFor([' '], 0), [0.02, 0])
  const [o] = visemeFor(['k', 'a'], 0)
  assert.ok(o > 0.1 && o < 0.95)
})

test('visAt nájde znak podľa času a po doznení zatvorí ústa', () => {
  const TL = timelineFrom({ characters: ['a', 'h', 'o', 'j'], character_start_times_seconds: [0, 0.2, 0.4, 0.6], character_end_times_seconds: [0.2, 0.4, 0.6, 0.8] })
  assert.equal(visAt(TL, -1).i, -1)
  assert.equal(visAt(TL, 0.45).i, 2)
  assert.ok(visAt(TL, 0.45).o > 0.5)
  assert.equal(visAt(TL, 2).o, 0)
  assert.equal(timelineFrom(null), null)
})

test('clampPos nepustí postavičku von z okna', () => {
  const p = clampPos(-999, 9999, { w: 1200, h: 800 }, { w: 120, h: 160 })
  assert.ok(p.r >= -42 && p.b <= 650)
  const q = clampPos(20, 14, { w: 1200, h: 800 }, { w: 120, h: 160 })
  assert.deepEqual(q, { r: 20, b: 14 })
})

test('speechText číta LIVE-IN ako Livin a dlhý text skráti na celé vety', () => {
  assert.equal(speechText('**Vitaj** v LIVE-IN.'), 'Vitaj v Livin.')
  const long = Array.from({ length: 40 }, (_, i) => `Veta číslo ${i + 1} je tu.`).join(' ')
  const t = speechText(long, 200)
  assert.ok(t.length <= 200 && t.endsWith('.'), t)
})

test('ústa sú na rovnakej pozícii ako u Adama', () => {
  assert.deepEqual(MOUTH, { left: 39.58, top: 30.6, width: 19.44, canvasW: 140, canvasH: 80 })
})
