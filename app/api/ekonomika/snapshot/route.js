import { NextResponse } from 'next/server'
import { gunzipSync } from 'node:zlib'
import { getViewer } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Aktuálny ekonomický snímok (Guesty + PriceLabs + banka). Prístup riadi RLS na economics_snapshots – vidí ho len vedenie. */
export async function GET() {
  const { s, user, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false, error: 'auth' }, { status: 403 })
  const { data, error } = await s.from('economics_snapshots').select('payload_gzip_base64,updated_at').eq('id', 'current').maybeSingle()
  if (error) { console.error('[ekonomika] read', error.message); return NextResponse.json({ ok: false, error: 'db' }, { status: 503 }) }
  if (!data) return NextResponse.json({ ok: false, error: 'noaccess' }, { status: 403 })
  let json
  try { json = gunzipSync(Buffer.from(data.payload_gzip_base64, 'base64')).toString('utf8') } catch (e) { console.error('[ekonomika] gunzip', e && e.message); return NextResponse.json({ ok: false, error: 'payload' }, { status: 503 }) }
  return new NextResponse(`{"ok":true,"updatedAt":${JSON.stringify(data.updated_at)},"data":${json}}`, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' } })
}
