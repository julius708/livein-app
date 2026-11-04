import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { importAll } from '@/lib/crm-server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Jednorazový import kontaktov z HubSpotu. Spustí admin z appky alebo cron kľúčom. */
export async function POST(request) {
  const cronOk = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || new URL(request.url).searchParams.get('k') === process.env.CRON_SECRET)
  if (!cronOk) { const { user, isAdmin, blocked } = await getViewer(); if (!user || blocked || !isAdmin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 }) }
  try { return NextResponse.json(await importAll()) } catch (e) { console.error('[crm] import', e && e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
