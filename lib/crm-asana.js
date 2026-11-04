// CRM ↔ Asana: leady žijú v projekte LIVE-IN International v sekciách LEAD 1 … LEAD ✕ (vytvorené Júliusom 4. 11. 2026).
import { STAGES, stageFromAsanaSection } from './crm'
const API = 'https://app.asana.com/api/1.0'
export const LEAD_PROJECT = process.env.ASANA_LEAD_PROJECT || '1203570903024669'
const h = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, 'content-type': 'application/json', Accept: 'application/json' })
export const asanaReady = () => !!process.env.ASANA_TOKEN
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: h(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`Asana ${res.status}: ${(j.errors && j.errors[0] && j.errors[0].message) || 'chyba'}`); e.status = res.status; throw e }
  return j
}
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

let cache = { at: 0, sections: null, fields: null }
/** Sekcie LEAD … (vytvorí chýbajúce) a vlastné polia projektu, cache 1 h. */
export async function projectMeta() {
  if (cache.sections && Date.now() - cache.at < 3600e3) return cache
  const [sec, cf] = await Promise.all([call(`/projects/${LEAD_PROJECT}/sections?opt_fields=name&limit=100`), call(`/projects/${LEAD_PROJECT}/custom_field_settings?opt_fields=custom_field.name,custom_field.gid,custom_field.resource_subtype,custom_field.enum_options.name,custom_field.enum_options.gid&limit=100`)])
  const sections = {}
  for (const s of sec.data || []) { const st = stageFromAsanaSection(s.name); if (st && !sections[st]) sections[st] = { gid: s.gid, name: s.name } }
  for (const s of STAGES) if (!sections[s.id]) { const j = await call(`/projects/${LEAD_PROJECT}/sections`, { method: 'POST', body: { data: { name: s.asana } } }); sections[s.id] = { gid: j.data.gid, name: s.asana } }
  const fields = {}
  for (const x of cf.data || []) { const f = x.custom_field; if (f) fields[fold(f.name)] = { gid: f.gid, type: f.resource_subtype, options: Object.fromEntries((f.enum_options || []).map((o) => [fold(o.name), o.gid])) } }
  cache = { at: Date.now(), sections, fields }
  return cache
}
export async function moveTask(gid, stage) {
  const { sections } = await projectMeta()
  const s = sections[stage]
  if (!s) throw new Error('Asana: sekcia pre ' + stage + ' chýba')
  await call(`/sections/${s.gid}/addTask`, { method: 'POST', body: { data: { task: String(gid) } } })
  return s.name
}
/** Vlastné polia podľa názvu: Zdroj (enum), Dôvod straty (enum), Prvý kontakt (dátum), Lead prijatý (dátum). */
export async function setFields(gid, values) {
  const { fields } = await projectMeta()
  const custom_fields = {}
  for (const [name, val] of Object.entries(values)) {
    const f = fields[fold(name)]
    if (!f || val == null || val === '') continue
    if (f.type === 'enum') { const o = f.options[fold(val)]; if (o) custom_fields[f.gid] = o }
    else if (f.type === 'date') custom_fields[f.gid] = String(val).slice(0, 10)
    else custom_fields[f.gid] = String(val).slice(0, 1000)
  }
  if (!Object.keys(custom_fields).length) return
  await call(`/tasks/${gid}`, { method: 'PUT', body: { data: { custom_fields } } })
}
export const commentTask = (gid, text) => call(`/tasks/${gid}/stories`, { method: 'POST', body: { data: { text: String(text).slice(0, 2000) } } })
export const completeTask = (gid, completed = true) => call(`/tasks/${gid}`, { method: 'PUT', body: { data: { completed } } })
/** Nová úloha leadu (keď lead vznikol inde než v Zapieri). */
export async function createLeadTask({ name, notes, assigneeEmail, stage = 'new' }) {
  const { sections } = await projectMeta()
  const j = await call('/tasks', { method: 'POST', body: { data: { name: `Nový kontakt: ${name}`, notes: notes || '', projects: [LEAD_PROJECT], assignee: assigneeEmail || null, memberships: [{ project: LEAD_PROJECT, section: sections[stage].gid }] } } })
  return j.data
}
/** Úlohy v LEAD sekciách: gid → { stage, modified_at, completed, name } (na sync Asana → appka). */
export async function leadTasks() {
  const out = {}; let offset = ''
  for (let i = 0; i < 20; i++) {
    const j = await call(`/projects/${LEAD_PROJECT}/tasks?opt_fields=name,completed,modified_at,memberships.section.name,memberships.project.gid&limit=100${offset ? `&offset=${offset}` : ''}`)
    for (const t of j.data || []) {
      const m = (t.memberships || []).find((x) => x.project && x.project.gid === LEAD_PROJECT && x.section)
      const stage = m ? stageFromAsanaSection(m.section.name) : null
      if (stage) out[t.gid] = { stage, modified_at: t.modified_at, completed: !!t.completed, name: t.name }
    }
    offset = j.next_page && j.next_page.offset
    if (!offset) break
  }
  return out
}
