import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
export const dynamic = 'force-dynamic'

/** Import prepisu hovoru (až po potvrdení exportu z 3CX). Prepis je tvrdenie volajúceho; párovanie len pri spoľahlivej zhode, inak „na kontrolu“. Nahrávka, prepis a súhrn sú oddelené. */
export async function POST(request) {
  const v = await getViewer()
  if (!v.user || v.blocked || !(v.me.roles || []).some((r) => ['admin', 'operations'].includes(r))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let b = {}; try { b = await request.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (!b.transcript && !b.recording_ref) return NextResponse.json({ error: 'transcript alebo recording_ref je povinné' }, { status: 400 })
  const { data: ret } = await v.s.from('maint_settings').select('value').eq('key', 'retention').maybeSingle()
  const days = Number((ret && ret.value && ret.value.transcripts_days) || 90)
  const retention_until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)
  let matched_case = null, match_status = 'unmatched'
  const ref = /U-\d{2}-\d{4}/.exec(String(b.transcript || '') + ' ' + String(b.case_ref || ''))
  if (ref) { const { data: c } = await v.s.from('maint_cases').select('id').eq('ref', ref[0]).maybeSingle(); if (c) { matched_case = c.id; match_status = b.case_ref ? 'matched' : 'review' } }
  else if (b.transcript) match_status = 'review'
  const { data, error } = await v.s.from('maint_transcripts').insert({ call_id: String(b.call_id || '').slice(0, 120) || null, recording_ref: String(b.recording_ref || '').slice(0, 300) || null, transcript: String(b.transcript || '').slice(0, 50000) || null, summary: String(b.summary || '').slice(0, 5000) || null, access_level: 'restricted', retention_until, match_status, matched_case, matched_reservation: String(b.reservation || '').slice(0, 80) || null, created_by: v.user.email }).select('id,match_status').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (matched_case) await v.s.from('maint_events').insert({ case_id: matched_case, type: 'transcript_linked', payload: { transcript_id: data.id, match_status }, actor: v.user.email })
  return NextResponse.json({ ok: true, ...data })
}
