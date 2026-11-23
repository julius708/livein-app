import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import '@/app/zaradenie/zaradenie.css'

const NAV = [['/zaradenie', 'Byty v zaraďovaní', 'home'], ['/zaradenie/novy', '+ Nový byt', 'novy']]

/** Zaradenie bytov v hlavnej appke: spoločná hlavička a Guru, vlastná podnavigácia a úvod. */
export default async function OnbShell({ active = 'home', intro, children }) {
  const { me, user, isAdmin } = await getViewer()
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="zaradenie" guruApp="onboarding" hideFooter>
      <div className="li-onb">
        <nav className="kb-nav" aria-label="Zaradenie bytov">{NAV.map(([href, label, id]) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined} className={active === id ? 'on' : ''}>{label}</Link>)}</nav>
        {intro && <section className="li-page-intro"><div><span className="li-eyebrow">{intro.eyebrow}</span><h1>{intro.title}</h1>{intro.text && <p>{intro.text}</p>}</div>{intro.aside}</section>}
        {children}
        <footer className="li-footer"><strong>LIVE-IN International</strong><span>Zaradenie bytov · Asana je zdroj pravdy pre checklist</span></footer>
      </div>
    </Shell>
  )
}
