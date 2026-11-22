'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'

export async function reviewDoc(prev, formData) {
  const { s, user, isAdmin } = await getViewer()
  if (!user || !isAdmin) return { ok: false, error: 'Stav dokumentu mení len admin.' }
  const path = String(formData.get('path') || '')
  const d = (k) => { const v = String(formData.get(k) || '').trim(); return v || null }
  const tags = String(formData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean)
  const { error } = await s.rpc('kb_doc_review', { p_path: path, p_status: String(formData.get('status') || 'schvalene'), p_reviewed: d('reviewed_at'), p_next: d('next_review_at'), p_tags: tags })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kb/dokumenty')
  return { ok: true }
}
