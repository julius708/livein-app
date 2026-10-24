import Link from 'next/link'
import UsageTracker from '@/components/UsageTracker'
import { initials } from '@/lib/auth'
import FeedbackForm from '@/components/FeedbackForm'
import PullToRefresh, { RefreshButton } from '@/components/Refresh'
import '@/app/guru/guru.css'

export default function Shell({ me, user, isAdmin, active = 'home', locked = false, hideFooter = false, children }) {
  const name = (me && me.name) || (user && user.email) || ''
  const items = [
    { href: '/', id: 'home', label: 'Domov', icon: '🏠' },
    { href: '/feedback', id: 'feedback', label: 'Feedback', icon: '💬' },
    { href: '/guru', id: 'guru', label: 'Guru', icon: '🧠' },
    ...(isAdmin ? [{ href: '/admin/activity', id: 'admin', label: 'Správa', icon: '⚙️' }] : []),
    { href: '/heslo', id: 'password', label: 'Heslo', icon: '🔑' },
  ]
  return (
    <>
      <a className="li-skip" href="#workspace-content">Preskočiť na obsah</a>
      {!locked && <PullToRefresh />}
      <header className="li-masthead">
        <div className="li-masthead-inner">
          <a className="li-brand-link" href="/" aria-label="Domov"><img src="/logo.png" alt="LIVE-IN" /><span className="li-product">Tímový priestor</span></a>
          {!locked && (
            <nav className="li-nav" aria-label="Hlavná navigácia">
              {items.map((i) => <Link key={i.id} href={i.href} aria-current={active === i.id ? 'page' : undefined} className={active === i.id ? 'on' : ''}>{i.label}</Link>)}
            </nav>
          )}
          <div className="sp" />
          <div className="who">
            <div className="av" aria-hidden="true">{initials(name)}</div>
            <div className="nm">{name}<small>{me && me.title ? me.title : (user ? user.email : '')}</small></div>
            {!locked && <RefreshButton />}
            <form action="/auth/signout" method="post"><button className="out" type="submit">Odhlásiť</button></form>
          </div>
        </div>
      </header>
      <main id="workspace-content" className={"wrap li-main-workspace" + (isAdmin ? " li-admin" : "")}>
        {active !== "home" && <div className="li-trail"><Link href="/">LIVE-IN domov</Link><span>{items.find(i => i.id === active)?.label || "Tímový priestor"}</span></div>}
        {children}
        {!locked && me && <UsageTracker />}
        {!locked && isAdmin && active !== 'guru' && (
          <a className="guru-fab" href="/guru" aria-label="Opýtaj sa Gurua"><span aria-hidden="true">🧠</span> Opýtaj sa Gurua</a>
        )}
        {!locked && !hideFooter && me && (
          <details className="card fbfoot" id="feedback">
            <summary><span>💬 Feedback k appke</span><small>Testujeme. Napíš nám, čo zmeniť.</small></summary>
            <FeedbackForm />
          </details>
        )}
      </main>
      {!locked && (
        <nav className="tabbar" aria-label="Spodná navigácia">
          {items.map((i) => (
            <Link key={i.id} href={i.href} aria-current={active === i.id ? 'page' : undefined} className={active === i.id ? 'on' : ''}>
              <span aria-hidden="true">{i.icon}</span>{i.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  )
}
