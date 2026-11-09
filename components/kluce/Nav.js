import Link from 'next/link'
/** Záložky modulu Kľúče. */
export default function KeysNav({ active = 'board', isAdmin = false }) {
  const items = [['board', '/kluce', 'Tabuľa'], ['history', '/kluce/historia', 'História'], ['admin', '/kluce/sprava', 'Správa'], ['kiosk', '/kluce/kiosk', 'Kiosk (iPad)']]
  return <nav className="kl-nav" aria-label="Kľúče">{items.map(([id, href, label]) => <Link key={id} href={href} className={active === id ? 'on' : ''} aria-current={active === id ? 'page' : undefined}>{label}</Link>)}</nav>
}
