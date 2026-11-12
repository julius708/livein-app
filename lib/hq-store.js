// Ústredňa – trvalý register udalostí nad Supabase (alebo lokálnym súborom cez lib/hq-local.js).
// Všetky funkcie dostanú klienta `s` a sú testovateľné bez siete. Register je len na pridávanie: udalosti sa nemenia ani nemažú.
import { ingest } from './hq-events.js'
import { WORKSPACE, OPS, buildEvent, sourceFor, explain, HqError, projectTasks, mergeActors, mergeSources } from './hq-core.js'

const MISSING = /relation .* does not exist|schema cache|could not find the table/i
const isMissing = (error) => !!(error && MISSING.test(error.message || ''))

const toRow = (e) => ({
  workspace_id: e.workspaceId, event_id: e.eventId, task_id: e.taskId, case_id: e.caseId, source: e.source, source_event_id: e.sourceEventId,
  sequence: e.sequence, status: e.status, actor_id: e.actorId, assignee_id: e.assigneeId, summary: e.summary, next_action: e.nextAction,
  occurred_at: e.occurredAt, received_at: e.receivedAt, evidence: e.evidence, verification: e.verification || null, receipt: e.receipt || null,
  refs: e.refs || null, payload_digest: e.payloadDigest, version: e.version,
})
const fromRow = (r) => {
  const e = {
    version: r.version, workspaceId: r.workspace_id, actorId: r.actor_id, eventId: r.event_id, taskId: r.task_id, caseId: r.case_id, source: r.source,
    sourceEventId: r.source_event_id, assigneeId: r.assignee_id, summary: r.summary, nextAction: r.next_action, occurredAt: r.occurred_at,
    sequence: r.sequence, status: r.status, evidence: r.evidence || [], receivedAt: r.received_at, payloadDigest: r.payload_digest,
  }
  if (r.verification) e.verification = r.verification
  if (r.receipt) e.receipt = r.receipt
  if (r.refs) e.refs = r.refs
  return e
}

/** Je schéma ústredne v databáze? (Pred aplikovaním migrácie obrazovka ukáže pravdivý stav namiesto chyby.) */
export async function registerReady(s) {
  const r = await s.from('hq_events').select('event_id').limit(1)
  if (isMissing(r.error)) return false
  if (r.error) throw new Error('register: ' + r.error.message)
  return true
}

export async function loadEvents(s, { taskId = null } = {}) {
  let q = s.from('hq_events').select('*').eq('workspace_id', WORKSPACE)
  if (taskId) q = q.eq('task_id', taskId)
  const r = await q.order('sequence', { ascending: true }).limit(5000)
  if (isMissing(r.error)) return []
  if (r.error) throw new Error('udalosti: ' + r.error.message)
  return (r.data || []).map(fromRow)
}

async function findDuplicates(s, input) {
  const a = await s.from('hq_events').select('*').eq('workspace_id', WORKSPACE).eq('event_id', input.eventId).limit(1)
  const b = await s.from('hq_events').select('*').eq('workspace_id', WORKSPACE).eq('source', input.source).eq('source_event_id', input.sourceEventId).limit(1)
  for (const r of [a, b]) if (r.error) throw new Error('udalosti: ' + r.error.message)
  return [...(a.data || []), ...(b.data || [])].map(fromRow)
}

/** Odmietnuté a oneskorené udalosti sa nestrácajú: idú do karantény s dôvodom a neovplyvnia stav úlohy. */
async function quarantine(s, { op, params, actor, code, reason, now }) {
  const r = await s.from('hq_quarantine').insert({ workspace_id: WORKSPACE, actor_id: actor ? actor.id : null, op, task_id: (params && params.taskId) || null, reason_code: code, reason, payload: params || {}, received_at: now })
  if (r.error && !isMissing(r.error)) console.error('[hq] karanténa', String(r.error.message).slice(0, 120))
}

/**
 * Jedna operácia kontraktu: overí ju proti histórii úlohy a pridá do registra.
 * Opakované doručenie (rovnaký eventId alebo idempotencyKey a rovnaký obsah) nevytvorí nič nové a vráti duplicate: true.
 * Súbežný zápis zachytí unikátny kľúč databázy; operácia sa raz prehodnotí proti čerstvej histórii.
 */
export async function appendOp(s, op, params = {}, { actor, now = new Date().toISOString() } = {}) {
  if (!actor) throw new HqError('no_actor', 'Chýba overený vykonávateľ.', 401)
  const taskId = params.taskId ? String(params.taskId) : null
  // Opakovanie s rovnakým idempotencyKey: server prideľuje eventId aj čas, preto sa zhoda posudzuje podľa obsahu operácie.
  if (params.idempotencyKey) {
    const key = String(params.idempotencyKey).trim().slice(0, 200)
    const r = await s.from('hq_events').select('*').eq('workspace_id', WORKSPACE).eq('source', sourceFor(actor)).eq('source_event_id', key).limit(1)
    if (r.error && !isMissing(r.error)) throw new Error('udalosti: ' + r.error.message)
    const prior = (r.data || []).map(fromRow)[0]
    if (prior) {
      const same = prior.status === OPS[op] && prior.actorId === actor.id && prior.summary === String(params.summary || '').trim() && prior.nextAction === String(params.nextAction || '').trim() && (!taskId || prior.taskId === taskId)
      if (same) return { ok: true, duplicate: true, eventId: prior.eventId, taskId: prior.taskId, sequence: prior.sequence, status: prior.status }
      await quarantine(s, { op, params, actor, code: 'collision', reason: 'Rovnaký idempotencyKey, iný obsah', now })
      throw new HqError('collision', 'Pod tým istým kľúčom už existuje iná udalosť.', 409)
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const taskHistory = taskId ? await loadEvents(s, { taskId }) : []
    let input, result
    try {
      input = buildEvent(op, params, { actor, taskHistory, now })
      const dup = await findDuplicates(s, input)
      const history = [...taskHistory, ...dup.filter((d) => !taskHistory.some((e) => e.eventId === d.eventId))]
      result = ingest(history, input, { actor, receivedAt: now })
    } catch (e) {
      const x = explain(e)
      if (['sequence', 'collision', 'transition', 'verification'].includes(x.code)) await quarantine(s, { op, params, actor, code: x.code, reason: String(e.message).slice(0, 300), now })
      throw x
    }
    if (result.duplicate) return { ok: true, duplicate: true, eventId: result.eventId, taskId: input.taskId }
    const event = result.events[result.events.length - 1]
    const ins = await s.from('hq_events').insert(toRow(event))
    if (!ins.error) return { ok: true, duplicate: false, eventId: event.eventId, taskId: event.taskId, sequence: event.sequence, status: event.status, event }
    if (ins.error.code === '23505' && attempt === 0) continue   // niekto zapísal medzitým: prehodnotiť proti novej histórii
    if (ins.error.code === '23505') { await quarantine(s, { op, params, actor, code: 'conflict', reason: 'Súbežný zápis', now }); throw new HqError('conflict', 'Úloha sa medzitým zmenila. Načítaj ju znova.', 409) }
    throw new Error('zápis udalosti: ' + ins.error.message)
  }
  throw new HqError('conflict', 'Úloha sa medzitým zmenila. Načítaj ju znova.', 409)
}

/** Mapovanie na existujúce ID iných systémov (vlákno v Slacku, úloha v Asane), ktoré vzniklo až po udalosti. */
async function loadLinks(s, taskId = null) {
  let q = s.from('hq_links').select('*').eq('workspace_id', WORKSPACE)
  if (taskId) q = q.eq('task_id', taskId)
  const r = await q
  if (r.error) { if (isMissing(r.error)) return []; throw new Error('odkazy: ' + r.error.message) }
  return r.data || []
}
function withLinks(tasks, links) {
  for (const t of tasks) for (const l of links) {
    if (l.task_id !== t.taskId || t.refs.some((r) => r.kind === l.kind && r.id === l.external_id)) continue
    t.refs.push({ kind: l.kind, id: l.external_id, ...(l.url ? { url: l.url } : {}) })
  }
  return tasks
}
export async function linkTask(s, { taskId, caseId = null, kind, externalId, url = null, now = new Date().toISOString() }) {
  const r = await s.from('hq_links').insert({ workspace_id: WORKSPACE, task_id: taskId, case_id: caseId, kind, external_id: String(externalId), url, created_at: now })
  if (r.error && r.error.code !== '23505') throw new Error('odkaz: ' + r.error.message)
  return { ok: true, duplicate: !!r.error }
}
export async function listTasks(s) { return withLinks(projectTasks(await loadEvents(s)), await loadLinks(s)) }
export async function getTask(s, taskId) { return withLinks(projectTasks(await loadEvents(s, { taskId })), await loadLinks(s, taskId))[0] || null }

export async function listActors(s) {
  const r = await s.from('hq_actors').select('*')
  if (r.error && !isMissing(r.error)) throw new Error('vykonávatelia: ' + r.error.message)
  return mergeActors(r.data || [])
}
export async function listSources(s, opts) {
  const r = await s.from('hq_sources').select('*')
  if (r.error && !isMissing(r.error)) throw new Error('zdroje: ' + r.error.message)
  return mergeSources(r.data || [], opts)
}
export async function listQuarantine(s, limit = 20) {
  const r = await s.from('hq_quarantine').select('*').eq('workspace_id', WORKSPACE).order('received_at', { ascending: false }).limit(limit)
  if (r.error && !isMissing(r.error)) throw new Error('karanténa: ' + r.error.message)
  return r.data || []
}

/** Zdravie zdroja: úspech alebo chyba s časom. Stav „live“ sa nastavuje len po skutočnom úspešnom prenose. */
export async function markSource(s, key, { ok, error = null, status = null, account, scope, note, coveredFrom, coveredTo, now = new Date().toISOString() } = {}) {
  const ex = await s.from('hq_sources').select('*').eq('key', key).maybeSingle()
  if (ex.error) { if (isMissing(ex.error)) return { ok: false, missing: true }; throw new Error('zdroj: ' + ex.error.message) }
  const row = { key, updated_at: now }
  if (ok === true) { row.last_ok_at = now; row.status = status || 'live'; if (!((ex.data || {}).covered_from) && !coveredFrom) row.covered_from = now; row.covered_to = coveredTo || now }
  if (ok === false) { row.last_error = String(error || 'chyba').slice(0, 300); row.last_error_at = now }
  if (ok == null && status) row.status = status
  if (account !== undefined) row.account = account
  if (scope !== undefined) row.scope = scope
  if (note !== undefined) row.note = note
  if (coveredFrom) row.covered_from = coveredFrom
  const w = ex.data ? await s.from('hq_sources').update(row).eq('key', key) : await s.from('hq_sources').insert(row)
  if (w.error) throw new Error('zdroj: ' + w.error.message)
  return { ok: true }
}
