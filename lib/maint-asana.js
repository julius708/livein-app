// Asana: jedna úloha na prípad údržby (ID prípadu v názve), opakovaná synchronizácia tú istú úlohu aktualizuje.
import { DAMAGES_PROJECT } from './asana'
const API = 'https://app.asana.com/api/1.0'
export const asanaReady = () => !!process.env.ASANA_TOKEN
const H = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' })
async function call(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Asana ${r.status}: ${(j.errors && j.errors[0] && j.errors[0].message) || 'chyba'}`)
  return j.data
}
const project = () => process.env.ASANA_MAINT_PROJECT || DAMAGES_PROJECT
export function taskName(c) { return `${c.ref} / ${c.listing_name || c.listing_id} / ${c.category} / ${String(c.symptoms || '').slice(0, 60)}` }
export function taskNotes(c, extra = {}) {
  const lines = [`ID prípadu: ${c.ref}`, `Stav: ${extra.statusLabel || c.status}`, `Termín: ${c.due_at ? new Date(c.due_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' }) : '—'}`, `Riešiteľ: ${c.assignee_email || c.assigned_role || '—'}`, `Odkaz: ${extra.url || ''}`, '', String(c.symptoms || '')]
  return lines.join('\n')
}
/** Vytvorí alebo aktualizuje úlohu; vráti gid. Idempotentné podľa c.asana_gid. */
export async function syncCaseTask(c, extra = {}) {
  if (!asanaReady()) return null
  const data = { name: taskName(c), notes: taskNotes(c, extra), due_on: c.due_at ? c.due_at.slice(0, 10) : null, completed: ['done', 'closed', 'cancelled', 'duplicate'].includes(c.status) }
  if (c.asana_gid) { await call(`/tasks/${c.asana_gid}`, { method: 'PUT', body: { data } }); return c.asana_gid }
  const t = await call('/tasks', { method: 'POST', body: { data: { ...data, projects: [project()] } } })
  return t.gid
}
