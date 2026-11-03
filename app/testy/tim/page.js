import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { TESTS, TEST_KEYS, latest } from '@/lib/personality-tests'
import '../testy.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tím · Testy osobnosti' }

export default async function TeamPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const { data: rows, error } = await s.from('personality_results').select('id,user_id,name,test_key,summary,created_at').eq('shared', true).order('created_at', { ascending: false })
  const res = latest(rows || [])
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="testy" hideFooter>
      <section className="li-page-intro">
        <div><span className="li-eyebrow">Tím</span><h1>Výsledky tímu</h1><p>Výsledky, ktoré kolegovia zdieľajú s tímom. Svoje zdieľanie zapneš na stránke Testy pri každom výsledku.</p></div>
      </section>
      <nav className="ts-tabs" aria-label="Sekcie"><Link href="/testy">Testy</Link><Link href="/testy/tim" aria-current="page">Tím</Link>{isAdmin && <Link href="/testy/admin">Admin</Link>}</nav>
      {error && <p className="msg err">{error.message}</p>}
      {TEST_KEYS.map((k) => { const list = res.filter((r) => r.test_key === k); if (!list.length) return null; return (
        <section key={k} className="card ts-team">
          <h3>{TESTS[k].icon} {TESTS[k].title}</h3>
          <table><tbody>{list.map((r) => <tr key={r.id}><td>{r.name || 'Kolega'}</td><td><span className="ts-pill">{r.summary}</span></td><td className="muted">{new Date(r.created_at).toLocaleDateString('sk-SK')}</td></tr>)}</tbody></table>
        </section>
      ) })}
      {!res.length && <p className="card ts-empty">Zatiaľ nikto nezdieľal výsledok. Buď prvý: vyplň test a zapni „Zdieľať s tímom“.</p>}
    </Shell>
  )
}
