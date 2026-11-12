import { NextResponse } from 'next/server'
import { resolveCaller } from '@/lib/hq-server'
import { getTask } from '@/lib/hq-store'
export const dynamic = 'force-dynamic'

/** Detail úlohy s celou históriou udalostí (dôkazy, odkazy na zdroje, overenia). */
export async function GET(request, { params }) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  const { id } = await params
  const task = await getTask(c.s, String(id || ''))
  if (!task) return NextResponse.json({ ok: false, error: 'Úloha neexistuje.' }, { status: 404 })
  return NextResponse.json({ ok: true, actorId: c.actor.id, task })
}
