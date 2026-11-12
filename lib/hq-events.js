// Ústredňa – kontrakt pracovných udalostí (čistá validácia a projekcia; bez siete, tajomstiev a ukladania).
// Port modulu Codexu `implementation/events.mjs` (handoff livein-headquarters-2026-11-12-v1) do konvencií projektu.
// Autentifikáciu vykonávateľa a transakčné uloženie rieši hostiteľ: lib/hq-server.js a lib/hq-store.js.
// Oproti pôvodnému modulu pribudlo len nepovinné pole `refs` (pôvodné odkazy: Slack, Asana, GitHub); udalosť bez neho má rovnaký odtlačok ako predtým.
import { createHash } from 'node:crypto'

export const VERSION = 'livein-work-event-1'
export const STATES = {
  prepared: { capability: 'assign', from: [] },
  accepted: { capability: 'work', from: ['prepared'] },
  working: { capability: 'work', from: ['accepted', 'blocked', 'working'] },
  blocked: { capability: 'work', from: ['accepted', 'working', 'blocked'] },
  result_ready: { capability: 'work', from: ['accepted', 'working'] },
  verified: { capability: 'verify', from: ['result_ready'] },
  applied: { capability: 'apply', from: ['verified'] },
}
export const REF_KINDS = ['slack', 'asana', 'github', 'hubspot', 'calendar', 'mail', 'file', 'other']

const clone = (value) => JSON.parse(JSON.stringify(value))
function required(value, name, max = 250) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + name)
  return value
}
function timestamp(value) {
  required(value, 'timestamp', 50)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) throw new Error('Invalid timestamp')
  const [, y, m, d, h, minute, second, zone] = match
  const days = new Date(Date.UTC(+y, +m, 0)).getUTCDate()
  if (+m < 1 || +m > 12 || +d < 1 || +d > days || +h > 23 || +minute > 59 || +second > 59 ||
     (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59))) throw new Error('Invalid timestamp')
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid timestamp')
  return milliseconds
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
export function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex') }
function safeUrl(value, name, protocols) {
  required(value, name, 2048)
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid ' + name) }
  if (!protocols.includes(url.protocol) || url.username || url.password) throw new Error('Invalid ' + name)
  return value
}
function normaliseEvidence(value) {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Invalid evidence')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid evidence')
    required(item.uri, 'evidence URI', 2048); required(item.version, 'evidence version', 100)
    if (!/^[a-f0-9]{64}$/.test(item.digest)) throw new Error('Invalid evidence digest')
    safeUrl(item.uri, 'evidence URI', ['artifact:', 'https:'])
    return { uri: item.uri, version: item.version, digest: item.digest }
  })
}
/** Pôvodné odkazy na zdroj (správa v Slacku, úloha v Asane…). Sú to odkazy, nie dôkaz, že sa tam niečo vykonalo. */
function normaliseRefs(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error('Invalid refs')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || !REF_KINDS.includes(item.kind)) throw new Error('Invalid refs')
    const ref = { kind: item.kind, id: required(item.id, 'ref ID') }
    if (item.url !== undefined) ref.url = safeUrl(item.url, 'ref URL', ['https:'])
    return ref
  })
}
function sameDigests(a, b) { return canonical([...a].sort()) === canonical([...b].sort()) }

/**
 * Vykonávateľa (actor) určuje overený server, nikdy JSON požiadavky.
 * Hostiteľ musí vrátené udalosti uložiť atomicky s unikátnosťou eventId, (source, sourceEventId) a (taskId, sequence) v rámci workspace.
 */
export function ingest(history, input, { actor, receivedAt } = {}) {
  if (!actor || !Array.isArray(actor.capabilities)) throw new Error('Trusted actor context required')
  required(actor.id, 'actor'); required(actor.workspaceId, 'actor workspace')
  if (!input || input.version !== VERSION) throw new Error('Invalid event version')
  if (input.workspaceId !== actor.workspaceId) throw new Error('Actor workspace mismatch')
  const rule = STATES[input.status]
  if (!rule) throw new Error('Invalid status')
  if (!actor.capabilities.includes(rule.capability)) throw new Error('Actor capability denied')
  const event = { version: VERSION, workspaceId: actor.workspaceId, actorId: actor.id }
  for (const key of ['eventId', 'taskId', 'caseId', 'source', 'sourceEventId', 'assigneeId']) event[key] = required(input[key], key)
  event.summary = required(input.summary, 'summary', 2000)
  event.nextAction = required(input.nextAction, 'nextAction', 2000)
  const now = timestamp(receivedAt), occurred = timestamp(input.occurredAt)
  if (occurred > now + 60_000) throw new Error('Future timestamp')
  event.occurredAt = input.occurredAt
  event.sequence = input.sequence
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) throw new Error('Invalid sequence')
  event.status = input.status
  event.evidence = normaliseEvidence(input.evidence)
  if (input.verification !== undefined) {
    const v = input.verification
    if (!v || !Array.isArray(v.checkedDigests) || !v.checkedDigests.every((d) => typeof d === 'string' && /^[a-f0-9]{64}$/.test(d))) throw new Error('Invalid verification')
    event.verification = { checkedEventId: required(v.checkedEventId, 'verification event'), checkedDigests: [...v.checkedDigests] }
  }
  if (input.receipt !== undefined) {
    const r = input.receipt
    if (!r || typeof r !== 'object') throw new Error('Invalid receipt')
    event.receipt = { id: required(r.id, 'receipt ID'), target: required(r.target, 'receipt target'), verifiedEventId: required(r.verifiedEventId, 'receipt event') }
  }
  if (input.refs !== undefined) event.refs = normaliseRefs(input.refs)
  const payloadDigest = digest(event)
  const workspaceEvents = history.filter((e) => e.workspaceId === actor.workspaceId)
  const duplicate = workspaceEvents.find((e) => e.eventId === event.eventId || (e.source === event.source && e.sourceEventId === event.sourceEventId))
  if (duplicate) {
    if (duplicate.payloadDigest !== payloadDigest) throw new Error('Event identity collision')
    return { events: clone(history), duplicate: true, eventId: duplicate.eventId }
  }
  const previous = workspaceEvents.filter((e) => e.taskId === event.taskId).sort((a, b) => b.sequence - a.sequence)[0]
  if (event.sequence !== (previous ? previous.sequence + 1 : 1)) throw new Error('Unexpected sequence')
  if (!previous && event.status !== 'prepared') throw new Error('Task must start prepared')
  if (previous && !rule.from.includes(previous.status)) throw new Error('Invalid status transition')
  if (previous && (event.assigneeId !== previous.assigneeId || event.caseId !== previous.caseId)) throw new Error('Task identity or assignee changed')
  if (rule.capability === 'work' && actor.id !== event.assigneeId) throw new Error('Only the assignee can publish work')
  if (['result_ready', 'verified', 'applied'].includes(event.status) && !event.evidence.length) throw new Error('Versioned evidence required')
  if (event.status === 'verified') {
    if (previous.actorId === actor.id) throw new Error('Verification must be independent')
    if (!event.verification || event.verification.checkedEventId !== previous.eventId ||
      !sameDigests(event.verification.checkedDigests, previous.evidence.map((e) => e.digest)) ||
      !sameDigests(event.evidence.map((e) => e.digest), previous.evidence.map((e) => e.digest))) throw new Error('Invalid verification of result version')
  }
  if (event.status === 'applied') {
    if (!event.receipt || event.receipt.verifiedEventId !== previous.eventId ||
      !sameDigests(event.evidence.map((e) => e.digest), previous.evidence.map((e) => e.digest))) throw new Error('Application receipt required for verified version')
  }
  event.receivedAt = receivedAt
  event.payloadDigest = payloadDigest
  return { events: [...clone(history), event], duplicate: false, eventId: event.eventId }
}

/** Projekcia histórie jedného autorizovaného workspace. Platný vstup je len výstup z ingest. */
export function projectTask(history, taskId) {
  const events = history.filter((e) => e.taskId === taskId)
  const workspaces = new Set(events.map((e) => e.workspaceId))
  if (workspaces.size > 1) throw new Error('Select an authorised workspace before projection')
  const last = events.sort((a, b) => b.sequence - a.sequence)[0]
  if (!last) return null
  return { ...clone(last), verified: ['verified', 'applied'].includes(last.status), applied: last.status === 'applied', eventCount: events.length }
}
