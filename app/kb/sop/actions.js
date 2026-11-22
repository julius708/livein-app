'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'

const slugify = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** Uloží SOP (nový alebo zmenu) cez RPC, ktorá kontroluje admina/vlastníka a vedie verzie. */
export async function saveSop(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const title = String(formData.get('title') || '').trim()
  if (title.length < 3) return { ok: false, error: 'Zadaj názov (aspoň 3 znaky).' }
  const slug = String(formData.get('slug') || '').trim() || slugify(title)
  const tags = String(formData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean)
  const d = (k) => { const v = String(formData.get(k) || '').trim(); return v || null }
  const { data, error } = await s.rpc('kb_sop_save', {
    p_slug: slug, p_title: title, p_body: String(formData.get('body') || ''), p_status: String(formData.get('status') || 'navrh'),
    p_owner: d('owner') || me.name, p_reviewed: d('reviewed_at'), p_next: d('next_review_at'), p_tags: tags, p_city: d('city'),
    p_todo: formData.get('todo') === 'on', p_note: d('note'),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kb/sop'); revalidatePath(`/kb/sop/${slug}`)
  if (prev?.isNew || !formData.get('slug')) redirect(`/kb/sop/${data.slug}`)
  return { ok: true, saved: Date.now() }
}
