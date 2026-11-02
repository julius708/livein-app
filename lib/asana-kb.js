// Guru sa učí z Asany: projekt „Portfolio & SOPs“ (Martina) sa raz denne prepíše do znalostnej bázy (cs.kb_docs),
// takže ho nájde vyhľadávanie v KB aj Guru. Časť „Naše poznámky“ + komentáre + údaje z Guesty pri každom byte.
const API = 'https://app.asana.com/api/1.0'
export const PORTFOLIO_PROJECT = process.env.ASANA_KB_PROJECT || '1219856296936153'
const h = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, Accept: 'application/json' })

async function call(path) {
  const res = await fetch(`${API}${path}`, { headers: h(), cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Asana ${res.status}: ${(j.errors && j.errors[0] && j.errors[0].message) || 'chyba'}`)
  return j
}
async function allTasks(project) {
  const out = []; let offset = ''
  for (let i = 0; i < 10; i++) {
    const j = await call(`/projects/${project}/tasks?opt_fields=name,notes,completed,modified_at,permalink_url,memberships.section.name,memberships.project.gid&limit=100${offset ? `&offset=${offset}` : ''}`)
    out.push(...(j.data || []))
    offset = j.next_page && j.next_page.offset
    if (!offset) break
  }
  return out
}
async function comments(gid) {
  try {
    const j = await call(`/tasks/${gid}/stories?opt_fields=text,created_at,created_by.name,resource_subtype&limit=50`)
    return (j.data || []).filter((s) => s.resource_subtype === 'comment_added' && s.text).slice(-15)
  } catch { return [] }
}
const fmt = (d) => new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' })

/** Vráti dokumenty pre KB: [{path, title, content, tags, updated_at}] */
export async function buildKbDocs({ withComments = true } = {}) {
  const tasks = await allTasks(PORTFOLIO_PROJECT)
  const docs = []
  const queue = tasks.filter((t) => !t.completed && (t.notes || '').trim().length > 20 && !/stav synchroniz/i.test(t.name))
  let i = 0
  async function worker() {
    while (i < queue.length) {
      const t = queue[i++]
      const section = ((t.memberships || []).find((m) => m.project && m.project.gid === PORTFOLIO_PROJECT) || {}).section
      const sec = (section && section.name) || ''
      const isSop = /sop/i.test(sec), inactive = /neakt/i.test(sec)
      const cm = withComments ? await comments(t.gid) : []
      const body = [t.notes.trim()]
      if (cm.length) body.push('\n---\nKomentáre tímu:\n' + cm.map((c) => `• ${fmt(c.created_at)} ${c.created_by ? c.created_by.name : ''}: ${c.text}`).join('\n'))
      body.push(`\n(Zdroj: Asana, projekt Portfolio & SOPs, ${t.permalink_url || ''})`)
      docs.push({ path: `asana/portfolio/${t.gid}`, title: (isSop ? 'SOP: ' : inactive ? 'Byt (neaktívny): ' : 'Byt: ') + t.name.replace(/^💡\s*/, '').trim(), content: body.join('\n'), tags: ['asana', isSop ? 'sop' : 'byt', ...(inactive ? ['neaktivny'] : [])], updated_at: t.modified_at })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker()])
  return docs
}
