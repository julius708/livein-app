import { cache } from 'react'
import { sb } from './supabase'

export const getViewer = cache(async () => {
  const s = await sb()
  const { data: { user } } = await s.auth.getUser()
  if (!user || !user.email) return { s, user: null, me: null, isAdmin: false, blocked: false, mustChange: false }
  const email = user.email.toLowerCase()
  const { data: row } = await s.from('app_users').select('*').eq('email', email).maybeSingle()
  const me = row && row.active ? row : null
  const mustChange = !!(user.user_metadata && user.user_metadata.must_change_password)
  return { s, user, me, isAdmin: !!(me && (me.roles || []).includes('admin')), blocked: !me, mustChange }
})

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}
