import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'

/** Spätné volanie zo Zapier workflow livein-hubspot-proxy: { ref: "leadId:queueId", id, ok, error, created }. */
export async function POST(request) {
  const secret = process.env.CRM_WEBHOOK_SECRET
  if (!secret || request.headers.get('x-crm-secret') !== secret) return NextResponse.json({ ok: false }, { status: 401 })
  let b = {}
  try { b = await request.json() } catch { b = {} }
  const [leadId, queueId] = String(b.ref || '').split(':')
  if (!/^[0-9a-f-]{36}$/.test(leadId || '')) return NextResponse.json({ ok: false, error: 'bad ref' }, { status: 400 })
  try {
    const s = await adminClientAsync()
    const hsId = /^\d+$/.test(String(b.id || '')) ? String(b.id) : null
    if (hsId) await s.from('leads').update({ hubspot_contact_id: hsId }).eq('id', leadId).is('hubspot_contact_id', null)
    if (b.ok === false || b.noteError || b.unsubscribeError) {
      const err = String(b.error || b.noteError || b.unsubscribeError || 'chyba').slice(0, 300)
      if (/^\d+$/.test(queueId || '')) await s.from('crm_sync_queue').update({ last_error: 'Zapier/HubSpot: ' + err }).eq('id', Number(queueId))
      await s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { hubspot: 'failed', error: err }, user_email: null, user_name: 'HubSpot' })
    } else if (b.created) {
      await s.from('lead_events').insert({ lead_id: leadId, type: 'system', payload: { hubspot: 'created', id: hsId }, user_email: null, user_name: 'HubSpot' })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[crm] hubspot-callback', e && e.message)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
