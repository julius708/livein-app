// Asana „Damages Reporting“: zdroj opráv pre dlaždicu Údržba.
// Token ASANA_TOKEN (osobný prístupový token) nastavuje Július vo Verceli; bez neho Asana časť len mlčí.

export const DAMAGES_PROJECT = '1218054437943454'
const API = 'https://app.asana.com/api/1.0'
export const ASANA_TAG = 'asana-damages'

export function asanaConfigured() {
  return !!process.env.ASANA_TOKEN
}

function headers() {
  return { Authorization: `Bearer ${process.env.ASANA_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }
}

/** Prvý kód rezervácie v texte (HM…, BC-…, 10+ znakov). */
export function reservationCode(s) {
  const m = String(s || '').match(/\b(?:HM[A-Z0-9]{6,}|BC-[A-Za-z0-9]{6,}|[A-Z0-9]{10,})\b/)
  return m ? m[0] : ''
}

/**
 * Názov úlohy má tvar „kód / byt / hosť / problém / dátum“ (podľa šablóny v projekte).
 * Vracia { code, listing, guest, problem, date }; pri inom tvare je celý názov problémom.
 */
export function parseTaskName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim()
  const parts = clean.split('/').map((p) => p.trim()).filter(Boolean)
  const strip = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  if (parts.length >= 4) return { code: reservationCode(parts[0]), listing: strip(parts[1]), guest: strip(parts[2]), problem: strip(parts[3]), date: parts.slice(4).join(' / ') }
  if (parts.length === 3) return { code: reservationCode(parts[0]), listing: strip(parts[1]), guest: '', problem: strip(parts[2]), date: '' }
  if (parts.length === 2) return { code: reservationCode(parts[0]), listing: strip(parts[0]).replace(reservationCode(parts[0]), '').trim(), guest: '', problem: strip(parts[1]), date: '' }
  return { code: reservationCode(clean), listing: '', guest: '', problem: strip(clean), date: '' }
}

/** Otvorené úlohy projektu (bez šablóny), alebo null bez tokenu / pri chybe. */
export async function fetchOpenDamageTasks() {
  if (!asanaConfigured()) return null
  try {
    const q = new URLSearchParams({ completed_since: 'now', limit: '100', opt_fields: 'name,completed,due_on,created_at,permalink_url,assignee.name,memberships.project.gid,memberships.section.name' })
    const res = await fetch(`${API}/projects/${DAMAGES_PROJECT}/tasks?${q}`, { headers: headers(), next: { revalidate: 300, tags: [ASANA_TAG] } })
    if (!res.ok) return null
    const { data } = await res.json()
    return (data || [])
      .filter((t) => !t.completed && !/TEMPLATE/i.test(t.name || ''))
      .map((t) => {
        const p = parseTaskName(t.name)
        const section = ((t.memberships || []).find((m) => m.project && m.project.gid === DAMAGES_PROJECT) || {}).section
        return { gid: t.gid, name: t.name, ...p, due_on: t.due_on || null, created_at: t.created_at, url: t.permalink_url, assignee: t.assignee ? t.assignee.name : '', section: section ? section.name : '' }
      })
  } catch {
    return null
  }
}

/** Uzavrie úlohu v Asane a pridá komentár, kto ju označil ako opravenú. */
export async function completeDamageTask(gid, byName) {
  if (!asanaConfigured() || !/^\d+$/.test(String(gid))) return { ok: false, error: 'Asana nie je pripojená.' }
  const res = await fetch(`${API}/tasks/${gid}`, { method: 'PUT', headers: headers(), cache: 'no-store', body: JSON.stringify({ data: { completed: true } }) })
  if (!res.ok) return { ok: false, error: `Asana odmietla uzavretie (${res.status}).` }
  await fetch(`${API}/tasks/${gid}/stories`, { method: 'POST', headers: headers(), cache: 'no-store', body: JSON.stringify({ data: { text: `Opravené – označil/a ${byName || 'tím'} v LIVE-IN appke (Údržba).` } }) }).catch(() => {})
  return { ok: true }
}
