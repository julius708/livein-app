import { NextResponse } from 'next/server'

export async function finishLogin(s, origin) {
  const { data: { user } } = await s.auth.getUser()
  if (!user || !user.email) return NextResponse.redirect(`${origin}/login?err=auth`)
  const { data: ok } = await s.rpc('is_allowed_email', { e: user.email })
  if (!ok) {
    await s.auth.signOut()
    return NextResponse.redirect(`${origin}/login?err=denied`)
  }
  return NextResponse.redirect(`${origin}/`)
}
