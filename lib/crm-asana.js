// CRM ↔ Asana: leady žijú v projekte LIVE-IN International v sekciách LEAD 1 … LEAD ✕ (vytvorené Júliusom 4. 11. 2026).
import { STAGES, stageFromAsanaSection } from './crm.js'
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

// ——— Prepojenie leadov s úlohami (bez duplikátov) ———
const asanaUsers = { at: 0, byEmail: {} }
/** Používatelia workspace podľa e-mailu (cache 1 h), aby sa úloha dala priradiť človeku z appky. */
export async function userGidByEmail(email) {
  const e = String(email || '').toLowerCase().trim(); if (!e) return null
  if (Date.now() - asanaUsers.at > 3600e3) {
    const ws = process.env.ASANA_WORKSPACE || (await call('/workspaces?limit=1')).data[0].gid
    const j = await call(`/users?workspace=${ws}&opt_fields=email&limit=100`)
    asanaUsers.byEmail = Object.fromEntries((j.data || []).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.gid])); asanaUsers.at = Date.now()
  }
  return asanaUsers.byEmail[e] || null
}
export const digits9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
/** Kľúče kontaktu v texte úlohy (telefón ako posledných 9 číslic, e-mail malými písmenami). */
export function contactKeys(text) {
  const t = String(text || '')
  // telefón = 9 až 14 číslic (ID z Facebooku má 15+, dátumy 8), posledných 9 číslic bez predvoľby
  const phones = [...t.matchAll(/\+?\d[\d \-().]{7,}\d/g)].map((m) => m[0].replace(/\D/g, '')).filter((d) => d.length >= 9 && d.length <= 14).map((d) => d.slice(-9))
  const emails = [...t.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase())
  return [...new Set([...phones.map((p) => 'p:' + p), ...emails.map((e) => 'e:' + e)])]
}
export const leadKeys = (lead) => [...(lead.phone ? ['p:' + digits9(lead.phone)] : []), ...(lead.email ? ['e:' + String(lead.email).toLowerCase()] : [])]
const taskText = (t) => `${t.name || ''}\n${t.notes || ''}\n${(t.custom_fields || []).map((c) => c.display_value || '').join('\n')}`
/** Úloha vyzerá ako lead (zo Zapieru, z webu, z appky) – nie bežná úloha tímu s telefónom v texte. */
export const looksLikeLead = (t) => /^(nový kontakt|web dopyt|lead|kontakt)\b/i.test(String(t.name || '')) || /lead id|zdroj:|z appky live-in/i.test(String(t.notes || ''))

let taskCache = { at: 0, list: [] }
/** Všetky úlohy projektu s textom (cache 5 min): na hľadanie existujúcej úlohy kontaktu a na deduplikáciu. */
export async function allLeadTasks({ fresh = false } = {}) {
  if (!fresh && taskCache.list.length && Date.now() - taskCache.at < 5 * 60e3) return taskCache.list
  const list = []; let offset = ''
  for (let i = 0; i < 30; i++) {
    const j = await call(`/projects/${LEAD_PROJECT}/tasks?opt_fields=name,notes,completed,created_at,modified_at,assignee.email,due_on,memberships.section.name,memberships.project.gid,custom_fields.display_value,num_subtasks&limit=100${offset ? `&offset=${offset}` : ''}`)
    for (const t of j.data || []) list.push({ ...t, keys: contactKeys(taskText(t)) })
    offset = j.next_page && j.next_page.offset; if (!offset) break
  }
  taskCache = { at: Date.now(), list }
  return list
}
/** Nájde existujúcu úlohu kontaktu podľa telefónu alebo e-mailu (najstaršia neukončená, inak najstaršia). */
export async function findLeadTask(lead, { fresh = false } = {}) {
  const keys = leadKeys(lead); if (!keys.length) return null
  const hits = (await allLeadTasks({ fresh })).filter((t) => t.keys.some((k) => keys.includes(k))).sort((a, b) => (a.completed === b.completed ? a.created_at.localeCompare(b.created_at) : a.completed ? 1 : -1))
  return hits[0] || null
}
/** Popis úlohy: kontakt, mesto, zdroj, stav, odkaz do appky a poznámky z hovorov. */
export function leadNotes(lead, { notes = [], appUrl = 'https://app.live-in.international' } = {}) {
  const st = STAGES.find((s) => s.id === lead.stage)
  const head = [`Meno: ${lead.name || ''}`, `Telefón: ${lead.phone || '—'}`, `E-mail: ${lead.email || '—'}`, `Mesto: ${lead.city || lead.city_group || '—'}`, `Zdroj: ${lead.source || '—'}`, lead.property_address ? `Adresa bytu: ${lead.property_address}` : '', `Stav: ${st ? st.label : lead.stage}${lead.lost_reason ? ' (' + lead.lost_reason + ')' : ''}`, `Komu: ${lead.assigned_to || '—'}`, `Prijatý: ${String(lead.received_at || '').slice(0, 10)}`, `V appke: ${appUrl}/crm/lead/${lead.id}`].filter(Boolean)
  const body = notes.length ? ['', 'Poznámky z appky:', ...notes.map((n) => `• ${String(n.at || '').slice(0, 10)} ${n.by ? n.by + ': ' : ''}${n.text}`)] : []
  return [...head, ...body, '', '— Z appky LIVE-IN (upravuje sa automaticky; vlastné poznámky píšte do komentárov)'].join('\n').slice(0, 60000)
}
export const leadTaskName = (lead) => `Lead: ${lead.name || lead.phone || lead.email}${lead.city_group && lead.city_group !== 'Iné' ? ' · ' + lead.city_group : lead.city ? ' · ' + lead.city : ''}`
/** Založí alebo nájde úlohu leadu: priradená človeku z appky, s termínom, v sekcii štádia, s popisom. Vracia gid a či vznikla nová. */
export async function ensureLeadTask(lead, { notes = [], appUrl } = {}) {
  const found = await findLeadTask(lead)
  const assignee = lead.assigned_to ? await userGidByEmail(lead.assigned_to).catch(() => null) : null
  const due_on = lead.due_at ? String(lead.due_at).slice(0, 10) : null
  if (found) {
    const data = { notes: leadNotes(lead, { notes, appUrl }) }
    if (assignee && !(found.assignee && found.assignee.email)) data.assignee = assignee
    if (due_on && !found.due_on) data.due_on = due_on
    await call(`/tasks/${found.gid}`, { method: 'PUT', body: { data } }).catch(() => {})
    await moveTask(found.gid, lead.stage).catch(() => {})
    return { gid: found.gid, created: false }
  }
  const { sections } = await projectMeta()
  const j = await call('/tasks', { method: 'POST', body: { data: { name: leadTaskName(lead), notes: leadNotes(lead, { notes, appUrl }), projects: [LEAD_PROJECT], assignee, due_on, memberships: [{ project: LEAD_PROJECT, section: (sections[lead.stage] || sections.new).gid }] } } })
  taskCache.list.push({ ...j.data, keys: leadKeys(lead) })
  return { gid: j.data.gid, created: true }
}
/** Aktualizácia úlohy po zmene v appke (názov, popis, priradenie, termín) + voliteľný komentár. */
export async function syncLeadTask(gid, lead, { notes = [], comment = '', appUrl } = {}) {
  const data = { name: leadTaskName(lead), notes: leadNotes(lead, { notes, appUrl }) }
  if (lead.assigned_to) { const a = await userGidByEmail(lead.assigned_to).catch(() => null); if (a) data.assignee = a }
  if (lead.due_at && lead.stage === 'new') data.due_on = String(lead.due_at).slice(0, 10)
  await call(`/tasks/${gid}`, { method: 'PUT', body: { data } })
  if (comment) await commentTask(gid, comment).catch(() => {})
}
/** Skupiny duplicitných úloh toho istého kontaktu (rovnaký telefón alebo e-mail). Ponechá sa najstaršia. */
export function duplicateGroups(tasks) {
  const parent = new Map(); const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)))
  const byKey = new Map()
  for (const t of tasks) { if (!looksLikeLead(t) || !t.keys.length) continue; parent.set(t.gid, t.gid); for (const k of t.keys) { if (byKey.has(k)) parent.set(find(t.gid), find(byKey.get(k))); else byKey.set(k, t.gid) } }
  const groups = new Map()
  for (const t of tasks) if (parent.has(t.gid)) { const r = find(t.gid); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t) }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => { const s = [...g].sort((a, b) => a.created_at.localeCompare(b.created_at)); return { keep: s[0], remove: s.slice(1) } })
}
/** Zlúči duplikáty: popis a komentáre duplikátu prejdú ako komentár do ponechanej úlohy, duplikát sa zmaže. dryRun len vypíše plán. */
export async function dedupeLeadTasks({ dryRun = true } = {}) {
  const tasks = await allLeadTasks({ fresh: true })
  const groups = duplicateGroups(tasks)
  const report = []
  for (const g of groups) {
    const r = { keep: { gid: g.keep.gid, name: g.keep.name, created: g.keep.created_at.slice(0, 10) }, removed: [] }
    for (const d of g.remove) {
      r.removed.push({ gid: d.gid, name: d.name, created: d.created_at.slice(0, 10) })
      if (dryRun) continue
      const stories = await call(`/tasks/${d.gid}/stories?opt_fields=text,type,created_at,created_by.name&limit=100`).catch(() => ({ data: [] }))
      const comments = (stories.data || []).filter((s) => s.type === 'comment' && s.text).map((s) => `${s.created_at.slice(0, 10)} ${(s.created_by && s.created_by.name) || ''}: ${s.text}`)
      const text = [`Zlúčený duplikát „${d.name}“ (vytvorený ${d.created_at.slice(0, 10)})`, d.notes ? `Popis: ${d.notes}` : '', ...(comments.length ? ['Komentáre:', ...comments] : [])].filter(Boolean).join('\n')
      await commentTask(g.keep.gid, text.slice(0, 15000)).catch(() => {})
      if (d.assignee && d.assignee.email && !(g.keep.assignee && g.keep.assignee.email)) await call(`/tasks/${g.keep.gid}`, { method: 'PUT', body: { data: { assignee: await userGidByEmail(d.assignee.email).catch(() => null) } } }).catch(() => {})
      await call(`/tasks/${d.gid}`, { method: 'DELETE' })
    }
    report.push(r)
  }
  if (!dryRun) taskCache = { at: 0, list: [] }
  return { groups: report.length, removed: report.reduce((a, r) => a + r.removed.length, 0), report, dryRun }
}
