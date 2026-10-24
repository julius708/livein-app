'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'

export async function saveNote(prev, formData) {
  const { s, isAdmin } = await getViewer()
  if (!isAdmin) return { ok: false, error: 'Odkaz môže meniť len admin.' }
  const text = String(formData.get('text') || '').trim()
  if (text.length > 600) return { ok: false, error: 'Odkaz je príliš dlhý (max 600 znakov).' }
  const { error } = await s.rpc('set_pinned_note', { p_text: text })
  if (error) return { ok: false, error: error.message || 'Uloženie zlyhalo.' }
  revalidatePath('/')
  return { ok: true, cleared: text === '' }
}
