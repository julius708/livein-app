// Guru sa pozerá do Asany naživo (token ASANA_TOKEN, ten istý ako Údržba a import do KB).
// Citlivé projekty sú skryté: prihlasovacie údaje pre všetkých; faktúry, účtovníctvo, dochádzka, obchod, kontakty pre ne-adminov.
// Vlastný zoznam výnimiek: config.guru_asana = { deny_all: [gid…], deny_staff: [gid…], allow_staff: [gid…] }.
const API = 'https://app.asana.com/api/1.0'
const DENY_ALL = /prihlasovacie\s*údaje|prihlasovacie\s*udaje|heslá|hesla/i
const DENY_STAFF = /faktur|účtovn|uctovn|^\s*paid\s*$|dochádzka|dochadzka|dovolenk|\bsales\b|business|kontakty|meetings|^\s*report\s*$|sifc/i
const TASK_FIELDS = 'name,completed,completed_at,due_on,start_on,created_at,modified_at,assignee.name,projects.name,projects.gid,memberships.section.name,memberships.project.gid,permalink_url,num_subtasks,custom_fields.name,custom_fields.display_value'

export const asanaReady = () => !!process.env.ASANA_TOKEN
const h = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, Accept: 'application/json' })

async function call(path) {
  const res = await fetch(`${API}${path}`, { headers: h(), cache: 'no-store', signal: AbortSignal.timeout(12000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`Asana ${res.status}: ${(j.errors && j.errors[0] && j.errors[0].message) || 'chyba'}`); e.status = res.status; throw e }
  return j
}

let wsCache = { gid: '', at: 0 }
async function workspace() {
  if (wsCache.gid && Date.now() - wsCache.at < 3600e3) return wsCache.gid
  const j = await call('/users/me?opt_fields=workspaces.gid')
  const gid = j.data && j.data.workspaces && j.data.workspaces[0] && j.data.workspaces[0].gid
  if (!gid) throw new Error('Asana: workspace sa nenašiel')
  wsCache = { gid, at: Date.now() }
  return gid
}

let projCache = { list: null, at: 0 }
async function allProjects() {
  if (projCache.list && Date.now() - projCache.at < 600e3) return projCache.list
  const ws = await workspace()
  const j = await call(`/workspaces/${ws}/projects?archived=false&limit=100&opt_fields=name,task_counts.num_incomplete_tasks,task_counts.num_completed_tasks,modified_at`)
  projCache = { list: j.data || [], at: Date.now() }
  return projCache.list
}

/** Pravidlo viditeľnosti projektu pre daného používateľa (čisté, testované). */
export function projectAllowed(p, { isAdmin = false, cfg = {} } = {}) {
  const gid = String(p.gid || ''), name = String(p.name || '')
  const denyAll = (cfg.deny_all || []).map(String), denyStaff = (cfg.deny_staff || []).map(String), allowStaff = (cfg.allow_staff || []).map(String)
  if (denyAll.includes(gid) || DENY_ALL.test(name)) return false
  if (isAdmin) return true
  if (allowStaff.includes(gid)) return true
  if (denyStaff.includes(gid) || DENY_STAFF.test(name)) return false
  return true
}

const short = (s, n) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n))
function slimTask(t, allowedGids, withNotes = false) {
  const projects = (t.projects || []).filter((p) => allowedGids.has(String(p.gid)))
  if ((t.projects || []).length && !projects.length) return null
  const sections = (t.memberships || []).filter((m) => m.project && allowedGids.has(String(m.project.gid)) && m.section).map((m) => m.section.name)
  const fields = (t.custom_fields || []).filter((f) => f.display_value != null && f.display_value !== '').map((f) => `${f.name}: ${short(f.display_value, 80)}`)
  return {
    gid: t.gid, name: short(t.name, 200), completed: !!t.completed, due_on: t.due_on || null, completed_at: t.completed_at || null, modified_at: t.modified_at || null,
    assignee: t.assignee ? t.assignee.name : null, projects: projects.map((p) => p.name), sections: [...new Set(sections)], fields: fields.length ? fields : undefined,
    subtasks: t.num_subtasks || undefined, url: t.permalink_url, ...(withNotes ? { notes: short(t.notes, 1500) } : {}),
  }
}

async function allowedSet(opts) {
  const list = await allProjects()
  const allowed = list.filter((p) => projectAllowed(p, opts))
  return { list: allowed, gids: new Set(allowed.map((p) => String(p.gid))) }
}

/** Prehľad projektov: názov, gid, počty otvorených a hotových úloh. */
export async function listProjects(opts) {
  const { list } = await allowedSet(opts)
  return list.map((p) => ({ gid: p.gid, name: p.name, open: p.task_counts ? p.task_counts.num_incomplete_tasks : null, done: p.task_counts ? p.task_counts.num_completed_tasks : null })).sort((a, b) => (b.open || 0) - (a.open || 0))
}

/** Fulltext vo všetkých úlohách (názov, popis, komentáre), voliteľne len otvorené. */
export async function searchTasks({ text, project, completed, assignee, limit = 20 }, opts) {
  const { list, gids } = await allowedSet(opts)
  const ws = await workspace()
  const q = new URLSearchParams({ limit: String(Math.min(50, Math.max(1, limit))), opt_fields: TASK_FIELDS, sort_by: 'modified_at', sort_ascending: 'false' })
  if (text) q.set('text', String(text).slice(0, 200))
  const pg = project ? resolveProject(list, project) : null
  if (project && !pg) return { error: `Projekt „${project}“ sa nenašiel alebo nie je prístupný. Dostupné: ${list.map((p) => p.name).join(', ')}` }
  if (pg) q.set('projects.any', pg.gid)
  if (completed === true) q.set('completed', 'true'); else if (completed === false) q.set('completed', 'false')
  if (assignee) { const who = await resolveUser(ws, assignee); if (who) q.set('assignee.any', who.gid) }
  try {
    const j = await call(`/workspaces/${ws}/tasks/search?${q}`)
    return { tasks: (j.data || []).map((t) => slimTask(t, gids)).filter(Boolean) }
  } catch (e) {
    if (e.status !== 402 && e.status !== 403) throw e
    // bez platenej funkcie: typeahead podľa názvu
    const j = await call(`/workspaces/${ws}/typeahead?resource_type=task&query=${encodeURIComponent(String(text || '').slice(0, 100))}&count=${Math.min(20, limit)}&opt_fields=${TASK_FIELDS}`)
    return { tasks: (j.data || []).map((t) => slimTask(t, gids)).filter(Boolean), note: 'Hľadanie len podľa názvu úlohy.' }
  }
}

function resolveProject(list, key) {
  const k = String(key || '').trim()
  if (!k) return null
  const byGid = list.find((p) => String(p.gid) === k)
  if (byGid) return byGid
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const nk = norm(k)
  return list.find((p) => norm(p.name) === nk) || list.find((p) => norm(p.name).includes(nk)) || null
}
let userCache = { list: null, at: 0 }
async function resolveUser(ws, name) {
  if (!userCache.list || Date.now() - userCache.at > 3600e3) { const j = await call(`/workspaces/${ws}/users?opt_fields=name,email&limit=100`); userCache = { list: j.data || [], at: Date.now() } }
  const n = String(name).toLowerCase()
  return userCache.list.find((u) => (u.name || '').toLowerCase() === n) || userCache.list.find((u) => (u.name || '').toLowerCase().includes(n) || (u.email || '').toLowerCase().includes(n)) || null
}

/** Úlohy jedného projektu (predvolene otvorené), voliteľne podľa sekcie alebo riešiteľa. */
export async function projectTasks({ project, completed = false, section, assignee, limit = 50 }, opts) {
  const { list, gids } = await allowedSet(opts)
  const pg = resolveProject(list, project)
  if (!pg) return { error: `Projekt „${project}“ sa nenašiel alebo nie je prístupný. Dostupné: ${list.map((p) => p.name).join(', ')}` }
  const q = new URLSearchParams({ limit: '100', opt_fields: TASK_FIELDS })
  if (!completed) q.set('completed_since', 'now')
  const out = []
  let offset = ''
  for (let i = 0; i < 5 && out.length < 400; i++) {
    const j = await call(`/projects/${pg.gid}/tasks?${q}${offset ? `&offset=${offset}` : ''}`)
    out.push(...(j.data || []))
    offset = j.next_page && j.next_page.offset
    if (!offset) break
  }
  let tasks = out.filter((t) => (completed ? true : !t.completed) && !/TEMPLATE|ŠABLÓNA/i.test(t.name || '')).map((t) => slimTask(t, gids)).filter(Boolean)
  if (section) { const s = String(section).toLowerCase(); tasks = tasks.filter((t) => t.sections.some((x) => x.toLowerCase().includes(s))) }
  if (assignee) { const a = String(assignee).toLowerCase(); tasks = tasks.filter((t) => (t.assignee || '').toLowerCase().includes(a)) }
  tasks.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)))
  const sections = [...new Set(tasks.flatMap((t) => t.sections))]
  return { project: pg.name, total: tasks.length, sections, tasks: tasks.slice(0, Math.min(100, limit)) }
}

/** Detail úlohy: popis, polia, komentáre (posledných 15) a podúlohy. */
export async function taskDetail(gid, opts) {
  if (!/^\d+$/.test(String(gid || ''))) return { error: 'Neplatné gid úlohy.' }
  const { gids } = await allowedSet(opts)
  const j = await call(`/tasks/${gid}?opt_fields=${TASK_FIELDS},notes,parent.name,parent.gid`)
  const t = slimTask(j.data || {}, gids, true)
  if (!t) return { error: 'Táto úloha nie je prístupná.' }
  const [st, sub] = await Promise.all([
    call(`/tasks/${gid}/stories?opt_fields=text,created_at,created_by.name,resource_subtype&limit=60`).catch(() => ({ data: [] })),
    call(`/tasks/${gid}/subtasks?opt_fields=name,completed,assignee.name,due_on&limit=50`).catch(() => ({ data: [] })),
  ])
  const comments = (st.data || []).filter((s) => s.resource_subtype === 'comment_added' && s.text).slice(-15).map((s) => ({ at: s.created_at, by: s.created_by ? s.created_by.name : '', text: short(s.text, 800) }))
  const subtasks = (sub.data || []).map((x) => ({ gid: x.gid, name: short(x.name, 160), completed: !!x.completed, assignee: x.assignee ? x.assignee.name : null, due_on: x.due_on || null }))
  return { ...t, parent: j.data && j.data.parent ? j.data.parent.name : undefined, comments, subtasks }
}

/** Jeden vstupný bod pre nástroj Guru. */
export async function runAsanaTool(input, opts) {
  if (!asanaReady()) return { error: 'Asana nie je pripojená (chýba ASANA_TOKEN).' }
  const a = String(input.action || '')
  if (a === 'projects') return { projects: await listProjects(opts) }
  if (a === 'search') return searchTasks({ text: input.text, project: input.project, completed: input.completed, assignee: input.assignee, limit: input.limit }, opts)
  if (a === 'project_tasks') return projectTasks({ project: input.project, completed: !!input.completed, section: input.section, assignee: input.assignee, limit: input.limit }, opts)
  if (a === 'task') return taskDetail(input.gid, opts)
  return { error: 'Neznáma akcia. Použi projects, search, project_tasks alebo task.' }
}
