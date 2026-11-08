import { NextResponse } from 'next/server'
import { linkAsanaLeads } from '@/lib/crm-server'
import { dedupeLeadTasks } from '@/lib/crm-asana'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Údržba Asany (CRON_SECRET): ?action=link prepojí leady s úlohami (alebo založí), ?action=dedupe zlúči duplikáty (&dry=0 naostro). */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const action = u.searchParams.get('action') || 'link'
  try {
    if (action === 'dedupe') return NextResponse.json(await dedupeLeadTasks({ dryRun: u.searchParams.get('dry') !== '0' }))
    return NextResponse.json(await linkAsanaLeads({ limit: Number(u.searchParams.get('limit')) || 150, sinceDays: Number(u.searchParams.get('days')) || 120, create: u.searchParams.get('create') !== '0' }))
  } catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
