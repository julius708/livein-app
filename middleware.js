import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { SUPABASE_URL, SUPABASE_ANON } from './lib/env'

// Verejné cesty (bez prihlásenia)
// Práčovňa pod /pracovna: service worker, manifest a ikony sa sťahujú bez session (push, pridanie na plochu)
const OPEN = ['/login', '/auth/', '/api/auth/', '/pracovna/sw.js', '/pracovna/manifest.webmanifest', '/pracovna/icons/']

export async function middleware(req) {
  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value))
        res = NextResponse.next({ request: req })
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname
  // statická Ekonomika používa relatívne cesty, preto musí bežať na /ekonomika/ s koncovou lomkou
  if (path === '/ekonomika') return new NextResponse(null, { status: 307, headers: { Location: '/ekonomika/' } })
  const isOpen = OPEN.some((o) => path === o || path.startsWith(o))

  if (!user && !isOpen) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  const mustChange = !!(user && user.user_metadata && user.user_metadata.must_change_password)
  if (mustChange && !isOpen && path !== '/heslo' && !path.startsWith('/api/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/heslo'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (user && path === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|logo\\.png|icon-.*\\.png|apple-touch-icon\\.png|manifest\\.webmanifest).*)'],
}
