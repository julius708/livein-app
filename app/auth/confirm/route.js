import { NextResponse } from 'next/server'
import { sb, originOf } from '@/lib/supabase'
import { finishLogin } from '@/lib/finish'

export async function GET(req) {
  const origin = originOf(req)
  const u = new URL(req.url)
  const token_hash = u.searchParams.get('token_hash')
  const code = u.searchParams.get('code')
  const type = u.searchParams.get('type') || 'email'
  if (u.searchParams.get('error') || u.searchParams.get('error_code')) return NextResponse.redirect(`${origin}/login?err=expired`)
  if (!token_hash && !code) return NextResponse.redirect(`${origin}/login?err=expired`)
  const s = await sb()
  const { error } = token_hash
    ? await s.auth.verifyOtp({ token_hash, type })
    : await s.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?err=expired`)
  return finishLogin(s, origin)
}
