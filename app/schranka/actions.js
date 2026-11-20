'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { rpc } from '@/lib/cl-server'

export async function markReadAction(ids) {
  const v = await getViewer()
  if (!v.user || v.blocked) return { ok: false, error: 'Prihlásenie vypršalo. Obnov stránku.' }
  const list = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : null
  const r = await rpc(v.s, 'core_inbox_read', { p_ids: list && list.length ? list : null })
  if (r.ok) { revalidatePath('/schranka'); revalidatePath('/') }
  return r
}
