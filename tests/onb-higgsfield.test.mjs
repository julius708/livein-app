import test from 'node:test'
import assert from 'node:assert/strict'
import { bridgeBody, hfConfigured } from '../lib/onb-higgsfield.js'

test('telo požiadavky pre most obsahuje cestu, metódu a čas', () => {
  const b = JSON.parse(bridgeBody('alibaba/qwen-image-3/edit?hf_webhook=x', { method: 'POST', body: { a: 1 }, timeoutMs: 30000 }))
  assert.deepEqual(b, { path: 'alibaba/qwen-image-3/edit?hf_webhook=x', method: 'POST', body: { a: 1 }, timeoutMs: 30000 })
  assert.deepEqual(JSON.parse(bridgeBody('requests/abc/status')), { path: 'requests/abc/status', method: 'GET', timeoutMs: 25000 })
})
test('Higgsfield je „pripojený“ priamo kľúčom alebo cez most; most sa dá vypnúť', () => {
  const keep = { ...process.env }
  try {
    delete process.env.HF_API_KEY; delete process.env.HF_KEY; delete process.env.HF_BRIDGE_OFF
    assert.equal(hfConfigured(), true)
    process.env.HF_BRIDGE_OFF = '1'
    assert.equal(hfConfigured(), false)
    process.env.HF_API_KEY = 'x'
    assert.equal(hfConfigured(), true)
  } finally { for (const k of ['HF_API_KEY', 'HF_KEY', 'HF_BRIDGE_OFF']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k] } }
})
