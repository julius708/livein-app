import { NextResponse } from 'next/server'
import { gget, activeReservations, reservationByCode } from '@/lib/guesty'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Len na čítanie, len tieto cesty: overenie nových rezervačných endpointov Guesty (migrácia do 1. 3. 2027) bez toho, aby token opustil server.
const ALLOW = ['/v1/reservations-v3', '/v1/guests', '/v1/listings', '/v1/webhooks', '/v1/webhooks-v2', '/v1/guests-crm']

/** GET /api/cron/guesty-probe?k=CRON_SECRET&path=/v1/reservations-v3/search&q={"limit":2} – diagnostika Guesty API (výstup orezaný, bez tokenu). */
export async function GET(req) {
  const u = new URL(req.url)
  const ok = process.env.CRON_SECRET && (req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 })
  const fn = u.searchParams.get('fn')
  if (fn) {
    // Skutočné funkcie appky (ako ich volá Sprievodca); e-maily hostí sa maskujú.
    const t0 = Date.now(), mask = (e) => (e ? String(e).replace(/^(.).*(@.*)$/, '$1***$2') : e)
    try {
      const out = fn === 'active' ? await activeReservations(u.searchParams.get('listingId'), u.searchParams.get('today') || new Date().toISOString().slice(0, 10)) : fn === 'code' ? await reservationByCode(u.searchParams.get('code')) : null
      const rows = (Array.isArray(out) ? out : out ? [out] : []).map((r) => ({ ...r, guestEmail: mask(r.guestEmail), guestEmails: (r.guestEmails || []).map(mask), guestName: r.guestName ? r.guestName.slice(0, 1) + '***' : r.guestName }))
      return NextResponse.json({ ok: true, ms: Date.now() - t0, fn, rows })
    } catch (e) { return NextResponse.json({ ok: false, ms: Date.now() - t0, fn, error: String(e && e.message || e) }, { status: 502 }) }
  }
  const path = String(u.searchParams.get('path') || '')
  if (!ALLOW.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))) return NextResponse.json({ ok: false, error: 'path not allowed' }, { status: 400 })
  let params = {}
  try { params = JSON.parse(u.searchParams.get('q') || '{}') } catch { return NextResponse.json({ ok: false, error: 'bad q' }, { status: 400 }) }
  const t0 = Date.now()
  try {
    const j = await gget(path, params)
    const text = JSON.stringify(j)
    return NextResponse.json(text.length > 60000 ? { ok: true, ms: Date.now() - t0, bytes: text.length, truncated: true, head: text.slice(0, 60000) } : { ok: true, ms: Date.now() - t0, bytes: text.length, data: j })
  } catch (e) { return NextResponse.json({ ok: false, ms: Date.now() - t0, error: String(e && e.message || e) }, { status: 502 }) }
}
