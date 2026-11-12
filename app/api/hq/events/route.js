import { NextResponse } from 'next/server'
import { resolveCaller, runOp } from '@/lib/hq-server'
import { listActors } from '@/lib/hq-store'
import { explain, OPS } from '@/lib/hq-core'
export const dynamic = 'force-dynamic'

/**
 * Jeden kontrakt pre UI, Codex, Claude Code a konektory. Dokumentácia: docs/ustredna/README.md.
 * Autentifikácia: `Authorization: Bearer <token agenta>` (HQ_AGENT_TOKENS) alebo prihlásený admin.
 * Telo: { op: assign|accept|step|block|result|verify|apply, taskId?, summary, nextAction, assigneeId?, caseId?, evidence?, refs?,
 *         checkedEventId?, checkedDigests?, receipt?, sequence?, idempotencyKey? }.
 * Polia actorId, workspaceId a source sa z tela nikdy neberú: určuje ich server podľa prihlásenia.
 */
export async function POST(request) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Telo musí byť JSON.' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'Telo musí byť objekt.' }, { status: 400 })
  if (!OPS[body.op]) return NextResponse.json({ ok: false, code: 'bad_op', error: 'Neznáma operácia. Povolené: ' + Object.keys(OPS).join(', ') + '.' }, { status: 400 })
  try {
    const r = await runOp(c.s, body.op, body, { actor: c.actor, actors: await listActors(c.s) })
    return NextResponse.json({ ok: true, duplicate: r.duplicate, taskId: r.taskId, eventId: r.eventId, sequence: r.sequence, status: r.status, actorId: c.actor.id })
  } catch (e) {
    const x = explain(e)
    if (x.status >= 500) console.error('[hq] events', String(e && e.message).slice(0, 160))
    return NextResponse.json({ ok: false, code: x.code, error: x.message }, { status: x.status })
  }
}
export async function GET() { return NextResponse.json({ ok: false, error: 'Použite POST. Dokumentácia: docs/ustredna/README.md' }, { status: 405 }) }
