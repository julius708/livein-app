// Klient udalostí hovoru → dashboard appky. Jedno call_id na hovor, seq pre dedupe, nikdy telefónne číslo (len caller_hash).
import { createHash } from 'node:crypto'
export const callerHash = (phone, salt = process.env.MAINT_CALLER_SALT || '') => createHash('sha256').update(salt + String(phone || '').replace(/\D/g, '')).digest('hex').slice(0, 32)
export async function sendEvent({ appUrl = process.env.MAINT_APP_URL || 'https://app.live-in.international', secret = process.env.MAINT_EVENTS_SECRET, call_id, event, seq, topic, lang, agent_version, caller_hash, direction = 'inbound', payload = {} }) {
  const r = await fetch(`${appUrl}/api/maint/call-events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify({ call_id, event, seq, ts: new Date().toISOString(), topic, lang, agent_version, caller_hash, direction, payload }), signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`events ${r.status}`)
  return r.json()
}
