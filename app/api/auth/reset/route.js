import { NextResponse } from 'next/server'
import { sb, originOf } from '@/lib/supabase'
import { mailAuth } from '@/lib/mail-auth'
import { EMAIL_RE } from '@/lib/validate'

/** Zabudnuté heslo: pošle e-mail s odkazom, ktorý otvorí prihlasovaciu stránku s dočasnou session a presmeruje na nastavenie nového hesla. */
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, code: 'invalid', error: 'Zadaj platný e-mail.' })

  const s = await sb()
  const { data: allowed, error: rpcErr } = await s.rpc('is_allowed_email', { e: email })
  if (rpcErr) return NextResponse.json({ ok: false, code: 'server', error: 'Server je dočasne nedostupný. Skús o chvíľu.' })
  if (!allowed) return NextResponse.json({ ok: false, code: 'denied', error: 'Tento e-mail nie je v zozname používateľov LIVE-IN. Ak si člen tímu, napíš Júliusovi.' })

  const { error } = await mailAuth().auth.resetPasswordForEmail(email, { redirectTo: `${originOf(req)}/login` })
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
