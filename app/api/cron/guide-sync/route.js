import { NextResponse } from 'next/server'
import { syncUnits } from '@/lib/guide/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Denne: nové jednotky z portfólia dostanú záznam a kód; pilotné jednotky s úplnými podmienkami dostanú štítok (idempotentne). */
export async function GET(request) {
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || new URL(request.url).searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await syncUnits()) }) } catch (e) { console.error('[guide] sync', e && e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }) }
}
