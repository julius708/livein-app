'use server'
import { getViewer } from '@/lib/auth'
import { PLAN_KEY } from '@/lib/plan-2027'
import { revalidatePath } from 'next/cache'

/** Potvrdenie „prečítal/a som plán“ (jedno na človeka). */
export async function markPlanRead() {
  const { s, user, me, blocked } = await getViewer()
  if (!user || blocked) return { ok: false, error: 'Najprv sa prihlás.' }
  const { error } = await s.from('plan_reads').upsert({ plan_key: PLAN_KEY, user_email: user.email.toLowerCase(), user_name: me.name || null }, { onConflict: 'plan_key,user_email' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/plan'); revalidatePath('/')
  return { ok: true }
}
