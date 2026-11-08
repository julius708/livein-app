// Telefónny poskytovateľ pre odchádzajúce hovory majiteľom (rozhranie + adaptéry).
// 'test': nikdy nevolá, zapíše výsledok ako simulovaný. '3cx': 3CX + OpenAI Realtime (čaká na potvrdenie dodávateľa na testovacej klapke).
// 'twilio': samostatný overený poskytovateľ (REST), hovor vedie hlasový server mimo Vercelu (voice/ v repozitári).
import { normPhone } from './maint'

export const providerName = (cfg) => process.env.MAINT_TELEPHONY_PROVIDER || (cfg && cfg.provider) || 'test'

const PROVIDERS = {
  test: {
    ready: () => true,
    async placeCall({ to, call }) { return { ok: true, providerCallId: 'test-' + call.id, status: 'completed', note: 'Testovací režim: hovor sa nevytočil, výsledok simulovaný.' } },
    parseWebhook: async () => ({ ok: false, error: 'test provider nemá webhook' }),
  },
  '3cx': {
    ready: () => !!(process.env.THREECX_API_URL && process.env.THREECX_API_KEY && process.env.THREECX_TEST_EXT),
    async placeCall({ to, call, context }) {
      if (!PROVIDERS['3cx'].ready()) return { ok: false, error: '3CX nie je nakonfigurované (THREECX_API_URL, THREECX_API_KEY, THREECX_TEST_EXT).' }
      // Odchádzajúci hovor cez 3CX Call Control API: cieľ, klapka agenta (OpenAI Realtime most), kontext prípadu. Presný tvar endpointu potvrdí dodávateľ 3CX.
      const r = await fetch(`${process.env.THREECX_API_URL.replace(/\/$/, '')}/callcontrol/${process.env.THREECX_TEST_EXT}/makecall`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.THREECX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ destination: to, attached_data: { case_ref: context.ref, call_id: call.id } }), signal: AbortSignal.timeout(15000) })
      if (!r.ok) return { ok: false, error: `3CX ${r.status}` }
      const j = await r.json().catch(() => ({}))
      return { ok: true, providerCallId: String(j.callid || j.id || call.id), status: 'dialing' }
    },
    async parseWebhook(req, raw) {
      const secret = process.env.THREECX_WEBHOOK_SECRET
      if (!secret || req.headers.get('x-webhook-secret') !== secret) return { ok: false, error: 'bad signature' }
      let j = {}; try { j = JSON.parse(raw) } catch {}
      const map = { Ringing: 'dialing', Talking: 'answered', Ended: 'completed', Failed: 'failed', Busy: 'busy', NoAnswer: 'no_answer' }
      return { ok: true, externalId: String(j.event_id || `${j.callid}-${j.status}`), providerCallId: String(j.callid || ''), status: map[j.status] || 'unknown', payload: j }
    },
  },
  twilio: {
    ready: () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.MAINT_VOICE_URL),
    async placeCall({ to, call, context }) {
      if (!PROVIDERS.twilio.ready()) return { ok: false, error: 'Twilio nie je nakonfigurované (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, MAINT_VOICE_URL).' }
      const sid = process.env.TWILIO_ACCOUNT_SID
      const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Url: `${process.env.MAINT_VOICE_URL.replace(/\/$/, '')}/twiml?call=${call.id}&ref=${encodeURIComponent(context.ref)}`, StatusCallback: `${context.appUrl}/api/maint/call-webhook?provider=twilio`, StatusCallbackEvent: 'initiated ringing answered completed', MachineDetection: 'Enable' })
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return { ok: false, error: `Twilio ${r.status}: ${String(j.message || '').slice(0, 120)}` }
      return { ok: true, providerCallId: j.sid, status: 'dialing' }
    },
    async parseWebhook(req, raw) {
      // X-Twilio-Signature = base64(HMAC-SHA1(authToken, url + zoradené parametre))
      const token = process.env.TWILIO_AUTH_TOKEN
      const params = new URLSearchParams(raw)
      const url = process.env.MAINT_PUBLIC_WEBHOOK_URL || req.url
      const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + v).join('')
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token || ''), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
      const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(url + sorted)))))
      if (!token || sig !== req.headers.get('x-twilio-signature')) return { ok: false, error: 'bad signature' }
      const map = { initiated: 'dialing', ringing: 'dialing', 'in-progress': 'answered', completed: 'completed', busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'cancelled' }
      const st = params.get('CallStatus') || ''
      const answeredBy = params.get('AnsweredBy') || ''
      return { ok: true, externalId: `${params.get('CallSid')}-${st}-${params.get('SequenceNumber') || ''}`, providerCallId: params.get('CallSid'), status: answeredBy.startsWith('machine') ? 'voicemail' : map[st] || 'unknown', payload: Object.fromEntries(params) }
    },
  },
}
export const providerFor = (name) => PROVIDERS[name] || PROVIDERS.test
export const providerReady = (name) => providerFor(name).ready()
export { normPhone }
