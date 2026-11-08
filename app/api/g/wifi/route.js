import { NextResponse } from 'next/server'
import { wifiRequest } from '@/lib/guide/server'
export const dynamic = 'force-dynamic'

/** POST: meno + e-mail → spárovanie s aktívnou rezerváciou jednotky v Guesty na serveri. Odpoveď nikdy nie je cacheovaná, heslo nie je v URL. */
export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' }
  let b = {}; try { b = await request.json() } catch { return NextResponse.json({ ok: false }, { status: 400, headers }) }
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  try {
    const r = await wifiRequest({ code: String(b.code || ''), email: String(b.email || '').slice(0, 200), name: String(b.name || '').slice(0, 120), ip })
    return NextResponse.json(r.ok ? r : { ok: false }, { headers })
  } catch (e) {
    console.error('[guide] wifi', String(e && e.message).slice(0, 80))
    return NextResponse.json({ ok: false }, { headers })
  }
}
export async function GET() { return NextResponse.json({ ok: false }, { status: 405, headers: { 'Cache-Control': 'no-store' } }) }
