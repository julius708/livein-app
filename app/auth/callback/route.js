import { NextResponse } from 'next/server'
import { sb, originOf } from '@/lib/supabase'
import { finishLogin } from '@/lib/finish'

export async function GET(req) {
  const origin = originOf(req)
  const u = new URL(req.url)
  const code = u.searchParams.get('code')
  const oauthError = u.searchParams.get('error') || u.searchParams.get('error_code')
  const desc = u.searchParams.get('error_description') || ''

  if (oauthError) {
    const denied = /saving new user|nie je v zozname|not allowed/i.test(desc)
    return NextResponse.redirect(`${origin}/login?err=${denied ? 'denied' : 'google'}`)
  }

  const s = await sb()
  if (code) {
    const { error } = await s.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(`${origin}/login?err=expired`)
  }
  return finishLogin(s, origin)
}
