import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { runIfDue, runAgent } from '@/lib/inv-agent'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Každých 30 minút. Podľa nastavení (predvolene denne o 07:00 Europe/Bratislava) spustí agenta na vyhľadávanie a aktualizáciu ponúk, alebo opakuje po chybe. `?force=1` spustí hneď. */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const s = await adminClientAsync()
    const r = u.searchParams.get('force') === '1' ? await runAgent(s, { trigger: 'manual', maxMs: 100000 }) : await runIfDue(s, { maxMs: 100000 })
    return NextResponse.json({ ok: r.ok !== false, ...r })
  } catch (e) { console.error('[invest] cron', String(e && e.message).slice(0, 160)); return NextResponse.json({ ok: false, error: 'Beh zlyhal.' }, { status: 500 }) }
}
