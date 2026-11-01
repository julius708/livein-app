import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IdeasBoard from '@/components/IdeasBoard'
import './napady.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nápady na obsah' }

export default async function IdeasPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const { data: ideas, error } = await s.from('content_ideas').select('id,created_at,author_name,title,description,status,script').order('created_at', { ascending: false }).limit(500)
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="ideas" hideFooter>
      <section className="ideas-hero">
        <div className="kick">LIVE-IN</div>
        <h1>Nápady na obsah</h1>
        <p>Stala sa dnes niečo, čo by stálo za krátke video? Zapíš to za pár sekúnd. Marketing z nápadov píše scenáre.</p>
      </section>
      {error && <p className="msg err">{error.message}</p>}
      <IdeasBoard ideas={ideas || []} />
    </Shell>
  )
}
