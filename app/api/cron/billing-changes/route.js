import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { ghClient, tickChanges } from '@/lib/code-change'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Každých 5 minút: spracuje čakajúce návrhy zmien kódu z chatu, obnoví stav kontrol a zruší zaseknuté. Bez GH_CHANGES_TOKEN nerobí nič. */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!process.env.GH_CHANGES_TOKEN || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: true, disabled: true })
  try {
    const r = await tickChanges(await adminClientAsync(), { gh: ghClient({ token: process.env.GH_CHANGES_TOKEN, repo: process.env.GH_CHANGES_REPO || undefined }), key: process.env.ANTHROPIC_API_KEY })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (/relation .* does not exist|schema cache/i.test(String(e && e.message))) return NextResponse.json({ ok: true, ran: false, reason: 'Migrácia zmien ešte nie je aplikovaná.' })
    console.error('[zmeny] cron', String(e && e.message).slice(0, 160)); return NextResponse.json({ ok: false, error: 'Beh zlyhal.' }, { status: 500 })
  }
}
