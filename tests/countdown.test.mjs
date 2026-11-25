import test from 'node:test'
import assert from 'node:assert/strict'
import { countdownParts, countdownProgress, countdownSpeech, daysWord, OFFICE_OPENING, OFFICE_COUNT_FROM } from '../lib/countdown.js'

test('otvorenie je 1. decembra o polnoci v Bratislave', () => {
  const fmt = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  assert.match(fmt.format(OFFICE_OPENING).replace(/\s/g, ' '), /^1\. 12\. 2026,? 0:00$/)
  assert.match(new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric' }).format(OFFICE_COUNT_FROM).replace(/\s/g, ' '), /^1\. 11\.$/)
})
test('rozklad zostávajúceho času', () => {
  const p = countdownParts(OFFICE_OPENING - (5 * 86400 + 3 * 3600 + 7 * 60 + 9) * 1000)
  assert.deepEqual([p.days, p.hours, p.minutes, p.seconds, p.done, p.last24], [5, 3, 7, 9, false, false])
})
test('posledných 24 hodín a po otvorení', () => {
  assert.equal(countdownParts(OFFICE_OPENING - 3600e3).last24, true)
  assert.equal(countdownParts(OFFICE_OPENING - 86400e3).last24, true)
  assert.equal(countdownParts(OFFICE_OPENING - 86400e3 - 1000).last24, false)
  const d = countdownParts(OFFICE_OPENING + 5000)
  assert.deepEqual([d.done, d.days, d.hours, d.minutes, d.seconds, d.last24], [true, 0, 0, 0, 0, false])
})
test('postup a slovenské skloňovanie', () => {
  assert.equal(countdownProgress(OFFICE_COUNT_FROM - 1), 0)
  assert.equal(countdownProgress(OFFICE_OPENING + 1), 1)
  assert.ok(Math.abs(countdownProgress((OFFICE_COUNT_FROM + OFFICE_OPENING) / 2) - 0.5) < 1e-9)
  assert.deepEqual([0, 1, 2, 4, 5, 21].map(daysWord), ['dní', 'deň', 'dni', 'dni', 'dní', 'dní'])
  assert.match(countdownSpeech(countdownParts(OFFICE_OPENING - 2 * 86400e3)), /zostáva 2 dni/)
  assert.equal(countdownSpeech(countdownParts(OFFICE_OPENING + 1)), 'Kancelária je otvorená.')
})
