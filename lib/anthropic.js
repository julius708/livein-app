// Spoločné volanie Anthropic API pre Guru (chat, zaujímavosť dňa). Keď nastavený model (ANTHROPIC_MODEL) neexistuje
// alebo kľúč naň nemá prístup, skúsi záložné modely, aby Guru neprestal odpovedať. Chybu zapíše do logu (bez obsahu otázky).
const FALLBACKS = ['claude-sonnet-4-5', 'claude-sonnet-5-5', 'claude-3-7-sonnet-latest']
export function modelCandidates() {
  const pref = process.env.ANTHROPIC_MODEL
  return [...new Set([...(pref ? [pref] : []), ...FALLBACKS])]
}
/** Vráti { ok, json, status, model, error }. Opakuje na ďalší model len pri chybe modelu alebo preťažení (400/404 s „model“, 429, 529). */
export async function callClaude(key, body, { timeoutMs = 45000 } = {}) {
  let last = { status: 0, error: '' }
  for (const model of modelCandidates()) {
    let r
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ ...body, model }),
      })
    } catch (e) {
      last = { status: 0, error: String(e && e.message) }
      console.error('[anthropic] fetch failed', model, last.error)
      if (/abort|timeout/i.test(last.error)) return { ok: false, ...last, model }
      continue
    }
    if (r.ok) return { ok: true, json: await r.json(), status: 200, model }
    const text = (await r.text().catch(() => '')).slice(0, 300)
    last = { status: r.status, error: text }
    console.error('[anthropic]', r.status, model, text)
    const modelProblem = (r.status === 404 || r.status === 400) && /model/i.test(text)
    if (modelProblem || r.status === 429 || r.status === 529) continue
    return { ok: false, ...last, model }
  }
  return { ok: false, ...last, model: null }
}
