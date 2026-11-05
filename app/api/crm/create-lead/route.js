import { NextResponse } from 'next/server'
import { createLead } from '@/lib/crm-server'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Webhook pre Zapier (nový lead z Facebooku, webu…). Tajný kľúč CRM_WEBHOOK_SECRET v hlavičke
 * `x-crm-secret` alebo v `?k=`. Telo: { name, phone, email, city, source, asana_task_gid, created_at, note }.
 * Idempotentné: rovnaký lead (Asana gid / e-mail / telefón) sa neduplikuje.
 */
export async function POST(request) {
  const secrets = [process.env.CRM_WEBHOOK_SECRET, process.env.ZAPIER_INBOUND_SECRET].filter(Boolean)
  const given = request.headers.get('x-crm-secret') || new URL(request.url).searchParams.get('k') || ''
  if (!secrets.length || !secrets.includes(given)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body = {}
  try { body = await request.json() } catch { try { const f = await request.formData(); body = Object.fromEntries(f.entries()) } catch { body = {} } }
  try {
    const r = await createLead({ name: body.name || body.meno || [body.first_name, body.last_name].filter(Boolean).join(' '), phone: body.phone || body.telefon, email: body.email, city: body.city || body.mesto || body.lokalita, source: body.source || body.zdroj, asana_task_gid: body.asana_task_gid || body.asana_gid, created_at: body.created_at, note: body.note || body.sprava || body.message, hubspot_contact_id: body.hubspot_contact_id }, { via: body.hubspot_contact_id ? 'hubspot' : 'zapier' })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e) {
    console.error('[crm] create-lead', e && e.message)
    return NextResponse.json({ ok: false, error: 'Lead sa nepodarilo spracovať. Skúste znova.' }, { status: 503 })
  }
}
