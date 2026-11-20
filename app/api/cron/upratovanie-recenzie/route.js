import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { gget } from '@/lib/guesty'
import { rpc, isMissingTable } from '@/lib/cl-server'
import { fetchRecentReviews, mapGuestyReview } from '@/lib/cl-reviews-import'
import { addDays, todayBa } from '@/lib/cl-core'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Denne: stiahne nové recenzie hostí z Guesty a zapíše ich do kvality upratovania (spárujú sa s rezerváciou a upratovaním pred príchodom).
 * ?days=N (predvolene 45) určí, ako ďaleko späť sa pozerá, ?dry=1 nič nezapíše a vráti počty a názvy polí z Guesty (bez textov recenzií).
 */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const days = Math.min(400, Math.max(1, Number(u.searchParams.get('days')) || 45))
  try {
    const sinceIso = addDays(todayBa(), -days) + 'T00:00:00'
    let raw
    try { raw = await fetchRecentReviews(gget, { sinceIso }) } catch (e) { return NextResponse.json({ ok: false, error: 'Guesty recenzie sa nepodarilo načítať.', detail: String(e && e.message).slice(0, 60) }, { status: 502 }) }
    const items = raw.map(mapGuestyReview).filter(Boolean)
    if (u.searchParams.get('dry') === '1') {
      const keys = [...new Set(raw.slice(0, 20).flatMap((r) => Object.keys(r || {})))].sort()
      return NextResponse.json({ ok: true, dry: true, fetched: raw.length, mapped: items.length, skipped: raw.length - items.length, fields: keys })
    }
    if (!items.length) return NextResponse.json({ ok: true, fetched: raw.length, imported: 0 })
    const s = await adminClientAsync()
    const r = await rpc(s, 'cl_import_reviews', { p_items: items })
    if (r.demo) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'Import zlyhal.' }, { status: 500 })
    return NextResponse.json({ ok: true, fetched: raw.length, inserted: r.inserted, updated: r.updated, skipped: r.skipped })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    console.error('[upratovanie] recenzie', String(e && e.message).slice(0, 160))
    return NextResponse.json({ ok: false, error: 'Beh zlyhal.' }, { status: 500 })
  }
}
