import { cache } from 'react'
import { headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sb } from './supabase'
import { SUPABASE_URL, SUPABASE_ANON } from './env'

/** Guru widget v ostatných appkách (Práčovňa, CS…) posiela prihlásenie tej appky ako Bearer token, lebo cookie hlavnej appky nemá. */
async function bearerViewer() {
  try {
    const h = await headers()
    const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(h.get('authorization') || '')
    if (!m) return null
    const token = m[1]
    const t = createServerClient(SUPABASE_URL, SUPABASE_ANON, { cookies: { getAll: () => [], setAll: () => {} }, global: { headers: { Authorization: 'Bearer ' + token } } })
    const { data, error } = await t.auth.getUser(token)
    if (error || !data || !data.user) return null
    return { s: t, user: data.user }
  } catch { return null }
}

export const getViewer = cache(async () => {
  let s = await sb()
  let { data: { user } } = await s.auth.getUser()
  if (!user) { const b = await bearerViewer(); if (b) { s = b.s; user = b.user } }
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
