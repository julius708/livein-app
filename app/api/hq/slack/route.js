import { NextResponse } from 'next/server'
import { storeForAgent } from '@/lib/hq-server'
import { markSource } from '@/lib/hq-store'
import { verifySlackSignature, classifySlackEvent } from '@/lib/hq-connectors'
export const dynamic = 'force-dynamic'

/**
 * Prijímač Slack Events API pre #ai-tim. Overí podpis (SLACK_SIGNING_SECRET) a zaznamená, že zdroj žije.
 * Zo správ zatiaľ NEVYTVÁRA úlohy ani odpovede: autor v Slacku nie je overená identita a automatická reakcia by hrozila slučkou.
 * Vlastné hlásenia ústredne (značka `hq:…#n`), správy botov a iné kanály ignoruje.
 */
export async function POST(request) {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'Slack prijímač nie je nastavený (chýba SLACK_SIGNING_SECRET).' }, { status: 503 })
  const body = await request.text()
  if (!verifySlackSignature({ secret, timestamp: request.headers.get('x-slack-request-timestamp'), signature: request.headers.get('x-slack-signature'), body })) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let payload
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  const c = classifySlackEvent(payload)
  if (c.action === 'challenge') return NextResponse.json({ challenge: c.challenge })
  if (c.action === 'candidate') { const s = await storeForAgent(); if (s) await markSource(s, 'slack', { ok: true }).catch(() => {}) }
  return NextResponse.json({ ok: true, action: c.action })
}
