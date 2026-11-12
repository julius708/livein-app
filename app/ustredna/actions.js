'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { actorFromViewer, explain } from '@/lib/hq-core'
import { storeForViewer, runOp } from '@/lib/hq-server'
import { listActors } from '@/lib/hq-store'

async function caller() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Prihlásenie vypršalo. Obnov stránku a prihlás sa.' }
  const actor = actorFromViewer(v)
  if (!actor) return { error: 'Ústredňa je zatiaľ len pre vedenie (adminov).' }
  return { actor, s: storeForViewer(v) }
}
const guard = (fn) => async (...a) => {
  try { return await fn(...a) } catch (e) { const x = explain(e); if (x.status >= 500) console.error('[hq] action', String(e && e.message).slice(0, 160)); return { ok: false, error: x.message } }
}
async function run(op, params) {
  const c = await caller(); if (c.error) return { ok: false, error: c.error }
  const r = await runOp(c.s, op, params, { actor: c.actor, actors: await listActors(c.s) })
  revalidatePath('/ustredna')
  return { ok: true, taskId: r.taskId, duplicate: r.duplicate }
}

/** Zadať úlohu konkrétnemu človeku alebo agentovi. Zadávateľom je prihlásený používateľ. */
export const assignTaskAction = guard(async (form = {}) => run('assign', {
  summary: form.summary, nextAction: form.nextAction || 'Prevziať úlohu a potvrdiť prvý krok.', assigneeId: form.assigneeId,
  caseId: form.caseId || undefined, idempotencyKey: form.key || undefined,
}))

/** Overiť konkrétnu verziu výsledku (udalosť + odtlačky, ktoré boli zobrazené). Vlastný výsledok overiť nejde. */
export const verifyResultAction = guard(async (taskId, { checkedEventId, checkedDigests, note } = {}) => run('verify', {
  taskId, checkedEventId, checkedDigests, summary: note || 'Verzia výsledku skontrolovaná v ústredni.', nextAction: 'Zapracovať overenú verziu a potvrdiť zapracovanie v cieľovej službe.',
}))
