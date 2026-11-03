import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { TESTS, TEST_KEYS, latest } from '@/lib/personality-tests'
import ResultCard from '@/components/TestResult'
import './testy.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Testy osobnosti' }

export default async function TestsPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const { data: rows, error } = await s.from('personality_results').select('id,test_key,scores,summary,shared,created_at,user_id').eq('user_id', user.id).order('created_at', { ascending: false })
  const mine = latest(rows || [])
  const done = Object.fromEntries(mine.map((r) => [r.test_key, r]))
  const n = Object.keys(done).length
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="testy" hideFooter>
      <section className="li-page-intro">
        <div>
          <span className="li-eyebrow">Tím</span>
          <h1>Testy osobnosti</h1>
          <p>Spoznaj svoj štýl práce a porozumej kolegom. Každý test trvá pár minút, výsledok vidíš hneď. Je to dobrovoľné a neslúži na hodnotenie výkonu.</p>
        </div>
        <span className="li-shortcut">🧭 {n} / {TEST_KEYS.length} hotových</span>
      </section>
      <nav className="ts-tabs" aria-label="Sekcie">
        <Link href="/testy" aria-current="page">Testy</Link>
        <Link href="/testy/tim">Tím</Link>
        {isAdmin && <Link href="/testy/admin">Admin</Link>}
      </nav>
      <p className="ts-note">Kto vidí tvoje výsledky: ty a vedenie (admin). Kolegovia uvidia len to, čo sám zdieľaš pri každom teste.</p>
      {error && <p className="msg err">{error.message}</p>}
      <ul className="ts-grid">
        {TEST_KEYS.map((k) => { const T = TESTS[k]; const d = done[k]; return (
          <li key={k} className={'card ts-card' + (d ? ' done' : '')}>
            <div className="ts-head"><span className="ts-icon" aria-hidden="true">{T.icon}</span><span className="ts-tag">{T.min} min · {T.items.length} otázok</span>{d && <span className="ts-tag ok">Hotovo</span>}</div>
            <h3>{T.title}</h3>
            <p className="ts-desc">{T.desc}</p>
            {d && <p className="ts-sum"><b>{d.summary}</b> <small>{new Date(d.created_at).toLocaleDateString('sk-SK')}</small></p>}
            <Link className="btn" href={'/testy/' + k}>{d ? 'Vyplniť znova' : 'Začať test'}</Link>
          </li>
        ) })}
      </ul>
      {mine.length > 0 && (
        <section className="ts-results">
          <h2>Moje výsledky</h2>
          {mine.map((r) => <ResultCard key={r.id} row={r} own />)}
        </section>
      )}
    </Shell>
  )
}
