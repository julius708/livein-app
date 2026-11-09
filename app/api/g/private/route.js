import { NextResponse } from 'next/server'
import { privateByToken } from '@/lib/guide/server'
import { isCode } from '@/lib/guide/core'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' }

/** GET ?code= → súkromný obsah, ak má hosť platnú cookie z prihlásenia (po znovunačítaní stránky). */
export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code') || ''
  if (!isCode(code)) return NextResponse.json({ ok: false }, { status: 400, headers: H })
  const token = request.cookies.get(`gd_${code}`)?.value
  if (!token) return NextResponse.json({ ok: false }, { headers: H })
  try { return NextResponse.json(await privateByToken({ code, token }), { headers: H }) } catch { return NextResponse.json({ ok: false }, { headers: H }) }
}
