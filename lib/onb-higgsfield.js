/** Higgsfield Cloud API (api.higgsfield.ai). Volá sa len zo servera.
 * Priamo, ak je v tejto appke kľúč HF_API_KEY („key:secret“ alebo kľúč + HF_API_SECRET) alebo HF_KEY.
 * Inak cez most v pôvodnom nasadení Zaradenia (tam kľúč ostáva): pošleme token prihláseného človeka a most overí jeho rolu. */
const API = process.env.HF_API_BASE || 'https://api.higgsfield.ai'
// Adresa mosta ide cez hlavnú doménu (rewrite v next.config.js): priame nasadenie *.vercel.app je za prihlásením Vercelu a server-server volanie by tam skončilo chybou 401.
const BRIDGE = process.env.HF_BRIDGE_URL || 'https://app.live-in.international/zaradenie/api/hf/bridge'

const direct = () => !!process.env.HF_API_KEY || !!process.env.HF_KEY
export function hfConfigured() { return direct() || process.env.HF_BRIDGE_OFF !== '1' }
function cred() {
  if (process.env.HF_KEY) return process.env.HF_KEY
  const k = process.env.HF_API_KEY || '', s = process.env.HF_API_SECRET || ''
  return k.includes(':') || !s ? k : `${k}:${s}`
}
export function hfHeaders() { return { Authorization: `Key ${cred()}`, 'Content-Type': 'application/json', 'User-Agent': 'livein-zaradenie/1.0' } }

/** Telo požiadavky pre most (čistá funkcia, dá sa testovať). */
export function bridgeBody(path, { method = 'GET', body, timeoutMs = 25000 } = {}) {
  return JSON.stringify({ path, method, body: body || undefined, timeoutMs })
}

async function viaBridge(path, opts) {
  const { getViewer } = await import('./auth.js')
  const { s } = await getViewer()
  const { data } = await s.auth.getSession()
  const token = data && data.session && data.session.access_token
  if (!token) return { ok: false, status: 401, json: null, text: 'Prihlásenie vypršalo.' }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), Math.min((opts.timeoutMs || 25000) + 5000, 55000))
  try {
    const res = await fetch(BRIDGE, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: bridgeBody(path, opts), signal: ctl.signal, cache: 'no-store' })
    const j = await res.json().catch(() => null)
    if (!j) return { ok: false, status: res.status, json: null, text: `Most Higgsfield neodpovedal (${res.status}).` }
    if (j.error && j.ok === false && !('status' in j)) return { ok: false, status: res.status, json: null, text: `Most Higgsfield: ${j.error}` }
    return j
  } finally { clearTimeout(t) }
}

/** Všeobecné volanie: path napr. 'google/nano-banana-2/edit' alebo 'requests/<id>/status'. */
export async function hfCall(path, { method = 'GET', body, timeoutMs = 25000 } = {}) {
  if (!direct()) return viaBridge(path, { method, body, timeoutMs })
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
