'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'

/** Nový nápad: názov + popis, autor sa dosadí z prihláseného používateľa (v databáze). */
export async function addIdea(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  if (title.length < 2) return { ok: false, error: 'Napíš krátky názov.' }
  if (title.length > 80) return { ok: false, error: 'Názov je príliš dlhý (max 80 znakov).' }
  if (description.length < 3) return { ok: false, error: 'Napíš, čo sa stalo.' }
  if (description.length > 2000) return { ok: false, error: 'Popis je príliš dlhý (max 2000 znakov).' }
  const { error } = await s.rpc('add_content_idea', { p_title: title, p_description: description })
  if (error) return { ok: false, error: error.message || 'Uloženie zlyhalo.' }
  revalidatePath('/napady')
  return { ok: true, n: Date.now() }
}

/** Zmena stavu jedným klikom: new / selected / script_done. */
export async function setIdeaStatus(formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const id = String(formData.get('id') || ''), status = String(formData.get('status') || '')
  if (!['new', 'selected', 'script_done'].includes(status)) return { ok: false, error: 'Neznámy stav.' }
  const { error } = await s.rpc('set_content_idea_status', { p_id: id, p_status: status })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/napady')
  return { ok: true }
}
