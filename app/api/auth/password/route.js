import { NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { EMAIL_RE } from '@/lib/validate'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!EMAIL_RE.test(email) || !password) return NextResponse.json({ ok: false, error: 'Zadaj e-mail aj heslo.' })

  const s = await sb()
  const { data: allowed } = await s.rpc('is_allowed_email', { e: email })
  if (!allowed) return NextResponse.json({ ok: false, error: 'Tento e-mail nie je v zozname používateľov LIVE-IN. Ak si člen tímu, napíš Júliusovi.' })

  const { data, error } = await s.auth.signInWithPassword({ email, password })
  if (error) {
    const rate = error.status === 429
    return NextResponse.json({ ok: false, error: rate ? 'Priveľa pokusov. Počkaj chvíľu a skús znova.' : 'Nesprávny e-mail alebo heslo.' })
  }
  const mustChange = !!(data.user && data.user.user_metadata && data.user.user_metadata.must_change_password)
  return NextResponse.json({ ok: true, next: mustChange ? '/heslo' : '/' })
}
