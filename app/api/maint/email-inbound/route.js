import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { svixVerify } from '@/lib/maint'
import { ingestInboundEmail } from '@/lib/maint-server'
import { sendMail } from '@/lib/maint-mail'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Resend webhook (email.received): podpis Svix sa overí, udalosť sa uloží idempotentne (source+external_id), ponuka z e-mailu je len návrh. */
export async function POST(request) {
  const raw = await request.text()
  const h = request.headers
  const ok = await svixVerify({ secret: process.env.RESEND_WEBHOOK_SECRET, id: h.get('svix-id'), timestamp: h.get('svix-timestamp'), signature: h.get('svix-signature'), body: raw })
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let ev = {}; try { ev = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const admin = await adminClientAsync()
  const externalId = h.get('svix-id') || (ev.data && ev.data.email_id) || String(Date.now())
  const { error } = await admin.from('maint_inbound_events').insert({ source: 'resend', external_id: externalId, signature_ok: true, payload: { type: ev.type, email_id: ev.data && ev.data.email_id, subject: ev.data && ev.data.subject }, status: 'received' })
  if (error) return NextResponse.json({ ok: true, duplicate: true })
  let result = { ok: true, ignored: true }
  if (ev.type === 'email.received' && ev.data) {
    let d = ev.data
    // Resend posiela vo webhooku len metadáta: telo a prílohy sa dočítajú cez Receiving API (kľúč musí mať právo na prijímanie, nie len „sending“)
    if (!d.text && !d.html && d.email_id && process.env.RESEND_API_KEY) {
      try { const r = await fetch(`https://api.resend.com/emails/receiving/${d.email_id}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (r.ok) d = { ...d, ...j }; else console.error('[maint] receiving api', r.status, String(j.message || '').slice(0, 100)) } catch (e) { console.error('[maint] receiving api', String(e && e.message).slice(0, 80)) }
    }
    const from = Array.isArray(d.from) ? d.from.join(',') : String(d.from || '')
    result = await ingestInboundEmail(admin, { from, subject: d.subject || '', text: d.text || '', html: d.html || '', attachments: (d.attachments || []).map((a) => ({ name: a.filename || a.name, url: a.url || null, content_type: a.content_type })) })
    // e-mail bez značky dopytu (napr. odpoveď majiteľa alebo cudzí e-mail): prepošle sa službe, nič sa nestratí
    if (!result.ok && /bez značky|neznámy/.test(result.error || '')) {
      const duty = process.env.MAINT_DUTY_EMAIL || 'management@live-in.international'
      const body = `Od: ${from}\nPredmet: ${d.subject || ''}\n\n${(d.text || '').slice(0, 20000) || '(bez textu' + (d.html ? ', len HTML' : '') + ')'}`
      await sendMail({ to: duty, subject: `[Údržba – prijaté] ${d.subject || '(bez predmetu)'}`, text: body, html: `<pre style="white-space:pre-wrap;font-family:inherit">${body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`, tag: 'maint-forward', replyTo: from.replace(/^.*<([^>]+)>.*$/, '$1') || undefined }).catch(() => {})
      result = { ok: true, forwarded: true, note: result.error }
    }
  } else if (/^email\.(delivered|bounced|complained)$/.test(ev.type || '') && ev.data && ev.data.email_id) {
    // stav doručenia e-mailu so súhlasom je oddelený od stavu prípadu
    const st = ev.type === 'email.delivered' ? 'delivered' : 'bounced'
    const { data: a } = await admin.from('maint_approvals').select('id,case_id,status').eq('email_id', ev.data.email_id).maybeSingle()
    if (a && a.status === 'sent') {
      await admin.from('maint_approvals').update({ status: st, delivered_at: st === 'delivered' ? new Date().toISOString() : null }).eq('id', a.id).eq('status', 'sent')
      await admin.from('maint_events').insert({ case_id: a.case_id, type: st === 'delivered' ? 'email_delivered' : 'email_bounced', payload: { approval_id: a.id }, actor: 'resend', dedupe_key: `mail:${externalId}` })
      if (st === 'bounced') { const { data: c } = await admin.from('maint_cases').select('id,ref,listing_id').eq('id', a.case_id).maybeSingle(); if (c) await admin.from('notifications').insert({ user_email: process.env.MAINT_DUTY_EMAIL || 'management@live-in.international', kind: 'maint', title: `E-mail majiteľovi sa nedoručil: ${c.ref}`, body: 'Súhlas treba získať inak (telefón, iný kontakt).', url: `/udrzba/${c.id}` }) }
    }
    result = { ok: true, delivery: st }
  }
  await admin.from('maint_inbound_events').update({ status: result.ok ? 'processed' : 'rejected', error: result.error || null, processed_at: new Date().toISOString() }).eq('source', 'resend').eq('external_id', externalId)
  return NextResponse.json(result)
}
