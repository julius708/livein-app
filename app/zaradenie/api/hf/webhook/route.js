import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Higgsfield zavolá túto adresu po dokončení generovania. Chránené kľúčom HF_WEBHOOK_KEY; zapisuje len k riadku s daným request_id. */
export async function POST(req) {
  const key = process.env.HF_WEBHOOK_KEY
  const u = new URL(req.url)
  if (!key || u.searchParams.get('k') !== key) return NextResponse.json({ error: 'nope' }, { status: 404 })
  const j = await req.json().catch(() => null)
  if (!j) return NextResponse.json({ ok: false }, { status: 400 })
  const reqId = j.request_id || j.id || (j.request && j.request.id)
  const status = String(j.status || '').toLowerCase()
  if (!reqId) return NextResponse.json({ ok: false, error: 'request_id?' }, { status: 400 })
  const done = ['completed', 'done', 'succeeded'].includes(status), failed = ['failed', 'error', 'cancelled', 'nsfw'].includes(status)
  if (!done && !failed) return NextResponse.json({ ok: true, ignored: status })
  const url = done ? findUrl(j) : null
  const s = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  const { data, error } = await s.rpc('onb_design_webhook', { p_request_id: String(reqId), p_status: done && url ? 'done' : 'failed', p_result_url: url, p_error: done ? (url ? null : 'hotové bez obrázka') : (j.error || j.message || status) })
  return NextResponse.json({ ok: !error, updated: data, error: error?.message })
}
function findUrl(o) {
  if (!o) return null
  if (typeof o === 'string') return /^https?:\/\//.test(o) && /\.(jpe?g|png|webp)(\?|$)/i.test(o) ? o : null
  if (Array.isArray(o)) { for (const x of o) { const r = findUrl(x); if (r) return r } return null }
  if (typeof o === 'object') for (const v of Object.values(o)) { const r = findUrl(v); if (r) return r }
  return null
}
