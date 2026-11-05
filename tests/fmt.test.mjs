import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtDate, fmtDay, fmtDateTime } from '../lib/fmt.js'
test('dátumy v bratislavskom čase, deterministicky', () => {
  assert.equal(fmtDate('2026-11-04T23:30:00Z'), '5. 11. 2026')
  assert.equal(fmtDay('2026-11-05'), '5. 11.')
  assert.equal(fmtDateTime('2026-11-05T00:05:00Z'), '5. 11. 2026 01:05')
  assert.equal(fmtDate('nezmysel'), '—'); assert.equal(fmtDate(null, ''), '')
})
