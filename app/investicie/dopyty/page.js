import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import { canInv, inqStatusLabel, isActiveInquiry } from '@/lib/inv-core'
import { budgetSummary } from '@/lib/inv-inquiry'
import { fmtDate } from '@/lib/fmt'
import '../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Investičné dopyty' }

export default async function InquiriesPage() {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/investicie/dopyty')
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  const [qr, mr] = await Promise.all([s.from('inv_inquiries').select('*').order('created_at', { ascending: false }).limit(500), s.from('inv_matches').select('inquiry_id,category,decision').limit(20000)])
  const qs = (qr && !qr.error && qr.data) || [], ms = (mr && !mr.error && mr.data) || []
  const leads = qs.length ? ((await s.from('leads').select('id,name').in('id', [...new Set(qs.map((q) => q.lead_id))])).data || []) : []
  const name = Object.fromEntries(leads.map((l) => [l.id, l.name]))
  const cnt = (id) => ms.filter((m) => m.inquiry_id === id && m.category === 'match' && m.decision !== 'rejected').length
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv">
        <div className="iv-head"><div><h1>Investičné dopyty</h1><p className="iv-sub">Dopyt sa vytvára pri existujúcom kontakte v CRM. Jeden kontakt môže mať viac dopytov.</p></div></div>
        <IvNav active="dopyty" isAdmin={isAdmin} />
        <div className="iv-list">
          {qs.map((q) => { const b = budgetSummary(q); return (
            <Link key={q.id} href={`/investicie/dopyt/${q.id}`} className="iv-row" style={{ gridTemplateColumns: 'minmax(220px,2fr) minmax(160px,2fr) 110px 110px auto' }}>
              <div><div className="t">{name[q.lead_id] || 'Klient'}</div><small>{q.label || 'bez názvu'}</small></div>
              <div><small>{b.text}{b.ambiguous ? ' · význam nepotvrdený' : ''}</small><small>{(q.cities || []).join(', ') || 'lokalita neznáma'}</small></div>
              <div><span className="n">{cnt(q.id)}</span><small>vhodných ponúk</small></div>
              <div><small>potvrdené</small><span className="n">{q.last_confirmed_at ? fmtDate(q.last_confirmed_at) : '—'}</span></div>
              <div><span className={`iv-pill ${isActiveInquiry(q) ? 'ok' : 'muted'}`}>{inqStatusLabel(q.status)}</span></div>
            </Link>) })}
          {!qs.length && <section className="card"><p>Zatiaľ žiadny investičný dopyt. Otvor kontakt v CRM a v sekcii „Investičné dopyty“ ho vytvor.</p></section>}
        </div>
      </div>
    </Shell>
  )
}
