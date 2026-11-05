import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import NewsletterApp from '@/components/newsletter/NewsletterApp'
import { mailReady } from '@/lib/mailer'
import { adminReady } from '@/lib/supabase-admin'
import './newsletter.css'
import '../ekonomika/ekonomika.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const metadata = { title: 'Newsletter' }

export default async function NewsletterPage({ searchParams }) {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!(me.roles || []).includes('newsletter')) return <Shell me={me} user={user} isAdmin={isAdmin} active="newsletter" hideFooter><section className="card eko-locked"><h2>Newsletter pripravujú Július a Simona</h2><p>Ak potrebuješ prístup, napíš Júliusovi.</p></section></Shell>
  const sp = await searchParams
  const [{ data: list }, { count: unsubs }] = await Promise.all([
    s.from('newsletters').select('id,subject,preheader,status,audience,recipients_count,sent_count,failed_count,test_sent_at,sent_at,created_by_name,created_at,updated_at').order('created_at', { ascending: false }).limit(60),
    s.from('newsletter_unsubscribes').select('email', { count: 'exact', head: true }),
  ])
  let open = null
  if (sp?.id) { const { data } = await s.from('newsletters').select('*').eq('id', sp.id).maybeSingle(); open = data }
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="newsletter" guruApp="newsletter" hideFooter>
      <NewsletterApp list={list || []} open={open} me={{ email: user.email.toLowerCase(), name: me.name || '' }} status={{ mail: mailReady(), bot: adminReady(), ai: !!process.env.ANTHROPIC_API_KEY, unsubs: unsubs || 0 }} />
    </Shell>
  )
}
