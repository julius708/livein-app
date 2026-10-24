'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'

/** Pridá opravu do zoznamu údržby (ktokoľvek aktívny v tíme). */
export async function addIssue(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const listingId = String(formData.get('listing_id') || '').trim()
  const listingName = String(formData.get('listing_name') || '').trim().slice(0, 120)
  const text = String(formData.get('text') || '').trim()
  const priority = formData.get('priority') === 'high' ? 'high' : 'normal'
  if (!listingId && listingName.length < 2) return { ok: false, error: 'Vyber byt alebo napíš, kde to je.' }
  if (text.length < 3) return { ok: false, error: 'Napíš, čo treba opraviť.' }
  if (text.length > 500) return { ok: false, error: 'Popis je príliš dlhý (max 500 znakov).' }
  const { error } = await s.rpc('add_maintenance_issue', { p_listing_id: listingId || null, p_listing_name: listingName, p_text: text, p_priority: priority })
  if (error) return { ok: false, error: error.message || 'Uloženie zlyhalo.' }
  revalidatePath('/')
  return { ok: true, n: Date.now() }
}

/** Označí opravu ako hotovú. */
export async function closeIssue(formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return
  const id = String(formData.get('id') || '')
  if (!id) return
  await s.rpc('close_maintenance_issue', { p_id: id })
  revalidatePath('/')
}
