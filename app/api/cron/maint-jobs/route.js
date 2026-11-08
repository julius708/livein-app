import { NextResponse } from 'next/server'
import { processJobs } from '@/lib/maint-server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Každých 5 minút: fronta údržby (e-maily, pripomienky, eskalácie, hovory, Asana). Idempotentné; bez CRON_SECRET nič. */
export async function GET(request) {
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || new URL(request.url).searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await processJobs(25)) }) } catch (e) { console.error('[udrzba] jobs', e && e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
