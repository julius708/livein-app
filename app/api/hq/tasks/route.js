import { NextResponse } from 'next/server'
import { resolveCaller } from '@/lib/hq-server'
import { listTasks } from '@/lib/hq-store'
import { queueFor } from '@/lib/hq-core'
export const dynamic = 'force-dynamic'

const slim = (t) => ({ taskId: t.taskId, caseId: t.caseId, title: t.title, status: t.status, assigneeId: t.assigneeId, assignedBy: t.assignedBy, summary: t.summary, nextAction: t.nextAction, sequence: t.sequence, lastActorId: t.lastActorId, lastAt: t.lastAt, refs: t.refs, result: t.result })

/** Fronta volajúceho: `mine` = jeho otvorené úlohy, `toVerify` = cudzie výsledky na nezávislú kontrolu. `?all=1` vráti všetky úlohy. */
export async function GET(request) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  const tasks = await listTasks(c.s)
  const q = queueFor(tasks, c.actor.id)
  const all = new URL(request.url).searchParams.get('all') === '1'
  return NextResponse.json({ ok: true, actorId: c.actor.id, mine: q.mine.map(slim), toVerify: q.toVerify.map(slim), ...(all ? { all: tasks.map(slim) } : {}) })
}
