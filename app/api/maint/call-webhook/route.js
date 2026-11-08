import { NextResponse } from 'next/server'
import { ingestCallWebhook } from '@/lib/maint-server'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Stavové udalosti odchádzajúceho hovoru od poskytovateľa (?provider=twilio|3cx). Podpis sa overí v adaptéri, duplicitná udalosť sa ignoruje. */
export async function POST(request) {
  const provider = new URL(request.url).searchParams.get('provider') || ''
  if (!['twilio', '3cx'].includes(provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 400 })
  const raw = await request.text()
  const r = await ingestCallWebhook(provider, request, raw)
  return NextResponse.json(r, { status: r.ok ? 200 : 401 })
}
