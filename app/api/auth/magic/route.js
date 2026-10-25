import { NextResponse } from 'next/server'
import { sb, originOf } from '@/lib/supabase'
import { EMAIL_RE } from '@/lib/validate'
import { mailAuth } from '@/lib/mail-auth'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, code: 'invalid', error: 'Zadaj platný e-mail.' })

  const s = await sb()
  const { data: allowed, error: rpcErr } = await s.rpc('is_allowed_email', { e: email })
  if (rpcErr) return NextResponse.json({ ok: false, code: 'server', error: 'Server je dočasne nedostupný. Skús o chvíľu.' })
  if (!allowed) return NextResponse.json({ ok: false, code: 'denied', error: 'Tento e-mail nie je v zozname používateľov LIVE-IN. Ak si člen tímu, napíš Júliusovi.' })

  // implicitný režim: odkaz funguje aj keď sa otvorí v inom prehliadači než v nainštalovanej appke
  const { error } = await mailAuth().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${originOf(req)}/login`, shouldCreateUser: true },
  })
  if (error) {
    const rate = error.status === 429 || /rate limit/i.test(error.message || '')
    return NextResponse.json({
      ok: false,
      code: rate ? 'rate' : 'send',
      error: rate ? 'Odkaz sme ti poslali pred chvíľou. Pozri si schránku (aj spam) alebo počkaj minútu a skús znova.' : 'Odoslanie e-mailu zlyhalo. Skús o chvíľu znova.',
    })
  }
  return NextResponse.json({ ok: true })
}
