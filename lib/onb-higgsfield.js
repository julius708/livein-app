/** Higgsfield Cloud API (api.higgsfield.ai). Kľúč HF_API_KEY („key:secret“ alebo kľúč + HF_API_SECRET). Volá sa len zo servera. */
const API = process.env.HF_API_BASE || 'https://api.higgsfield.ai'

export function hfConfigured() { return !!process.env.HF_API_KEY || !!process.env.HF_KEY }
function cred() {
  if (process.env.HF_KEY) return process.env.HF_KEY
  const k = process.env.HF_API_KEY || '', s = process.env.HF_API_SECRET || ''
  return k.includes(':') || !s ? k : `${k}:${s}`
}
export function hfHeaders() { return { Authorization: `Key ${cred()}`, 'Content-Type': 'application/json', 'User-Agent': 'livein-zaradenie/1.0' } }

/** Všeobecné volanie: path napr. 'google/nano-banana-2/edit' alebo 'requests/<id>/status'. */
export async function hfCall(path, { method = 'GET', body, timeoutMs = 25000 } = {}) {
  const url = path.startsWith('http') ? path : `${API}/${path.replace(/^\//, '')}`
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method, headers: hfHeaders(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store' })
    const text = await res.text(); let json = null; try { json = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, json, text: json ? null : text.slice(0, 2000) }
  } finally { clearTimeout(t) }
}

/** Odošle generovanie, vráti { request_id, status_url }. */
export async function hfSubmit(model, args, webhookUrl) {
  const q = webhookUrl ? `?hf_webhook=${encodeURIComponent(webhookUrl)}` : ''
  const r = await hfCall(`${model}${q}`, { method: 'POST', body: args })
  if (!r.ok) throw new Error(`Higgsfield ${r.status}: ${r.json ? JSON.stringify(r.json).slice(0, 300) : r.text}`)
  return r.json
}
export async function hfStatus(requestId) { return hfCall(`requests/${requestId}/status`) }
