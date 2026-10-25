import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import GuruChat from '@/components/GuruChat'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'LIVE-IN Guru' }

export default async function GuruPage({ searchParams }) {
  const sp = await searchParams
  const { user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="guru" hideFooter>
      <section className="guru">
        <div className="gh">
          <h1>🧠 LIVE-IN Guru</h1>
          <p>Opýtaj sa na čokoľvek: na naše byty, rezervácie, Práčovňu a nástenku, alebo úplne všeobecne – texty, preklady, rady. Učí sa z otázok celého tímu a odpovedá podľa tvojich oprávnení.</p>
        </div>
        <GuruChat initial={sp && typeof sp.q === 'string' ? sp.q.slice(0, 500) : ''} />
      </section>
    </Shell>
  )
}
