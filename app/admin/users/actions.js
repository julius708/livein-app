'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { cleanUser } from '@/lib/validate'

const NOT_ADMIN = { ok: false, error: 'Na túto akciu potrebuješ rolu Admin.' }

function dbError(e) {
  if (!e) return 'Neznáma chyba.'
  if (e.code === '23505') return 'Tento e-mail už v zozname je.'
  if (e.code === '23514') return 'Neplatné údaje (skontroluj e-mail a roly).'
  if (e.code === '42501') return 'Databáza akciu odmietla (chýbajú práva).'
  return e.message || 'Uloženie zlyhalo.'
}

export async function addUser(input) {
  const { s, isAdmin } = await getViewer()
  if (!isAdmin) return NOT_ADMIN
  const c = cleanUser(input)
  if (c.error) return { ok: false, error: c.error }
  const { data, error } = await s.from('app_users').insert({ ...c.value, active: true }).select('*').single()
  if (error) return { ok: false, error: dbError(error) }
  const { data: acc, error: accErr } = await s.rpc('admin_reset_password', { target_email: data.email })
  revalidatePath('/admin/users')
  return { ok: true, user: data, account: accErr ? null : acc, accountError: accErr ? accErr.message : null }
}

export async function resetPassword(email) {
  const { s, isAdmin } = await getViewer()
  if (!isAdmin) return NOT_ADMIN
  const { data, error } = await s.rpc('admin_reset_password', { target_email: String(email || '').toLowerCase() })
  if (error) return { ok: false, error: error.message || 'Reset hesla zlyhal.' }
  revalidatePath('/admin/users')
  return { ok: true, created: !!(data && data.created) }
}

export async function updateUser(email, patch) {
  const { s, isAdmin, user } = await getViewer()
  if (!isAdmin) return NOT_ADMIN
  const target = String(email || '').toLowerCase()
  const allowed = {}
  if ('name' in patch) { const v = String(patch.name || '').trim().replace(/\s+/g, ' '); if (v.length < 2) return { ok: false, error: 'Meno musí mať aspoň 2 znaky.' }; allowed.name = v }
  if ('title' in patch) allowed.title = String(patch.title || '').trim() || null
  if ('scope_city' in patch) allowed.scope_city = String(patch.scope_city || '').trim() || null
  if ('roles' in patch) {
    const c = cleanUser({ email: target, name: 'xx', roles: patch.roles })
    if (c.error) return { ok: false, error: c.error }
    if (target === user.email.toLowerCase() && !c.value.roles.includes('admin')) return { ok: false, error: 'Sám sebe nemôžeš odobrať rolu Admin.' }
    allowed.roles = c.value.roles
  }
  if ('active' in patch) {
    if (target === user.email.toLowerCase() && !patch.active) return { ok: false, error: 'Sám seba nemôžeš vypnúť.' }
    allowed.active = !!patch.active
  }
  if (Object.keys(allowed).length === 0) return { ok: true }
  const { data, error } = await s.from('app_users').update(allowed).eq('email', target).select('*').maybeSingle()
  if (error) return { ok: false, error: dbError(error) }
  if (!data) return { ok: false, error: 'Používateľ sa nenašiel.' }
  revalidatePath('/admin/users')
  return { ok: true, user: data }
}

export async function removeUser(email) {
  const { s, isAdmin, user } = await getViewer()
  if (!isAdmin) return NOT_ADMIN
  const target = String(email || '').toLowerCase()
  if (target === user.email.toLowerCase()) return { ok: false, error: 'Sám seba nemôžeš odstrániť.' }
  const { error, count } = await s.from('app_users').delete({ count: 'exact' }).eq('email', target)
  if (error) return { ok: false, error: dbError(error) }
  if (!count) return { ok: false, error: 'Používateľ sa nenašiel.' }
  revalidatePath('/admin/users')
  return { ok: true }
}
