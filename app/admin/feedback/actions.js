'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { STATUSES } from '@/lib/feedback'

export async function setFeedbackStatus(id, status) {
  const { s, isAdmin } = await getViewer()
  if (!isAdmin) return { ok: false, error: 'Na túto akciu potrebuješ rolu Admin.' }
  if (!STATUSES[status]) return { ok: false, error: 'Neplatný stav.' }
  const { error } = await s.from('feedback').update({ status }).eq('id', Number(id))
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/feedback')
  return { ok: true }
}
