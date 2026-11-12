// Ústredňa – dáta pre obrazovku /ustredna z registra. Všetko, čo sa zobrazí ako stav, pochádza z prijatých udalostí alebo zo zdravia zdrojov.
import { listTasks, listActors, listSources, listQuarantine, registerReady } from './hq-store.js'
import { attentionOf, actorBoard, recentEvents, OPEN_STATUSES } from './hq-core.js'
import { vaultSummary } from './hq-vault.js'
import { buildAgents } from './hq-agents.js'

const initials = (name = '') => (String(name).replace(/^(agent|person|integration):/, '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()

/** Stav zdroja Obsidian podľa toho, odkiaľ index je: priamo z disku (lokálne) alebo zo synchronizácie (produkcia). */
function vaultSource(vault, now) {
  const iso = new Date(now).toISOString()
  if (!vault) return []
  if (vault.error) return [{ key: 'obsidian', status: 'off', last_error: String(vault.error).slice(0, 200), last_error_at: iso }]
  if (!vault.index) return [{ key: 'obsidian', status: 'pending', note: 'Index trezoru ešte nebol odoslaný. Posiela ho skript tools/ustredna/vault-sync.mjs z počítača, kde je trezor.' }]
  if (vault.source === 'disk') return [{ key: 'obsidian', status: 'live', last_ok_at: iso, account: 'Priamo z disku tohto počítača', note: 'Lokálny beh číta trezor priamo z priečinka, bez synchronizácie.' }]
  return [{ key: 'obsidian', status: 'live', last_ok_at: vault.index.syncedAt, account: 'Synchronizované z počítača s trezorom' + (vault.syncedBy ? ' (' + vault.syncedBy + ')' : ''), note: 'Zobrazuje stav trezoru v čase poslednej synchronizácie. Text poznámok sa neprenáša.' }]
}
/** Stav zdroja „Prehľad agentov“: naživo len s prijatým prehľadom dôkazov; samotný Brain dá iba zápisy rolí. */
function agentsSource(agents, view) {
  if (agents && agents.error) return [{ key: 'agents', status: 'error', last_error: String(agents.error).slice(0, 200), last_error_at: new Date().toISOString() }]
  if (view && view.hasSnapshot) return [{ key: 'agents', status: 'live', last_ok_at: view.asOf, account: 'Zber z počítača s Codexom a diskom' + (agents && agents.syncedBy ? ' (' + agents.syncedBy + ')' : ''), note: 'Stav k času zberu. Rozvrh nie je dôkaz práce; výstup je súbor, hlásenie alebo zápis v Braine.' }]
  return [{ key: 'agents', status: 'pending', note: 'Prehľad ešte nebol odoslaný. Posiela ho skript tools/ustredna/agents-sync.mjs. Bez neho ústredňa pozná len zápisy rolí v Braine.' }]
}
const VOICE = [{ key: 'voice', status: 'partial', account: 'V prehliadači (Chrome, Safari, Edge)', note: 'Reč rozpoznáva prehliadač, nie ústredňa. V Chrome sa zvuk posiela na rozpoznanie Googlu. Zápis vždy potvrdzuješ tlačidlom.' }]

export async function hqDashboard(s, { actor, now = Date.now(), local = false, live = null, vault = null, agents = null } = {}) {
  const agentView = buildAgents(agents && agents.snapshot, vault && vault.index, now)
  const liveSources = [...(live ? live.sources : []), ...vaultSource(vault, now), ...agentsSource(agents, agentView), ...VOICE]
  const extra = { agents: agentView, live: live ? { areas: live.areas, overview: live.overview, signals: live.signals, charts: live.charts, kpis: live.kpis, ceo: live.ceo || null } : null, vault: vault && vault.index ? { ...vaultSummary(vault.index), source: vault.source } : null }
  const ready = await registerReady(s)
  if (!ready) return { ready: false, local, now, me: actor ? { id: actor.id, name: actor.name, initials: initials(actor.name) } : null, tasks: [], attention: [], board: [], updates: [], sources: await listSources(s, { now, live: liveSources }), quarantine: 0, names: {}, ...extra }
  const [tasks, baseActors, sources, quarantine] = await Promise.all([listTasks(s), listActors(s), listSources(s, { now, live: liveSources }), listQuarantine(s, 50)])
  // ľudia sa do prehľadu dostanú tým, že v registri vystupujú (zadali, prevzali alebo je im pridelená úloha), plus prihlásený používateľ
  const actors = [...baseActors]
  const addPerson = (id, name) => { if (id && id.startsWith('person:') && !actors.some((a) => a.id === id)) actors.push({ id, kind: 'person', name: name || id.replace(/^person:/, ''), role: 'Tím LIVE-IN', runtime: 'Človek', capabilities: [] }) }
  if (actor) addPerson(actor.id, actor.name)
  for (const t of tasks) { addPerson(t.assigneeId); for (const e of t.history) addPerson(e.actorId) }
  const names = Object.fromEntries(actors.map((a) => [a.id, a.name]))
  const board = actorBoard(actors, tasks, now).map((a) => ({ id: a.id, kind: a.kind, name: a.name, role: a.role || '', runtime: a.runtime || '', initials: initials(a.name), state: a.state, tone: a.tone, lastAt: a.lastAt, open: a.open, waiting: a.waiting, blocked: a.blocked, current: a.current ? { taskId: a.current.taskId, title: a.current.title, nextAction: a.current.nextAction, status: a.current.status } : null }))
  return {
    ready: true, local, now, names, slackAuto: !!process.env.SLACK_BOT_TOKEN,
    me: actor ? { id: actor.id, name: actor.name, initials: initials(actor.name) } : null,
    tasks, attention: attentionOf(tasks).map((t) => t.taskId), board,
    updates: recentEvents(tasks, 8).map((e) => ({ eventId: e.eventId, taskId: e.taskId, title: e.title, status: e.status, actorId: e.actorId, summary: e.summary, at: e.receivedAt || e.occurredAt })),
    openCount: tasks.filter((t) => OPEN_STATUSES.includes(t.status) && t.status !== 'verified').length,
    sources, quarantine: quarantine.length, ...extra,
    assignable: actors.filter((a) => a.kind !== 'integration' && a.active !== false).map((a) => ({ id: a.id, name: a.name, runtime: a.runtime || '' })),
  }
}
