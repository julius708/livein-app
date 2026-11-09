import { NextResponse } from 'next/server'
import { unlockRequest } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' }
const cookieName = (code) => `gd_${code}`

/** POST {code, name, email} → prihlásenie hosťa: súkromný obsah bytu + HttpOnly cookie do konca pobytu. {code, logout:true} cookie zruší. */
export async function POST(request) {
  let b = {}; try { b = await request.json() } catch { return NextResponse.json({ ok: false }, { status: 400, headers: H }) }
  const code = String(b.code || '')
  if (!isCode(code)) return NextResponse.json({ ok: false }, { status: 400, headers: H })
  if (b.logout) { const res = NextResponse.json({ ok: true }, { headers: H }); res.cookies.set(cookieName(code), '', { httpOnly: true, secure: true, sameSite: 'lax', path: `/`, maxAge: 0 }); return res }
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  try {
    const r = await unlockRequest({ code, email: String(b.email || '').slice(0, 200), name: String(b.name || '').slice(0, 120), ip })
    if (!r.ok) return NextResponse.json({ ok: false }, { headers: H })
    const { token, exp, ...rest } = r
    const res = NextResponse.json({ ok: true, ...rest }, { headers: H })
    res.cookies.set(cookieName(code), token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.max(3600, Math.floor((exp - Date.now()) / 1000)) })
    return res
  } catch (e) { console.error('[guide] unlock', String(e && e.message).slice(0, 80)); return NextResponse.json({ ok: false }, { headers: H }) }
}
export async function GET() { return NextResponse.json({ ok: false }, { status: 405, headers: { 'Cache-Control': 'no-store' } }) }
