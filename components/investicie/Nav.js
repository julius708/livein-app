import Link from 'next/link'
export default function IvNav({ active, isAdmin = false, badge = 0 }) {
  const tabs = [['prehlad', '/investicie/prehlad', 'Prehľad'], ['nehnutelnosti', '/investicie', 'Nehnuteľnosti'], ['dopyty', '/investicie/dopyty', 'Dopyty'], ...(isAdmin ? [['agent', '/investicie/agent', 'Agent a nastavenia']] : [])]
  return <nav className="iv-nav" aria-label="Investície">{tabs.map(([id, href, label]) => <Link key={id} href={href} className={active === id ? 'on' : ''}>{label}{id === 'prehlad' && badge > 0 ? <b>{badge}</b> : null}</Link>)}</nav>
}
