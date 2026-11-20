import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { rpc, isMissingTable } from '@/lib/cl-server'
import { eveningPlan } from '@/lib/cl-evening'
import { notifyPeople } from '@/lib/cl-notify-server'
import { siteOrigin } from '@/lib/cl-invite'
import { todayBa, addDays } from '@/lib/cl-core'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Každý večer: (1) pre manažérov návrh rozdelenia nepriradených bytov na zajtra (potvrdia ho v appke jedným klikom, nič sa samo nepriradí),
 * (2) pre upratovačky pripomienka, čo ich zajtra čaká. Spôsob: push, ak má človek zapnutý odber, inak e-mail. Vypnúť sa dá v Nastaveniach.
 * ?day=RRRR-MM-DD určí iný deň, ?dry=1 nič neodošle a len vráti počty.
 */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const s = await adminClientAsync()
    const today = todayBa()
    const day = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('day') || '') ? u.searchParams.get('day') : addDays(today, 1)
    const sync = await rpc(s, 'cl_sync_tasks', { p_from: today, p_to: addDays(day, 7) })
    if (sync.demo) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    const plan = await rpc(s, 'cl_plan_data', { p_from: today, p_to: addDays(day, 7) })
    if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error || 'Údaje sa nepodarilo načítať.' }, { status: 500 })
    const origin = siteOrigin(request.headers, process.env)
    const r = eveningPlan({ plan, day, origin })
    if (u.searchParams.get('dry') === '1') return NextResponse.json({ ok: true, dry: true, day, counts: r.counts, messages: r.items.length })
    const sent = await notifyPeople(r.items, origin)
    return NextResponse.json({ ok: true, day, counts: r.counts, sent })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    console.error('[upratovanie] večerný beh', String(e && e.message).slice(0, 160))
    return NextResponse.json({ ok: false, error: 'Beh zlyhal.' }, { status: 500 })
  }
}
