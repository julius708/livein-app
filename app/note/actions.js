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

/** Nový oznam na nástenku (ktokoľvek aktívny v tíme) + voliteľne komu je adresovaný. */
export async function addBoardNote(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const text = String(formData.get('text') || '').trim()
  if (text.length < 2) return { ok: false, error: 'Napíš text oznamu.' }
  if (text.length > 500) return { ok: false, error: 'Oznam je príliš dlhý (max 500 znakov).' }
  const emails = formData.getAll('for').map(String).filter(Boolean).slice(0, 30)
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }))
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const { data, error } = await s.rpc('add_board_note', { p_text: text, p_date: date, p_action_id: crypto.randomUUID() })
  if (error) return { ok: false, error: error.message }
  if (!data || !data.ok) return { ok: false, error: data && data.status === 'bad_date' ? 'Neplatný dátum.' : 'Uloženie zlyhalo.' }
  if (emails.length && data.id) await s.rpc('board_note_mention', { p_note_id: data.id, p_emails: emails })
  revalidatePath('/')
  return { ok: true, n: Date.now() }
}

/** Označí oznamy adresované mne ako videné. */
export async function markMentionsSeen() {
  const { s, user } = await getViewer()
  if (!user) return { ok: false }
  await s.rpc('board_mentions_seen')
  revalidatePath('/')
  return { ok: true }
}
