// Ústredňa – čistá doménová logika nad kontraktom udalostí: vykonávatelia, oprávnenia, operácie, projekcie pre obrazovku.
// Bez siete a bez databázy; všetko je testovateľné (tests/hq-core.test.mjs).
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { VERSION, STATES } from './hq-events.js'

export const WORKSPACE = 'livein'
export { OP_LABEL, STATUS, AREAS, SOURCE_STATUS, ago, statusOf } from './hq-labels.js'

/** Operácie jedného kontraktu (UI, Codex, Claude Code, konektory) → stav udalosti. */
export const OPS = { assign: 'prepared', accept: 'accepted', step: 'working', block: 'blocked', result: 'result_ready', verify: 'verified', apply: 'applied' }
export const OPEN_STATUSES = ['prepared', 'accepted', 'working', 'blocked', 'result_ready', 'verified']

/**
 * Známi vykonávatelia. Ďalších možno pridať v tabuľke hq_actors bez zásahu do histórie (udalosti nesú len ID).
 * Schopnosti: assign = zadať, work = pracovať na vlastnej úlohe, verify = overiť cudzí výsledok, apply = potvrdiť zapracovanie v cieľovej službe.
 */
export const ACTORS = [
  { id: 'agent:claude-code', kind: 'agent', name: 'Claude Code', role: 'Aplikácia, server a konektory', runtime: 'Claude', capabilities: ['assign', 'work', 'verify'] },
  { id: 'agent:codex', kind: 'agent', name: 'Codex', role: 'Kontrakt udalostí, podklady a kontrola verzií', runtime: 'GPT', capabilities: ['assign', 'work', 'verify'] },
  { id: 'integration:asana', kind: 'integration', name: 'Asana', role: 'Potvrdenie zapracovania úloh ľudí', runtime: 'Konektor', capabilities: ['apply'] },
]
export const PERSON_CAPS = ['assign', 'work', 'verify']

export const canHq = (me) => !!(me && (me.roles || []).includes('admin'))
export const personId = (email) => 'person:' + String(email || '').trim().toLowerCase()

/** Vykonávateľ z prihláseného člena tímu (identitu dodáva Supabase session, nie telo požiadavky). */
export function actorFromViewer(v) {
  if (!v || !v.user || !v.user.email || !canHq(v.me)) return null
  return { id: personId(v.user.email), workspaceId: WORKSPACE, capabilities: PERSON_CAPS, kind: 'person', name: (v.me && v.me.name) || v.user.email, runtime: 'Človek' }
}

const sha = (x) => createHash('sha256').update(String(x)).digest()
/**
 * Vykonávateľ z Bearer tokenu. `tokens` je mapa { "agent:codex": "<token>" } z premennej HQ_AGENT_TOKENS (nastavuje Július).
 * Porovnanie je časovo bezpečné; token kratší než 24 znakov sa neprijme. Neznámy vykonávateľ nemá žiadne schopnosti.
 */
export function actorFromToken(token, tokens, registry = ACTORS) {
  const given = String(token || '')
  if (given.length < 24 || !tokens || typeof tokens !== 'object') return null
  let found = null
  for (const [id, secret] of Object.entries(tokens)) {
    if (typeof secret !== 'string' || secret.length < 24) continue
    if (timingSafeEqual(sha(given), sha(secret))) found = id
  }
  if (!found) return null
  const known = registry.find((a) => a.id === found)
  if (!known || known.active === false) return null
  return { id: known.id, workspaceId: WORKSPACE, capabilities: [...(known.capabilities || [])], kind: known.kind, name: known.name, runtime: known.runtime }
}
export function parseTokens(raw) {
  if (!raw) return null
  try { const t = JSON.parse(raw); return t && typeof t === 'object' && !Array.isArray(t) ? t : null } catch { return null }
}

/** Zlúči zabudovaný register s riadkami z hq_actors (nové roly sa pridávajú, staré udalosti sa neprepisujú). */
export function mergeActors(rows = [], base = ACTORS) {
  const by = new Map(base.map((a) => [a.id, { ...a }]))
  for (const r of rows || []) {
    if (!r || !r.id) continue
    by.set(r.id, { ...(by.get(r.id) || {}), id: r.id, kind: r.kind || 'agent', name: r.name || r.id, role: r.role || '', runtime: r.runtime || '', capabilities: Array.isArray(r.capabilities) ? r.capabilities : [], active: r.active !== false })
  }
  return [...by.values()]
}

export class HqError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`
const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max)

/** Zdroj udalosti je naviazaný na overeného vykonávateľa, nie na ľubovoľný text požiadavky. */
export function sourceFor(actor) {
  if (actor.kind === 'person') return 'ui'
  if (actor.kind === 'integration') return 'connector:' + actor.id.replace(/^integration:/, '')
  return 'runtime:' + actor.id.replace(/^agent:/, '')
}

/**
 * Z operácie a doterajšej histórie úlohy zostaví vstup pre ingest(). Poradie určuje server (ďalšie číslo);
 * ak klient pošle `sequence`, musí sedieť, inak ide o oneskorenú alebo súbežnú udalosť.
 */
export function buildEvent(op, p = {}, { actor, taskHistory = [], now = new Date().toISOString() } = {}) {
  const status = OPS[op]
  if (!status) throw new HqError('bad_op', 'Neznáma operácia. Povolené: ' + Object.keys(OPS).join(', ') + '.')
  if (!actor) throw new HqError('no_actor', 'Chýba overený vykonávateľ.', 401)
  const last = [...taskHistory].sort((a, b) => b.sequence - a.sequence)[0] || null
  if (op === 'assign' && last) throw new HqError('exists', 'Úloha s týmto ID už existuje.', 409)
  if (op !== 'assign' && !last) throw new HqError('not_found', 'Úloha neexistuje.', 404)
  const taskId = op === 'assign' ? (text(p.taskId, 120) || newId('task')) : last.taskId
  const eventId = text(p.eventId, 120) || newId('evt')
  const summary = text(p.summary, 2000), nextAction = text(p.nextAction, 2000)
  if (!summary) throw new HqError('summary', 'Chýba stručný opis (summary).')
  if (!nextAction) throw new HqError('next', 'Chýba ďalší krok (nextAction): kto a čo má urobiť ďalej.')
  const input = {
    version: VERSION, workspaceId: WORKSPACE, eventId, taskId,
    caseId: op === 'assign' ? (text(p.caseId, 120) || 'case_' + taskId.replace(/^task_/, '')) : last.caseId,
    source: sourceFor(actor), sourceEventId: text(p.idempotencyKey, 200) || eventId,
    sequence: p.sequence != null ? Number(p.sequence) : (last ? last.sequence + 1 : 1),
    occurredAt: text(p.occurredAt, 50) || now, status, summary, nextAction,
    assigneeId: op === 'assign' ? text(p.assigneeId, 120) : last.assigneeId,
    evidence: Array.isArray(p.evidence) ? p.evidence : [],
  }
  if (op === 'assign' && !input.assigneeId) throw new HqError('assignee', 'Chýba príjemca úlohy (assigneeId).')
  if (op === 'verify') {
    // Kontrolór musí sám uviesť, ktorú udalosť a ktoré odtlačky skontroloval; server ich nedopĺňa za neho.
    if (!p.checkedEventId || !Array.isArray(p.checkedDigests)) throw new HqError('verification', 'Overenie musí uviesť checkedEventId a checkedDigests konkrétnej verzie výsledku.')
    input.verification = { checkedEventId: String(p.checkedEventId), checkedDigests: p.checkedDigests }
    if (!input.evidence.length) input.evidence = (last.evidence || []).filter((e) => p.checkedDigests.includes(e.digest))
  }
  if (op === 'apply') {
    if (!p.receipt || typeof p.receipt !== 'object') throw new HqError('receipt', 'Zapracovanie potrebuje potvrdenie cieľovej služby (receipt: id, target).')
    input.receipt = { id: p.receipt.id, target: p.receipt.target, verifiedEventId: p.receipt.verifiedEventId || last.eventId }
    if (!input.evidence.length) input.evidence = last.evidence || []
  }
  if (Array.isArray(p.refs) && p.refs.length) input.refs = p.refs
  return input
}

/** Chybové hlášky kontraktu po slovensky (API vracia aj pôvodný kód). */
const REASONS = [
  [/capability denied/i, 'forbidden', 'Na túto operáciu nemáš oprávnenie.', 403],
  [/Only the assignee/i, 'not_assignee', 'Pracovať na úlohe môže len ten, komu je pridelená.', 403],
  [/must be independent/i, 'self_verify', 'Vlastný výsledok nemôže overiť jeho autor.', 403],
  [/Unexpected sequence/i, 'sequence', 'Udalosť je mimo poradia (oneskorená alebo súbežná). Načítaj úlohu znova.', 409],
  [/identity collision/i, 'collision', 'Pod tým istým ID už existuje iná udalosť.', 409],
  [/Invalid status transition|must start prepared/i, 'transition', 'Tento krok v aktuálnom stave úlohy nie je možný.', 409],
  [/evidence required/i, 'evidence', 'Výsledok potrebuje aspoň jeden verzovaný dôkaz (uri, version, digest).', 400],
  [/Invalid verification/i, 'verification', 'Overenie nesedí s poslednou verziou výsledku.', 409],
  [/receipt required/i, 'receipt', 'Zapracovanie potrebuje potvrdenie cieľovej služby pre overenú verziu.', 400],
  [/Future timestamp|Invalid timestamp/i, 'timestamp', 'Neplatný čas udalosti (potrebná je časová zóna, nie budúcnosť).', 400],
]
export function explain(e) {
  if (e instanceof HqError) return e
  const msg = String((e && e.message) || e)
  for (const [re, code, sk, status] of REASONS) if (re.test(msg)) return new HqError(code, sk, status)
  if (/^Invalid /.test(msg)) return new HqError('invalid', 'Neplatný údaj: ' + msg.replace(/^Invalid /, ''), 400)
  return new HqError('error', 'Udalosť sa nepodarilo spracovať.', 500)
}

/* ---------------- projekcie pre obrazovku a fronty ---------------- */

/** Z udalostí jedného workspace poskladá úlohy s históriou. Stav je vždy posledná prijatá udalosť, nikdy odhad. */
export function projectTasks(events = []) {
  const by = new Map()
  for (const e of events) { if (!by.has(e.taskId)) by.set(e.taskId, []); by.get(e.taskId).push(e) }
  const tasks = []
  for (const [taskId, list] of by) {
    const history = [...list].sort((a, b) => a.sequence - b.sequence)
    const first = history[0], last = history[history.length - 1]
    const result = [...history].reverse().find((e) => e.status === 'result_ready') || null
    const refs = [], seen = new Set()
    for (const e of history) for (const r of e.refs || []) { const k = r.kind + ':' + r.id; if (!seen.has(k)) { seen.add(k); refs.push(r) } }
    tasks.push({
      taskId, caseId: first.caseId, title: first.summary, assigneeId: first.assigneeId, assignedBy: first.actorId, createdAt: first.occurredAt,
      status: last.status, summary: last.summary, nextAction: last.nextAction, lastActorId: last.actorId, lastAt: last.receivedAt || last.occurredAt, sequence: last.sequence,
      evidence: last.evidence || [], result: result ? { eventId: result.eventId, evidence: result.evidence, actorId: result.actorId, at: result.receivedAt || result.occurredAt } : null,
      verified: ['verified', 'applied'].includes(last.status), applied: last.status === 'applied', refs, history,
    })
  }
  return tasks.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
}

/** Čo potrebuje pozornosť: blokovania, výsledky čakajúce na kontrolu a zadania, ktoré nikto neprevzal. */
export function attentionOf(tasks = []) {
  const order = { blocked: 0, result_ready: 1, prepared: 2 }
  return tasks.filter((t) => t.status in order).sort((a, b) => order[a.status] - order[b.status] || String(b.lastAt).localeCompare(String(a.lastAt)))
}

/** Fronta vykonávateľa: jeho otvorené úlohy + cudzie výsledky, ktoré môže nezávisle overiť. */
export function queueFor(tasks = [], actorId) {
  return {
    mine: tasks.filter((t) => t.assigneeId === actorId && ['prepared', 'accepted', 'working', 'blocked'].includes(t.status)),
    toVerify: tasks.filter((t) => t.status === 'result_ready' && t.lastActorId !== actorId),
  }
}

/**
 * Stav vykonávateľa odvodený výhradne z jeho udalostí. Bez signálu je „bez signálu“, nie „pracuje“:
 * register nevie, či runtime beží; ukazuje len, čo vykonávateľ naposledy sám ohlásil.
 */
export function actorBoard(actors = [], tasks = [], now = Date.now()) {
  return actors.filter((a) => a.active !== false).map((a) => {
    const own = tasks.filter((t) => t.assigneeId === a.id)
    const current = own.find((t) => ['working', 'blocked', 'accepted'].includes(t.status)) || own.find((t) => t.status === 'prepared') || own[0] || null
    let lastAt = null
    for (const t of tasks) for (const e of t.history) if (e.actorId === a.id && (!lastAt || (e.receivedAt || e.occurredAt) > lastAt)) lastAt = e.receivedAt || e.occurredAt
    const waiting = own.filter((t) => t.status === 'prepared').length, blocked = own.filter((t) => t.status === 'blocked').length
    let state = 'Bez signálu', tone = 'gray'
    if (blocked) { state = 'Blokované'; tone = 'red' }
    else if (current && ['working', 'accepted'].includes(current.status)) { state = Date.parse(current.lastAt) > now - 6 * 3600e3 ? 'Pracuje' : 'Rozpracované, bez nového kroku'; tone = Date.parse(current.lastAt) > now - 6 * 3600e3 ? '' : 'orange' }
    else if (waiting) { state = 'Čaká na prevzatie'; tone = 'orange' }
    else if (lastAt) { state = 'Bez otvorenej úlohy'; tone = 'gray' }
    return { ...a, state, tone, current, lastAt, open: own.filter((t) => OPEN_STATUSES.includes(t.status) && t.status !== 'verified').length, waiting, blocked }
  })
}

/** Posledné udalosti naprieč úlohami (spoločné aktualizácie). */
export function recentEvents(tasks = [], limit = 8) {
  const all = []
  for (const t of tasks) for (const e of t.history) all.push({ ...e, title: t.title })
  return all.sort((a, b) => String(b.receivedAt || b.occurredAt).localeCompare(String(a.receivedAt || a.occurredAt))).slice(0, limit)
}


/**
 * Zdroje a ich pravdivý predvolený stav. Živé hodnoty (posledný úspech, chyba, pokryté obdobie) dopĺňa tabuľka hq_sources;
 * počet akcií v Zapieri ani existencia konektora nie sú dôkaz fungujúcej synchronizácie.
 */
export const SOURCES = [
  { key: 'register', name: 'Register práce', scope: 'Zadania, prevzatia, kroky, blokovania, výsledky a overenia', kind: 'core' },
  { key: 'runtime-claude-code', name: 'Claude Code', scope: 'Udalosti z lokálneho runtime cez spoločný nástroj (tools/ustredna/hq.mjs)', kind: 'runtime' },
  { key: 'runtime-codex', name: 'Codex', scope: 'Udalosti z lokálneho runtime cez spoločný nástroj (tools/ustredna/hq.mjs)', kind: 'runtime' },
  { key: 'slack', name: 'Slack #ai-tim', scope: 'Kanál C0C9HG8B42C: hlásenia udalostí vo vláknach prípadov', kind: 'connector' },
  { key: 'asana', name: 'Asana', scope: 'Úlohy ľudí: škody a opravy, leady; workspace 1161596604355697', kind: 'connector' },
  { key: 'crm', name: 'CRM: leady a obhliadky', scope: 'Leady, ich fázy, lehoty a úlohy vrátane obhliadok', kind: 'module' },
  { key: 'maintenance', name: 'Údržba', scope: 'Otvorené prípady údržby a ich riešitelia', kind: 'module' },
  { key: 'content', name: 'Obsah a newsletter', scope: 'Nápady na obsah a odoslané newslettre', kind: 'module' },
  { key: 'kb', name: 'Znalostná báza', scope: 'Podklady pre Guru: SOP, sprievodcovia, dokumentácia', kind: 'module' },
  { key: 'gmail', name: 'Gmail', scope: 'Firemné správy a návrhy odpovedí; firemný účet treba potvrdiť', kind: 'connector' },
  { key: 'outlook', name: 'Outlook', scope: 'Firemné schránky; presný výber schránok treba potvrdiť', kind: 'connector' },
  { key: 'whatsapp', name: 'WhatsApp', scope: 'Firemné konverzácie a následné kroky', kind: 'connector' },
  { key: 'calendar', name: 'Google Calendar', scope: 'Obhliadky a zdieľané kalendáre tímu', kind: 'connector' },
  { key: 'hubspot', name: 'HubSpot', scope: 'Kontakty a zápisy z CRM; obojsmerná synchronizácia', kind: 'connector' },
  { key: 'guesty', name: 'Guesty', scope: 'Rezervácie, príchody, odchody, obsadenosť a byty v prevádzke', kind: 'connector' },
  { key: 'pricelabs', name: 'PriceLabs', scope: 'Ceny a výkon portfólia', kind: 'connector' },
  { key: 'social', name: 'YouTube / Meta', scope: 'Výsledky videí a kampaní', kind: 'connector' },
  { key: 'facebook-leads', name: 'Facebook Lead Ads', scope: 'Dopyty z formulárov; firemný účet treba potvrdiť', kind: 'connector' },
  { key: 'smartemailing', name: 'SmartEmailing', scope: 'Zoznamy a kampane', kind: 'connector' },
  { key: 'invest-feed', name: 'Investičný feed', scope: 'Ponuky na kúpu z výskumu; príjem do appky treba overiť', kind: 'connector' },
  { key: 'agent-files', name: 'Súborový register agentov', scope: 'Staršie úlohy a udalosti Agent_system (adaptér Codexu)', kind: 'adapter' },
  { key: 'finance', name: 'Financie', scope: 'Vyúčtovanie majiteľom a podklad Ekonomiky', kind: 'connector' },
  { key: 'voice', name: 'Hlasové zadávanie', scope: 'Rovnaké akcie ako tlačidlá', kind: 'input' },
]

/** Spojí predvolený zoznam zdrojov so živými riadkami z hq_sources. Zdroj s poslednou chybou novšou než úspech je „Chyba“. */
export function mergeSources(rows = [], { now = Date.now(), staleHours = 48 } = {}) {
  const by = new Map((rows || []).map((r) => [r.key, r]))
  const out = SOURCES.map((d) => {
    const r = by.get(d.key) || {}
    let status = r.status || 'off'
    if (r.last_error_at && (!r.last_ok_at || r.last_error_at > r.last_ok_at)) status = 'error'
    else if (status === 'live' && r.last_ok_at && Date.parse(r.last_ok_at) < now - staleHours * 3600e3) status = 'stale'
    return { ...d, status, account: r.account || null, scope: r.scope || d.scope, note: r.note || null, lastOkAt: r.last_ok_at || null, lastError: r.last_error || null, lastErrorAt: r.last_error_at || null, coveredFrom: r.covered_from || null, coveredTo: r.covered_to || null }
  })
  for (const r of rows || []) if (!SOURCES.some((d) => d.key === r.key)) out.push({ key: r.key, name: r.name || r.key, scope: r.scope || '', kind: r.kind || 'connector', status: r.status || 'off', account: r.account || null, note: r.note || null, lastOkAt: r.last_ok_at || null, lastError: r.last_error || null, lastErrorAt: r.last_error_at || null, coveredFrom: r.covered_from || null, coveredTo: r.covered_to || null })
  return out
}

export const capabilityFor = (op) => (STATES[OPS[op]] || {}).capability
