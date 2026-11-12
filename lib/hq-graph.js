// Ústredňa – mapa firmy: z registra práce, oblastí, zdrojov a Obsidian trezoru poskladá jeden graf (uzly a hrany). Čistý modul bez importov.

const STATUS_GROUP = { live: 'zdroj-live', partial: 'zdroj-live', stale: 'zdroj-off', error: 'zdroj-off', pending: 'zdroj-off', off: 'zdroj-off' }

/** Firemná vrstva: ústredňa → oblasti → zdroje; ľudia a agenti → ich úlohy. */
export function companyGraph({ areas = [], sources = [], board = [], tasks = [] } = {}) {
  const nodes = [], links = [], at = new Map()
  const add = (n) => { at.set(n.id, nodes.length); nodes.push(n); return nodes.length - 1 }
  const link = (a, b, w = 1) => { if (at.has(a) && at.has(b)) links.push([at.get(a), at.get(b), w]) }
  add({ id: 'hq', kind: 'hub', group: 'firma', label: 'LIVE-IN', size: 5 })
  for (const a of areas) { if (['overview', 'attention', 'map'].includes(a.id)) continue; add({ id: 'a:' + a.id, kind: 'area', group: 'firma', label: a.nav, area: a.id, size: 3 }); link('hq', 'a:' + a.id, 1) }
  for (const s of sources) {
    add({ id: 's:' + s.key, kind: 'source', group: STATUS_GROUP[s.status] || 'zdroj-off', label: s.name, status: s.status, size: 1.4 })
    const owners = areas.filter((a) => (a.sources || []).includes(s.key))
    if (owners.length) for (const a of owners) link('a:' + a.id, 's:' + s.key, 1); else link('a:connections', 's:' + s.key, 1)
  }
  for (const p of board) { add({ id: 'p:' + p.id, kind: 'actor', group: 'ludia', label: p.name, actorId: p.id, size: 2.2 }); link('a:agents', 'p:' + p.id, 1) }
  for (const t of tasks) {
    add({ id: 't:' + t.taskId, kind: 'task', group: t.status === 'blocked' ? 'uloha-stop' : ['verified', 'applied'].includes(t.status) ? 'uloha-ok' : 'uloha', label: t.title, taskId: t.taskId, status: t.status, size: 1.6 })
    link('p:' + t.assigneeId, 't:' + t.taskId, 1)
    if (t.assignedBy && t.assignedBy !== t.assigneeId) link('p:' + t.assignedBy, 't:' + t.taskId, 0)
  }
  return { nodes, links }
}

/** Spojí firemnú vrstvu s grafom trezoru (uzly trezoru sa pripoja na oblasť Znalosti cez koreňový priečinok). */
export function mergeGraphs(company, vault) {
  if (!vault || !vault.nodes.length) return company
  const off = company.nodes.length
  const nodes = [...company.nodes, ...vault.nodes], links = [...company.links, ...vault.links.map(([a, b, w]) => [a + off, b + off, w])]
  const root = vault.nodes.findIndex((n) => n.kind === 'folder' && n.path === ''), know = company.nodes.findIndex((n) => n.id === 'a:knowledge')
  if (root >= 0 && know >= 0) links.push([know, root + off, 1])
  return { nodes, links }
}

export const GRAPH_GROUPS = [
  { id: 'firma', label: 'Ústredňa a oblasti', color: '#fffefb' }, { id: 'ludia', label: 'Ľudia a agenti', color: '#ffd08a' },
  { id: 'uloha', label: 'Úlohy', color: '#ff9a5c' }, { id: 'uloha-stop', label: 'Blokované', color: '#ff5d4a' }, { id: 'uloha-ok', label: 'Overené', color: '#7fe0a0' },
  { id: 'zdroj-live', label: 'Zdroje naživo', color: '#5fd4c4' }, { id: 'zdroj-off', label: 'Zdroje nepripojené', color: '#6d8177' },
  { id: 'Znalosti', label: 'Obsidian · Znalosti', color: '#9be3b4' }, { id: 'Agenti', label: 'Obsidian · Agenti', color: '#f48a3f' }, { id: 'Tim', label: 'Obsidian · Tím', color: '#f3dba8' }, { id: '*', label: 'Obsidian · ostatné', color: '#a9bfd6' },
]
export const groupColor = (id) => (GRAPH_GROUPS.find((g) => g.id === id) || GRAPH_GROUPS[GRAPH_GROUPS.length - 1]).color
