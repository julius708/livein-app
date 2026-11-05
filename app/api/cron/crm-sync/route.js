import { NextResponse } from 'next/server'
import { syncExternal } from '@/lib/crm-server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Každých 10 minút: fronta zápisov (HubSpot, Asana) a zmeny z HubSpotu a Asany do appky. */
export async function GET(request) {
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || new URL(request.url).searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await syncExternal()) }) } catch (e) { console.error('[crm] sync', e && e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
