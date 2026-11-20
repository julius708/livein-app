import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { loadInbox } from '@/lib/core-server'
import { safeHref, moduleLabel, unreadLabel } from '@/lib/core'
import ReadAll from './ReadAll'
import './schranka.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Schránka' }

const FMT = new Intl.DateTimeFormat('sk-SK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Bratislava' })

export default async function InboxPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/schranka')
  if (blocked) return <NoAccess email={user.email} />
  const rows = await loadInbox(s)
  const unread = rows.filter((r) => !r.read_at).length
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="inbox" hideFooter>
      <section className="li-page-intro">
        <div>
          <span className="li-eyebrow">Moje správy</span>
          <h1>Schránka</h1>
          <p>Úlohy a upozornenia pre teba zo všetkých častí appky na jednom mieste.</p>
        </div>
        <span className="li-shortcut">📥 {unread ? unreadLabel(unread) : 'všetko prečítané'}</span>
      </section>
      {unread > 0 && <ReadAll />}
      {!rows.length ? <section className="card"><p className="ib-empty">Zatiaľ tu nič nie je. Keď ti niekto pošle úlohu alebo upozornenie, uvidíš to tu.</p></section> : (
        <ul className="ib-list">
          {rows.map((r) => {
            const href = safeHref(r.href)
            const inner = (
              <>
                <div className="ib-top"><b>{r.title}</b>{r.kind === 'alert' && <em>dôležité</em>}<span>{FMT.format(new Date(r.at))}</span></div>
                {r.body && <p>{r.body}</p>}
                <small>{moduleLabel(r.module)}{r.from_email ? ` · od ${r.from_email}` : ''}</small>
              </>
            )
            return <li key={r.id} className={'ib-item' + (r.read_at ? '' : ' unread')}>{href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>}</li>
          })}
        </ul>
      )}
    </Shell>
  )
}
