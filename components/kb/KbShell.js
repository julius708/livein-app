import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import '@/app/kb/kb.css'

export const KB_NAV = [
  ['/kb', 'Hľadať', 'home'], ['/kb/sop', 'SOP', 'sop'], ['/kb/mapy', 'Mapy problémov', 'mapy'], ['/kb/faq', 'FAQ hostí', 'faq'], ['/kb/dokumenty', 'Dokumenty', 'dokumenty'], ['/kb/poucenia', 'Poučenia', 'poucenia'],
]

/** Znalostná báza v hlavnej appke: spoločná hlavička a Guru z hlavnej appky, vlastná podnavigácia a úvod. */
export default async function KbShell({ active = 'home', intro, children }) {
  const { me, user, isAdmin } = await getViewer()
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="kb" guruApp="kb" hideFooter>
      <div className="li-kb">
        <nav className="kb-nav" aria-label="Znalostná báza">{KB_NAV.map(([href, label, id]) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined} className={active === id ? 'on' : ''}>{label}</Link>)}</nav>
        {intro && <section className="li-page-intro"><div><span className="li-eyebrow">{intro.eyebrow}</span><h1>{intro.title}</h1>{intro.text && <p>{intro.text}</p>}</div>{intro.aside}</section>}
        {children}
        <footer className="li-footer"><strong>LIVE-IN International</strong><span>Interný dokument — Nezdieľať externe</span></footer>
      </div>
    </Shell>
  )
}
