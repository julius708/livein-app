import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { TEST_KEYS } from '@/lib/personality-tests'
import { byPerson } from '@/lib/personality-team'
import TeamBoard from '@/components/TeamBoard'
import '../testy.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tím · Testy osobnosti' }

export default async function TeamPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const cols = 'id,user_id,name,test_key,scores,summary,shared,created_at'
  const [{ data: shared, error }, { data: own }] = await Promise.all([
    s.from('personality_results').select(cols).eq('shared', true),
    s.from('personality_results').select(cols).eq('user_id', user.id),
  ])
  // Vlastné výsledky vidím na mape aj bez zdieľania; kolegovia vidia len to, čo zdieľam.
  const people = byPerson([...(shared || []), ...(own || [])])
  const nTests = TEST_KEYS.filter((k) => people.some((p) => p.by[k])).length
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="testy" hideFooter>
      <section className="li-page-intro">
        <div><span className="li-eyebrow">Tím</span><h1>Ako sa dopĺňame</h1><p>Mapa tímu z výsledkov, ktoré kolegovia zdieľajú. Klikni na človeka, porovnaj sa s ním a zisti, v čom ste si podobní a v čom sa dopĺňate. Svoje zdieľanie zapneš na stránke Testy.</p></div>
        <span className="li-shortcut">👥 {people.length} ľudí · {nTests} testov</span>
      </section>
      <nav className="ts-tabs" aria-label="Sekcie"><Link href="/testy">Testy</Link><Link href="/testy/tim" aria-current="page">Tím</Link>{isAdmin && <Link href="/testy/admin">Admin</Link>}</nav>
      {error && <p className="msg err">{error.message}</p>}
      <TeamBoard people={people} meId={user.id} />
    </Shell>
  )
}
