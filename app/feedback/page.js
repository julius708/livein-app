import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { KINDS, STATUSES } from '@/lib/feedback'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import FeedbackForm from '@/components/FeedbackForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feedback' }

export default async function FeedbackPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const { data: mine } = await s.from('feedback').select('*').eq('user_email', user.email.toLowerCase()).order('created_at', { ascending: false }).limit(30)
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="feedback" hideFooter>
      <section className="card">
        <h2>Feedback k novej appke</h2>
        <p className="sub">Testujeme. Napíš, čo funguje, čo nie a čo ti chýba. Ide to priamo Júliusóvi a vyhodnocujeme to postupne.</p>
        <FeedbackForm />
      </section>
      {mine && mine.length > 0 && (
        <section className="card">
          <h2>Tvoje správy</h2>
          <div className="fblist">
            {mine.map((f) => (
              <div className="fbitem" key={f.id}>
                <div className="fbhead"><span>{KINDS[f.kind]?.icon} {KINDS[f.kind]?.label}</span><span className="tag">{STATUSES[f.status] || f.status}</span></div>
                <p>{f.message}</p>
                <small>{new Date(f.created_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' })}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </Shell>
  )
}
