import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { TESTS, TEST_KEYS, latest } from '@/lib/personality-tests'
import ResultCard from '@/components/TestResult'
import CsvButton from '@/components/TestsCsv'
import '../testy.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · Testy osobnosti' }

export default async function AdminPage({ searchParams }) {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!isAdmin) redirect('/testy')
  const sp = await searchParams
  const sel = sp && sp.u ? String(sp.u) : ''
  const { data: rows, error } = await s.from('personality_results').select('id,user_id,email,name,test_key,scores,summary,shared,created_at').order('created_at', { ascending: false })
  const res = latest(rows || [])
  const people = {}
  for (const r of res) { if (!people[r.user_id]) people[r.user_id] = { id: r.user_id, name: r.name, email: r.email, by: {} }; people[r.user_id].by[r.test_key] = r }
  const list = Object.values(people).sort((a, b) => String(a.name).localeCompare(String(b.name), 'sk'))
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="testy" hideFooter>
      <section className="li-page-intro">
        <div><span className="li-eyebrow">Vedenie</span><h1>Všetky výsledky</h1><p>Admin vidí všetky výsledky všetkých ľudí. Zdieľanie s tímom to neovplyvňuje.</p></div>
        <CsvButton rows={res} />
      </section>
      <nav className="ts-tabs" aria-label="Sekcie"><Link href="/testy">Testy</Link><Link href="/testy/tim">Tím</Link><Link href="/testy/admin" aria-current="page">Admin</Link></nav>
      {error && <p className="msg err">{error.message}</p>}
      {sel ? (
        <>
          <p><Link href="/testy/admin">← Späť na zoznam</Link></p>
          <h2>{people[sel] ? people[sel].name : ''} <small className="muted">{people[sel] ? people[sel].email : ''}</small></h2>
          {res.filter((r) => r.user_id === sel).map((r) => <ResultCard key={r.id} row={r} />)}
        </>
      ) : (
        <div className="card ts-scroll">
          <table className="ts-table">
            <thead><tr><th>Meno</th><th>Hotové</th>{TEST_KEYS.map((k) => <th key={k}>{TESTS[k].title}</th>)}</tr></thead>
            <tbody>{list.map((p) => <tr key={p.id}><td><Link href={'/testy/admin?u=' + p.id}>{p.name || p.email}</Link></td><td>{Object.keys(p.by).length} / {TEST_KEYS.length}</td>{TEST_KEYS.map((k) => <td key={k}>{p.by[k] ? p.by[k].summary : <span className="muted">–</span>}</td>)}</tr>)}</tbody>
          </table>
          {!list.length && <p className="ts-empty">Zatiaľ žiadne výsledky.</p>}
        </div>
      )}
    </Shell>
  )
}
