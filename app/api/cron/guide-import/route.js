import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { importBatch, recomputeCompleteness } from '@/lib/guide/guesty-import'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Import návrhov kariet z Guesty po dávkach: ?k=CRON_SECRET&limit=3&force=0&ai=1&listing=<id>; ?recompute=1 prepočíta úplnosť. Opakovať, kým remaining > 0. */
export async function GET(request) {
  const url = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || url.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const s = await adminClientAsync()
  try {
    if (url.searchParams.get('recompute') === '1') return NextResponse.json({ ok: true, ...(await recomputeCompleteness(s)) })
    const limit = Math.min(10, Math.max(1, Number(url.searchParams.get('limit') || 3)))
    const r = await importBatch(s, { limit, force: url.searchParams.get('force') === '1', ai: url.searchParams.get('ai') !== '0', only: url.searchParams.get('listing') || null })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) { console.error('[guide] import', e && e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
