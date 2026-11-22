'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'

export async function addLesson(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const what = String(formData.get('what') || '').trim()
  if (what.length < 5) return { ok: false, error: 'Napíš, čo sa stalo (aspoň 5 znakov).' }
  const { error } = await s.rpc('kb_lesson_add', { p_what: what.slice(0, 2000), p_change: String(formData.get('change') || '').trim().slice(0, 2000) || null, p_source: String(formData.get('source') || '').trim().slice(0, 200) || null })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kb/poucenia')
  return { ok: true, n: Date.now() }
}
