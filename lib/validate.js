import { ROLE_CODES } from './modules'

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function cleanUser(input, { requireEmail = true } = {}) {
  const email = String(input.email || '').trim().toLowerCase()
  const name = String(input.name || '').trim().replace(/\s+/g, ' ')
  const title = String(input.title || '').trim() || null
  const scope_city = String(input.scope_city || '').trim() || null
  const roles = Array.from(new Set((Array.isArray(input.roles) ? input.roles : []).filter((r) => ROLE_CODES.includes(r))))
  if (requireEmail && !EMAIL_RE.test(email)) return { error: 'Zadaj platný e-mail.' }
  if (name.length < 2) return { error: 'Zadaj meno.' }
  if (roles.length === 0) return { error: 'Vyber aspoň jednu rolu.' }
  return { value: { email, name, title, scope_city, roles } }
}

export function cleanUrl(v) {
  const s = String(v || '').trim()
  if (!s) return { value: null }
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error()
    return { value: u.toString().replace(/\/$/, '') }
  } catch {
    return { error: `Neplatná adresa: ${s}` }
  }
}
