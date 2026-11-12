// Ústredňa – dáta pre obrazovku /ustredna z registra. Všetko, čo sa zobrazí ako stav, pochádza z prijatých udalostí alebo zo zdravia zdrojov.
import { listTasks, listActors, listSources, listQuarantine, registerReady } from './hq-store.js'
import { attentionOf, actorBoard, recentEvents, OPEN_STATUSES } from './hq-core.js'

const initials = (name = '') => (String(name).replace(/^(agent|person|integration):/, '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()

export async function hqDashboard(s, { actor, now = Date.now(), local = false, live = null } = {}) {
  const liveSources = live ? live.sources : []
  const ready = await registerReady(s)
  if (!ready) return { ready: false, local, now, me: actor ? { id: actor.id, name: actor.name, initials: initials(actor.name) } : null, tasks: [], attention: [], board: [], updates: [], sources: await listSources(s, { now, live: liveSources }), quarantine: 0, names: {}, live: live ? { areas: live.areas, overview: live.overview, signals: live.signals } : null }
  const [tasks, baseActors, sources, quarantine] = await Promise.all([listTasks(s), listActors(s), listSources(s, { now, live: liveSources }), listQuarantine(s, 50)])
  // ľudia sa do prehľadu dostanú tým, že v registri vystupujú (zadali, prevzali alebo je im pridelená úloha), plus prihlásený používateľ
  const actors = [...baseActors]
  const addPerson = (id, name) => { if (id && id.startsWith('person:') && !actors.some((a) => a.id === id)) actors.push({ id, kind: 'person', name: name || id.replace(/^person:/, ''), role: 'Tím LIVE-IN', runtime: 'Človek', capabilities: [] }) }
  if (actor) addPerson(actor.id, actor.name)
  for (const t of tasks) { addPerson(t.assigneeId); for (const e of t.history) addPerson(e.actorId) }
  const names = Object.fromEntries(actors.map((a) => [a.id, a.name]))
  const board = actorBoard(actors, tasks, now).map((a) => ({ id: a.id, kind: a.kind, name: a.name, role: a.role || '', runtime: a.runtime || '', initials: initials(a.name), state: a.state, tone: a.tone, lastAt: a.lastAt, open: a.open, waiting: a.waiting, blocked: a.blocked, current: a.current ? { taskId: a.current.taskId, title: a.current.title, nextAction: a.current.nextAction, status: a.current.status } : null }))
  return {
    ready: true, local, now, names,
    me: actor ? { id: actor.id, name: actor.name, initials: initials(actor.name) } : null,
    tasks, attention: attentionOf(tasks).map((t) => t.taskId), board,
    updates: recentEvents(tasks, 8).map((e) => ({ eventId: e.eventId, taskId: e.taskId, title: e.title, status: e.status, actorId: e.actorId, summary: e.summary, at: e.receivedAt || e.occurredAt })),
    openCount: tasks.filter((t) => OPEN_STATUSES.includes(t.status) && t.status !== 'verified').length,
    sources, quarantine: quarantine.length, live: live ? { areas: live.areas, overview: live.overview, signals: live.signals } : null,
    assignable: actors.filter((a) => a.kind !== 'integration' && a.active !== false).map((a) => ({ id: a.id, name: a.name, runtime: a.runtime || '' })),
  }
}
