import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
export const runtime = 'nodejs'

/**
 * Udalosti inteligentného zámku (odtlačok prsta) z miestnosti s kľúčmi.
 * POST s hlavičkou Authorization: Bearer <KEYS_LOCK_SECRET> a telom { provider, external_id, person_ref, person_name, event, happened_at }.
 * Zatiaľ sa len ukladá; párovanie s pohybmi na kiosku doplníme, keď bude známy výrobca zámku. Bez nastaveného KEYS_LOCK_SECRET vracia 503.
 */
export async function POST(req) {
  const secret = process.env.KEYS_LOCK_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'lock events not configured' }, { status: 503 })
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 })
  let body = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const row = {
    provider: String(body.provider || 'unknown').slice(0, 40),
    external_id: body.external_id ? String(body.external_id).slice(0, 120) : null,
    person_ref: body.person_ref ? String(body.person_ref).slice(0, 120) : null,
    person_name: body.person_name ? String(body.person_name).slice(0, 80) : null,
    event: String(body.event || 'unlock').slice(0, 40),
    happened_at: body.happened_at && Number.isFinite(Date.parse(body.happened_at)) ? new Date(body.happened_at).toISOString() : new Date().toISOString(),
    raw: typeof body === 'object' ? body : {},
  }
  try {
    const a = await adminClientAsync()
    const { error } = await a.from('key_lock_events').upsert(row, { onConflict: 'provider,external_id', ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
