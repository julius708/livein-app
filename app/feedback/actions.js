'use server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getViewer } from '@/lib/auth'
import { KINDS } from '@/lib/feedback'

export async function sendFeedback(prev, formData) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const kind = String(formData.get('kind') || 'napad')
  const message = String(formData.get('message') || '').trim()
  const page = String(formData.get('page') || '').slice(0, 200)
  if (!KINDS[kind]) return { ok: false, error: 'Vyber typ správy.' }
  if (message.length < 3) return { ok: false, error: 'Napíš aspoň pár slov.' }
  if (message.length > 4000) return { ok: false, error: 'Správa je príliš dlhá (max 4000 znakov).' }
  const ua = (await headers()).get('user-agent') || ''
  const device = /iPhone|Android|Mobile/i.test(ua) ? 'telefón' : 'počítač'
  const { error } = await s.from('feedback').insert({
    user_email: user.email.toLowerCase(), user_name: me.name, kind, message, page, device,
  })
  if (error) return { ok: false, error: 'Odoslanie zlyhalo: ' + (error.message || 'neznáma chyba') }
  revalidatePath('/feedback')
  revalidatePath('/admin/feedback')
  return { ok: true, n: Date.now() }
}
