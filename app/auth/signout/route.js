import { NextResponse } from 'next/server'
import { sb, originOf } from '@/lib/supabase'

export async function POST(req) {
  const s = await sb()
  await s.auth.signOut()
  return NextResponse.redirect(`${originOf(req)}/login`, { status: 303 })
}
