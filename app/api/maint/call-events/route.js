import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { recordCallEvent } from '@/lib/maint-server'
export const dynamic = 'force-dynamic'

const EVENTS = ['ai_started', 'answer', 'transfer_requested', 'transfer_connected', 'transfer_failed', 'case_created', 'resolved_confirmed', 'ended_unresolved', 'tech_error']
/** Udalosti recepčnej AI (hlasový proces mimo Vercelu). Bearer MAINT_EVENTS_SECRET. Jeden call_id na hovor; bez PII (caller_hash namiesto čísla). */
export async function POST(request) {
  const secret = process.env.MAINT_EVENTS_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body = {}; try { body = await request.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const list = Array.isArray(body.events) ? body.events : [body]
  if (list.length > 100) return NextResponse.json({ error: 'max 100 events' }, { status: 400 })
  const admin = await adminClientAsync()
  const out = []
  for (const ev of list) {
    if (!EVENTS.includes(ev.event)) { out.push({ ok: false, error: 'unknown event' }); continue }
    out.push(await recordCallEvent(admin, { call_id: ev.call_id, event: ev.event, ts: ev.ts, seq: ev.seq, direction: ev.direction, agent_version: String(ev.agent_version || '').slice(0, 40), lang: String(ev.lang || '').slice(0, 8), topic: String(ev.topic || '').slice(0, 60), caller_hash: String(ev.caller_hash || '').slice(0, 64) || null, payload: ev.payload && typeof ev.payload === 'object' ? ev.payload : {}, dedupe_key: ev.dedupe_key }))
  }
  return NextResponse.json({ ok: true, results: out })
}
