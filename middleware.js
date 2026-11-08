import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { SUPABASE_URL, SUPABASE_ANON } from './lib/env'

// Verejné cesty (bez prihlásenia)
// Práčovňa pod /pracovna: service worker, manifest a ikony sa sťahujú bez session (push, pridanie na plochu)
const OPEN = ['/login', '/auth/', '/api/auth/', '/api/cron/', '/api/crm/create-lead', '/api/crm/hubspot-callback', '/api/crm/import', '/api/crm/asana-maintenance', '/api/newsletter/unsubscribe', '/pracovna/sw.js', '/pracovna/manifest.webmanifest', '/pracovna/icons/']

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
  // Ekonomika je už sekcia hlavnej appky; staré odkazy s lomkou presmerujeme
  // (plain URL, nie nextUrl.clone(): ten by zachoval koncovú lomku a presmeroval sám na seba)
  if (path === '/ekonomika/' || path.startsWith('/ekonomika/index')) return NextResponse.redirect(new URL('/ekonomika', req.url), 308)
  // Guru API z ostatných appiek: CORS preflight (OPTIONS) a volania s Bearer tokenom si overí samotná route, nie presmerovanie na /login
  const guruApi = path.startsWith('/api/guru') && (req.method === 'OPTIONS' || /^Bearer /i.test(req.headers.get('authorization') || ''))
  const isOpen = guruApi || OPEN.some((o) => path === o || path.startsWith(o))

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
