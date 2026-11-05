import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
export const dynamic = 'force-dynamic'

/** Uloží push odber prihláseného človeka (hlavná appka, CRM). */
export async function POST(request) {
  const { s, user, me, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false }, { status: 403 })
  let b = {}
  try { b = await request.json() } catch {}
  const endpoint = String(b.endpoint || ''), keys = b.keys || {}
  if (!/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) return NextResponse.json({ ok: false, error: 'bad subscription' }, { status: 400 })
  if (b.oldEndpoint) await s.from('push_subscriptions').update({ failed_at: new Date().toISOString() }).eq('endpoint', String(b.oldEndpoint)).eq('user_id', user.id)
  const { data: existing } = await s.from('push_subscriptions').select('id').eq('endpoint', endpoint).eq('user_id', user.id).maybeSingle()
  const row = { user_id: user.id, user_name: me.name || null, user_email: user.email.toLowerCase(), endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: (request.headers.get('user-agent') || '').slice(0, 200), app: 'app', failed_at: null, last_ok_at: null }
  const { error } = existing ? await s.from('push_subscriptions').update(row).eq('id', existing.id) : await s.from('push_subscriptions').insert(row)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
