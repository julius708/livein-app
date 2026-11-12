import { NextResponse } from 'next/server'
import { resolveCaller } from '@/lib/hq-server'
import { saveAgents } from '@/lib/hq-agents-server'
export const dynamic = 'force-dynamic'

/**
 * Príjem prehľadu dôkazov o agentoch od zberného skriptu (tools/ustredna/agents-sync.mjs). Autentifikácia ako pri /api/hq/events.
 * Posielať smie admin alebo agent so schopnosťou `work`. Telo: názvy a stav rozvrhov, časy posledných výstupov; žiadne zadania ani obsah súborov.
 */
export async function POST(request) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  if (!(c.actor.capabilities || []).includes('work')) return NextResponse.json({ ok: false, error: 'Na odoslanie prehľadu agentov nemáš oprávnenie.' }, { status: 403 })
  const len = Number(request.headers.get('content-length') || 0)
  if (len > 500_000) return NextResponse.json({ ok: false, error: 'Prehľad je príliš veľký.' }, { status: 413 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Telo musí byť JSON.' }, { status: 400 }) }
  try {
    const r = await saveAgents(c.viewer ? c.viewer.s : c.s, body, { actorId: c.actor.id })
    return NextResponse.json({ ok: true, ...r, actorId: c.actor.id })
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (/^agenti: /.test(msg)) { console.error('[hq] agents', msg.slice(0, 160)); return NextResponse.json({ ok: false, error: 'Prehľad sa nepodarilo uložiť.' }, { status: 500 }) }
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 400 })
  }
}
