// Ústredňa – serverové lepidlo: kto volá (identita), ktoré úložisko sa použije a hlásenie udalostí do Slacku.
// Identita a workspace sa určujú prihlásením (Supabase session) alebo Bearer tokenom agenta, nikdy telom požiadavky.
import { getViewer } from './auth.js'
import { adminClientAsync, adminReady } from './supabase-admin.js'
import { actorFromViewer, actorFromToken, parseTokens, mergeActors, ACTORS } from './hq-core.js'
import { localStore } from './hq-local.js'
import { appendOp, getTask, markSource, linkTask } from './hq-store.js'
import { slackText, postSlack, slackConfigured } from './hq-connectors.js'

/** Lokálny register v súbore: len mimo produkcie a len keď je výslovne zapnutý. */
export const localMode = () => process.env.NODE_ENV !== 'production' && !!process.env.HQ_LOCAL_STORE
let local = null
const localClient = () => (local = local || localStore(process.env.HQ_LOCAL_STORE))

/** Klient registra pre prihláseného člena tímu (RLS) alebo lokálny súbor. */
export const storeForViewer = (v) => (localMode() ? localClient() : v.s)
/** Klient registra pre agenta s tokenom (servisný účet) alebo lokálny súbor. */
export async function storeForAgent() {
  if (localMode()) return localClient()
  if (!adminReady()) return null
  return adminClientAsync()
}
export const agentTokens = () => parseTokens(process.env.HQ_AGENT_TOKENS)

/**
 * Kto volá API: najprv Bearer token agenta, inak prihlásený admin. Vracia { actor, s } alebo { error, status }.
 * Telo požiadavky sa na určenie identity nikdy nepoužíva.
 */
export async function resolveCaller(request) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(request.headers.get('authorization') || '')
  const tokens = agentTokens()
  if (m && tokens) {
    const s = await storeForAgent()
    if (!s) return { error: 'Register nie je dostupný (chýba servisný účet).', status: 503 }
    // Register vykonávateľov (hq_actors) je autoritatívny aj pre zabudovaných agentov: deaktivácia alebo zúženie práv platí hneď (nález Codexu F2).
    // Keď sa register nedá prečítať, prístup sa odmietne; zabudované práva sa použijú len vtedy, keď tabuľka ešte neexistuje.
    const r = await s.from('hq_actors').select('*')
    if (r && r.error && !/relation .* does not exist|schema cache|could not find the table/i.test(r.error.message || '')) return { error: 'Register vykonávateľov nie je dostupný.', status: 503 }
    const actor = actorFromToken(m[1], tokens, mergeActors((r && r.data) || [], ACTORS))
    if (actor) return { actor, s }
    return { error: 'unauthorized', status: 401 }
  }
  if (m && !tokens && !/^ey/.test(m[1])) return { error: 'Tokeny agentov nie sú nastavené (HQ_AGENT_TOKENS).', status: 503 }
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'unauthorized', status: 401 }
  const actor = actorFromViewer(v)
  if (!actor) return { error: 'Ústredňa je zatiaľ len pre vedenie (adminov).', status: 403 }
  return { actor, s: storeForViewer(v), viewer: v }
}

/**
 * Operácia + hlásenie do Slacku (ak je bot nastavený). Hlásenie nikdy nezmení výsledok operácie; jeho úspech a chyba sa zapíšu k zdroju „slack“.
 * Opakované doručenie (duplicate) sa do Slacku znova neposiela.
 */
export async function runOp(s, op, params, { actor, actors = ACTORS } = {}) {
  const r = await appendOp(s, op, params, { actor })
  await markSource(s, 'register', { ok: true }).catch(() => {})
  if (actor.kind === 'agent') await markSource(s, 'runtime-' + actor.id.replace(/^agent:/, ''), { ok: true, account: actor.id }).catch(() => {})
  if (r.duplicate || !slackConfigured()) return r
  try {
    const task = await getTask(s, r.taskId)
    const thread = (task.refs || []).find((x) => x.kind === 'slack')
    const who = actors.find((a) => a.id === actor.id)
    const out = await postSlack(slackText(r.event, { actorName: (who && who.name) || actor.name, title: task.title, test: /^test[-_]/i.test(task.caseId) }), { threadTs: thread ? thread.id.split('/')[1] : null })
    if (out.ok) { await markSource(s, 'slack', { ok: true }); if (!thread) await linkTask(s, { taskId: r.taskId, caseId: task.caseId, kind: 'slack', externalId: out.ref.id, url: out.ref.url }) }
    else if (out.error) await markSource(s, 'slack', { ok: false, error: out.error })
  } catch (e) { console.error('[hq] slack', String(e && e.message).slice(0, 120)) }
  return r
}
