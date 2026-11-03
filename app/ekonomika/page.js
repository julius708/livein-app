import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import Economy from '@/components/economy/Economy'
import './ekonomika.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ekonomika' }

/** Ekonomika bytov: výnosy, obsadenosť, kanály, porovnania, výhľad a bankové toky. Dáta vidí len vedenie (RLS v databáze). */
export default async function EconomyPage() {
  const { user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="ekonomika" guruApp="economy" hideFooter>
      {isAdmin ? <Economy name={me.name || ''} /> : (
        <section className="card eko-locked"><h2>Ekonomika je len pre vedenie</h2><p>Finančné čísla firmy vidia iba adminky a admini. Ak ich potrebuješ, napíš Júliusovi.</p></section>
      )}
    </Shell>
  )
}
