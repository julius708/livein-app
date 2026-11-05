import { NextResponse } from 'next/server'
import { verifyUnsub } from '@/lib/newsletter-server'
import { adminClientAsync } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
const page = (title, text) => new NextResponse(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="margin:0;background:#F2F3EE;font-family:Helvetica,Arial,sans-serif;color:#233E31"><div style="max-width:520px;margin:60px auto;background:#fff;border-radius:18px;padding:32px;text-align:center"><div style="font-weight:800;color:#173E2C;letter-spacing:.04em;margin-bottom:18px">LIVE-IN</div><h1 style="font-size:24px;margin:0 0 10px;color:#173E2C">${title}</h1><p style="font-size:16px;line-height:1.6;margin:0">${text}</p></div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })

async function handle(req) {
  const u = new URL(req.url)
  const email = verifyUnsub(u.searchParams.get('e'), u.searchParams.get('t'))
  if (!email) return page('Odkaz nie je platný', 'Napíšte nám na info@live-in.international a odhlásime vás ručne.')
  try {
    const a = await adminClientAsync()
    await a.from('newsletter_unsubscribes').upsert({ email, source: 'link' }, { onConflict: 'email' })
    const { data: leads } = await a.from('leads').select('id').ilike('email', email)
    for (const l of leads || []) {
      await a.from('leads').update({ email_optout: true }).eq('id', l.id)
      await a.from('crm_sync_queue').insert({ lead_id: l.id, target: 'hubspot', action: 'unsubscribe', payload: {} })
    }
  } catch { return page('Niečo sa pokazilo', 'Skúste to o chvíľu znova alebo nám napíšte na info@live-in.international.') }
  return page('Odhlásenie prebehlo', 'Z newslettera LIVE-IN vás už nebudeme oslovovať. Ak sa to stalo omylom, napíšte nám na info@live-in.international.')
}
export const GET = handle
export const POST = handle
