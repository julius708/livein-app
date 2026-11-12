// Ústredňa – konektory Slack #ai-tim a Asana. Čisté funkcie (text správy, klasifikácia prichádzajúcej udalosti, podpis) sú testované;
// sieťové volania sa vykonajú len s nastaveným tokenom (SLACK_BOT_TOKEN, ASANA_TOKEN), inak vrátia { skipped: 'not_configured' }.
// Autor správy v Slacku nie je overená identita AI: pod jedným ľudským účtom dnes píšu viacerí agenti. Správa je tvrdenie, nie dôkaz.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { OP_LABEL, statusOf } from './hq-labels.js'

export const SLACK_CHANNEL = process.env.HQ_SLACK_CHANNEL || 'C0C9HG8B42C'
export const ASANA_WORKSPACE = '1161596604355697'
const OP_BY_STATUS = { prepared: 'assign', accepted: 'accept', working: 'step', blocked: 'block', result_ready: 'result', verified: 'verify', applied: 'apply' }

/** Značka, podľa ktorej sa správa páruje s udalosťou registra a podľa ktorej ju prijímač ignoruje (ochrana pred slučkou). */
export const marker = (taskId, sequence) => `hq:${taskId}#${sequence}`
export const MARKER_RE = /\bhq:([A-Za-z0-9_.:-]{3,120})#(\d{1,6})\b/

/** Text hlásenia udalosti do vlákna prípadu. Skúšobné úlohy sú zreteľne označené. */
export function slackText(event, { actorName = '', title = '', test = false } = {}) {
  const op = OP_LABEL[OP_BY_STATUS[event.status]] || statusOf(event.status).label
  const lines = [
    `${test ? '[SKÚŠKA ÚSTREDNE, nereagovať] ' : ''}*${op}* · ${actorName || event.actorId}${title && event.sequence > 1 ? ` · ${title}` : ''}`,
    event.summary,
    `Ďalší krok: ${event.nextAction}`,
  ]
  for (const e of event.evidence || []) lines.push(`Verzia ${e.version}: ${e.uri} (sha256 ${e.digest.slice(0, 12)}…)`)
  lines.push('`' + marker(event.taskId, event.sequence) + '`')
  return lines.join('\n')
}

/** Overenie podpisu Slack Events API (v0, HMAC-SHA256 nad `v0:timestamp:telo`), tolerancia 5 minút. */
export function verifySlackSignature({ secret, timestamp, signature, body, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false
  const mine = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')
  const a = Buffer.from(mine), b = Buffer.from(String(signature))
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Čo s prichádzajúcou udalosťou Slacku. Nič sa nespúšťa automaticky: správa je najviac „kandidát“ pre človeka.
 * Ignorujú sa správy botov, úpravy, iné kanály a všetko s našou značkou (to sú vlastné hlásenia ústredne).
 */
export function classifySlackEvent(payload, { channel = SLACK_CHANNEL } = {}) {
  if (!payload || typeof payload !== 'object') return { action: 'ignore', reason: 'bad_payload' }
  if (payload.type === 'url_verification') return { action: 'challenge', challenge: String(payload.challenge || '') }
  const e = payload.event
  if (payload.type !== 'event_callback' || !e || e.type !== 'message') return { action: 'ignore', reason: 'not_message' }
  if (e.channel !== channel) return { action: 'ignore', reason: 'other_channel' }
  if (e.subtype || e.bot_id) return { action: 'ignore', reason: 'bot_or_edit' }
  if (MARKER_RE.test(String(e.text || ''))) return { action: 'ignore', reason: 'own_marker' }
  if (!e.ts) return { action: 'ignore', reason: 'no_ts' }
  return { action: 'candidate', key: `${e.channel}/${e.ts}`, threadKey: e.thread_ts ? `${e.channel}/${e.thread_ts}` : null, claimedAuthor: e.user || null, eventId: payload.event_id || null }
}
export const slackPermalink = (channel, ts, domain = 'live-ininternational') => `https://${domain}.slack.com/archives/${channel}/p${String(ts).replace('.', '')}`
export const slackRef = (channel, ts) => ({ kind: 'slack', id: `${channel}/${ts}`, url: slackPermalink(channel, ts) })

export const slackConfigured = () => !!process.env.SLACK_BOT_TOKEN
export async function postSlack(text, { threadTs = null, channel = SLACK_CHANNEL, fetchImpl = fetch } = {}) {
  if (!slackConfigured()) return { skipped: 'not_configured' }
  const r = await fetchImpl('https://slack.com/api/chat.postMessage', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}), unfurl_links: false }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) return { ok: false, error: String(j.error || r.status) }
  return { ok: true, channel: j.channel, ts: j.ts, ref: slackRef(j.channel, j.ts) }
}

/* ---------------- Asana ---------------- */

/** Úloha v Asane pre človeka. Značka v názve drží spoločné ID; existujúce úlohy Asany sa neprepisujú. */
export function asanaTaskPayload(task, { projectGid, hqUrl = '' } = {}) {
  const tag = `[HQ ${task.taskId}]`
  return {
    name: `${tag} ${task.title}`.slice(0, 250),
    notes: [`Úloha z LIVE-IN ústredne.`, `Stav: ${statusOf(task.status).label}`, `Ďalší krok: ${task.nextAction}`, hqUrl ? `Detail: ${hqUrl}` : '', `Prípad: ${task.caseId}`].filter(Boolean).join('\n'),
    ...(projectGid ? { projects: [String(projectGid)] } : { workspace: ASANA_WORKSPACE }),
  }
}
export const asanaRef = (gid) => ({ kind: 'asana', id: String(gid), url: `https://app.asana.com/0/0/${gid}` })
/** Potvrdenie zapracovania z odpovede Asany: len keď služba sama vrátila gid úlohy. */
export function asanaReceipt(json, verifiedEventId) {
  const gid = json && json.data && json.data.gid
  if (!gid) return null
  return { id: `asana:${gid}:${json.data.modified_at || json.data.created_at || ''}`, target: 'asana', verifiedEventId }
}
export const asanaConfigured = () => !!process.env.ASANA_TOKEN
export async function createAsanaTask(payload, { fetchImpl = fetch } = {}) {
  if (!asanaConfigured()) return { skipped: 'not_configured' }
  const r = await fetchImpl('https://app.asana.com/api/1.0/tasks', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: payload }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.data) return { ok: false, error: String((j.errors && j.errors[0] && j.errors[0].message) || r.status) }
  return { ok: true, gid: j.data.gid, ref: asanaRef(j.data.gid), json: j }
}
