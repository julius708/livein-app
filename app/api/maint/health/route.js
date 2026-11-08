import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { healthReport } from '@/lib/maint-server'
export const dynamic = 'force-dynamic'

/** Kontrola stavu pilotu (bez tajomstiev): prihlásený tím alebo CRON_SECRET. */
export async function GET(request) {
  const byKey = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || new URL(request.url).searchParams.get('k') === process.env.CRON_SECRET)
  if (!byKey) { const v = await getViewer(); if (!v.user || v.blocked) return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  try { return NextResponse.json(await healthReport()) } catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
