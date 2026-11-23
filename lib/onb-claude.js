/** Claude (Anthropic Messages API) zo servera: rozpoznanie vecí na obrázku a vyhľadanie produktov na webe. Kľúč ANTHROPIC_API_KEY. */
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY

export async function claudeJson({ system, text, imageUrl, maxTokens = 2500, webSearch = 0, city = 'Bratislava' }) {
  const content = []
  if (imageUrl) content.push({ type: 'image', source: { type: 'url', url: imageUrl } })
  content.push({ type: 'text', text })
  const body = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }
  if (webSearch > 0) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: webSearch, user_location: { type: 'approximate', city, country: 'SK', timezone: 'Europe/Bratislava' } }]
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Claude ${res.status}: ${j && j.error ? j.error.message : ''}`.slice(0, 300))
  const texts = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text)
  // JSON je v poslednom textovom bloku (pri vyhľadávaní sú pred ním citácie)
  for (let i = texts.length - 1; i >= 0; i--) {
    const m = texts[i].match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch {} }
  }
  throw new Error('Claude nevrátil JSON.')
}
