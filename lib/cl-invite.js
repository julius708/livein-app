// Upratovanie: pozvánka pre nového člena tímu (e-mail s odkazom na vyplnenie osobných údajov).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Základná adresa appky z hlavičiek požiadavky (alebo pevná z NEXT_PUBLIC_SITE_URL). Bez koncovej lomky. */
export function siteOrigin(headersLike, env = {}) {
  const fixed = env.NEXT_PUBLIC_SITE_URL
  if (fixed) return String(fixed).replace(/\/+$/, '')
  const get = (k) => (headersLike && typeof headersLike.get === 'function' ? headersLike.get(k) : null)
  const host = get('x-forwarded-host') || get('host') || 'localhost:3000'
  const proto = get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

export const inviteLink = (origin, token) => `${origin}/uprat/prihlaska?t=${token}`
export const applyLink = (origin) => `${origin}/uprat/prihlaska`

/** Predmet a telo pozvánky. Obsahuje odkaz na vyplnenie údajov a návod na prihlásenie bez hesla. */
export function inviteEmail({ name, link, loginUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0] || ''
  const subject = 'LIVE-IN upratovanie: vyplň svoje údaje'
  const text = [
    `Ahoj${first ? ' ' + first : ''},`, '',
    'manažérka upratovania ťa pridala do tímu upratovačiek LIVE-IN. Vyplň, prosím, telefón a adresu bydliska (podľa nej ti appka priradí byty v blízkosti):', '',
    link, '',
    `Do appky sa prihlásiš na ${loginUrl}: zadaj tento e-mail a vyber prihlásenie odkazom do e-mailu. Heslo nepotrebuješ.`, '',
    'Odkaz na vyplnenie údajov platí jedenkrát.',
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;color:#233E31;max-width:520px"><p>Ahoj${first ? ' ' + esc(first) : ''},</p><p>manažérka upratovania ťa pridala do tímu upratovačiek LIVE-IN. Vyplň, prosím, telefón a adresu bydliska (podľa nej ti appka priradí byty v blízkosti):</p><p><a href="${esc(link)}" style="display:inline-block;background:#173E2C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">Vyplniť údaje</a></p><p style="font-size:13px;color:#66716A">Ak sa tlačidlo neotvorí: ${esc(link)}</p><p>Do appky sa prihlásiš na <a href="${esc(loginUrl)}">${esc(loginUrl)}</a>: zadaj tento e-mail a vyber prihlásenie odkazom do e-mailu. Heslo nepotrebuješ.</p><p style="font-size:13px;color:#66716A">Odkaz na vyplnenie údajov platí jedenkrát.</p></div>`
  return { subject, text, html }
}
