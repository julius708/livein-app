import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import { TESTS, latest } from '@/lib/personality-tests'
import { teamAverage } from '@/lib/personality-team'
import TestRunner from '@/components/TestRunner'
import '../testy.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { key } = await params
  return { title: TESTS[key] ? TESTS[key].title + ' · Testy osobnosti' : 'Testy osobnosti' }
}

export default async function TestPage({ params }) {
  const { key } = await params
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const T = TESTS[key]
  if (!T) notFound()
  // Priemer tímu zo zdieľaných výsledkov (ukáže sa vo výsledku ako prerušovaná čiara).
  const { data: shared } = await s.from('personality_results').select('user_id,test_key,scores,created_at').eq('shared', true).eq('test_key', key)
  const team = latest(shared || [])
  const teamAvg = team.length >= 2 ? teamAverage(key, team) : null
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="testy" hideFooter>
      <nav className="ts-tabs" aria-label="Sekcie"><Link href="/testy">← Všetky testy</Link></nav>
      <TestRunner testKey={key} title={T.title} icon={T.icon} items={T.items} teamAvg={teamAvg} />
    </Shell>
  )
}
