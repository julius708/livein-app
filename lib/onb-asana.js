// Asana: projekt „Onboarding nových nehnuteľností“. Každý byt je úloha s podúlohami; appka vytvára ČISTÚ kópiu zo šablóny TEMPLATE.
const API = 'https://app.asana.com/api/1.0'
export const ONB_PROJECT = '1217657399685664'
export const TEMPLATE_TASK = '1219711469668152'
export const ASANA_TAG = 'asana-onboarding'
const MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December']

export const asanaConfigured = () => !!process.env.ASANA_TOKEN
const h = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' })
async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: h(), cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Asana ${res.status}: ${(j.errors && j.errors[0] && j.errors[0].message) || 'chyba'}`)
  return j.data
}

/** Členovia projektu (na priradenie krokov). */
export async function projectMembers() {
  if (!asanaConfigured()) return []
  try {
    const res = await fetch(`${API}/projects/${ONB_PROJECT}?opt_fields=members.name,members.gid`, { headers: h(), next: { revalidate: 3600, tags: [ASANA_TAG] } })
    if (!res.ok) return []
    const { data } = await res.json()
    return ((data && data.members) || []).map((m) => ({ gid: m.gid, name: m.name })).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  } catch { return [] }
}

/** Sekcia podľa mesiaca (napr. „November“); keď neexistuje, vytvorí ju. */
async function monthSection() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }))
  const name = MONTHS[now.getMonth()]
  const sections = await call(`/projects/${ONB_PROJECT}/sections?opt_fields=name`)
  const found = sections.find((s) => s.name.trim().toLowerCase() === name.toLowerCase())
  if (found) return found
  return call(`/projects/${ONB_PROJECT}/sections`, { method: 'POST', body: JSON.stringify({ data: { name } }) })
}

/** Čistá kópia šablóny: nová úloha (adresa) v sekcii mesiaca + podúlohy podľa šablóny v appke (názvy zo šablóny TEMPLATE, poznámky prekopírované). */
export async function createUnitTask({ address, notes, steps }) {
  if (!asanaConfigured()) throw new Error('Asana nie je pripojená (chýba ASANA_TOKEN).')
  const section = await monthSection()
  const task = await call('/tasks', { method: 'POST', body: JSON.stringify({ data: { name: address, notes: notes || '', projects: [ONB_PROJECT], memberships: [{ project: ONB_PROJECT, section: section.gid }] } }) })
  // poznámky z podúloh šablóny podľa názvu (napr. LISTING FORMULAR má v popise formulár)
  let tpl = []
  try { tpl = await call(`/tasks/${TEMPLATE_TASK}/subtasks?opt_fields=name,notes`) } catch {}
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const created = []
  for (const s of steps) {
    const t = tpl.find((x) => norm(x.name).startsWith(norm(s.title).slice(0, 12)))
    const sub = await call(`/tasks/${task.gid}/subtasks`, { method: 'POST', body: JSON.stringify({ data: { name: s.title, notes: (t && t.notes) || '' } }) })
    created.push({ key: s.key, gid: sub.gid })
  }
  return { task_gid: task.gid, section_gid: section.gid, url: task.permalink_url || `https://app.asana.com/0/${ONB_PROJECT}/${task.gid}`, steps: created }
}

/** Aktuálny stav podúloh z Asany (dokončené, priradené, termín), cache 10 minút. */
export async function unitSubtasks(taskGid) {
  if (!asanaConfigured() || !taskGid) return null
  try {
    const res = await fetch(`${API}/tasks/${taskGid}/subtasks?opt_fields=name,completed,assignee.name,assignee.gid,due_on`, { headers: h(), next: { revalidate: 600, tags: [ASANA_TAG, `unit-${taskGid}`] } })
    if (!res.ok) return null
    const { data } = await res.json()
    return (data || []).map((t) => ({ gid: t.gid, completed: !!t.completed, assignee: t.assignee ? t.assignee.name : null, assignee_gid: t.assignee ? t.assignee.gid : null, due_on: t.due_on || null }))
  } catch { return null }
}

export async function updateSubtask(gid, data, comment) {
  if (!asanaConfigured() || !/^\d+$/.test(String(gid))) return { ok: false, error: 'Asana nie je pripojená.' }
  try {
    await call(`/tasks/${gid}`, { method: 'PUT', body: JSON.stringify({ data }) })
    if (comment) await call(`/tasks/${gid}/stories`, { method: 'POST', body: JSON.stringify({ data: { text: comment } }) }).catch(() => {})
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

/** Podúloha pod úlohou bytu (napr. nákup u jedného predajcu). */
export async function createSubtask(parentGid, name, notes) {
  if (!asanaConfigured()) throw new Error('Asana nie je pripojená (chýba ASANA_TOKEN).')
  const sub = await call(`/tasks/${parentGid}/subtasks`, { method: 'POST', body: JSON.stringify({ data: { name, notes: notes || '' } }) })
  return { gid: sub.gid, url: sub.permalink_url || `https://app.asana.com/0/0/${sub.gid}` }
}
export async function updateTaskNotes(gid, name, notes) {
  if (!asanaConfigured()) throw new Error('Asana nie je pripojená (chýba ASANA_TOKEN).')
  await call(`/tasks/${gid}`, { method: 'PUT', body: JSON.stringify({ data: { name, notes } }) })
}
