'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { LINKABLE } from '@/lib/modules'
import { cleanUrl } from '@/lib/validate'

export async function saveSettings(prev, formData) {
  const { s, isAdmin } = await getViewer()
  if (!isAdmin) return { ok: false, error: 'Na túto akciu potrebuješ rolu Admin.' }

  const urls = {}
  for (const m of LINKABLE) {
    const c = cleanUrl(formData.get(`url-${m.id}`))
    if (c.error) return { ok: false, error: c.error }
    if (c.value) urls[m.id] = c.value
  }
  const defPw = String(formData.get('default_password') || '').trim()
  if (defPw.length < 6) return { ok: false, error: 'Dočasné heslo musí mať aspoň 6 znakov.' }
  const auth = { google: formData.get('google') === 'on', default_password: defPw }

  const now = new Date().toISOString()
  const { error } = await s.from('config').upsert([
    { key: 'module_urls', value: urls, updated_at: now },
    { key: 'auth', value: auth, updated_at: now },
  ], { onConflict: 'key' })
  if (error) return { ok: false, error: error.message || 'Uloženie zlyhalo.' }

  revalidatePath('/')
  revalidatePath('/admin/settings')
  return { ok: true, savedAt: now }
}
