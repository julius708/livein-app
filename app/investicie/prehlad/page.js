import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import { canInv, isActiveInquiry } from '@/lib/inv-core'
import { eur } from '@/lib/inv-fmt'
import { fmtDate, fmtDateTime } from '@/lib/fmt'
import '../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prehľad · Investície' }
const rows = (r) => (r && !r.error && r.data) || []

export default async function OverviewPage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/investicie/prehlad')
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  const mine = user.email.toLowerCase(), all = sp.all === '1'
  const inqAll = rows(await s.from('inv_inquiries').select('id,lead_id,label,status,owner_email,last_confirmed_at').order('created_at', { ascending: false }).limit(500))
  const inqs = inqAll.filter((q) => isActiveInquiry(q) && (all || (q.owner_email || '').toLowerCase() === mine))
  const ids = inqs.map((q) => q.id)
  const ms = ids.length ? rows(await s.from('inv_matches').select('id,inquiry_id,property_id,category,score,decision,needs_review,review_reason,first_matched_at,updated_at,result').in('inquiry_id', ids).order('updated_at', { ascending: false }).limit(1000)) : []
  const props = ms.length ? rows(await s.from('inv_properties').select('id,city,district,address,price,status,merged_into').in('id', [...new Set(ms.map((m) => m.property_id))])) : []
  const leads = inqs.length ? rows(await s.from('leads').select('id,name').in('id', [...new Set(inqs.map((q) => q.lead_id))])) : []
  const tasks = rows(await s.from('inv_tasks').select('*').eq('status', 'open').order('due', { nullsFirst: false }).limit(100)).filter((t) => all || (t.owner_email || '').toLowerCase() === mine)
  const cands = rows(await s.from('inv_merge_candidates').select('id,property_a,property_b,score').eq('status', 'pending').limit(50))
  const notifs = rows(await s.from('notifications').select('id,title,body,created_at,read_at').eq('kind', 'inv_match').ilike('user_email', mine).order('created_at', { ascending: false }).limit(10))
  const pBy = Object.fromEntries(props.map((p) => [p.id, p])), lBy = Object.fromEntries(leads.map((l) => [l.id, l])), qBy = Object.fromEntries(inqs.map((q) => [q.id, q]))
  const now = Date.now(), WEEK = 7 * 864e5
  const title = (m) => { const p = pBy[m.property_id], q = qBy[m.inquiry_id]; return `${(lBy[q.lead_id] || {}).name || 'Klient'} · ${[p.address || p.district, p.city].filter(Boolean).join(', ')}${p.price ? ' · ' + eur(p.price) : ''}` }
  const live = ms.filter((m) => pBy[m.property_id] && !pBy[m.property_id].merged_into && qBy[m.inquiry_id])
  const fresh = live.filter((m) => m.category === 'match' && ['open', 'review'].includes(m.decision) && now - Date.parse(m.first_matched_at) < 2 * WEEK)
  const review = live.filter((m) => m.needs_review)
  const gone = live.filter((m) => m.category === 'unavailable' && ['review', 'shortlist', 'viewing', 'offer'].includes(m.decision) && now - Date.parse(m.updated_at) < 3 * WEEK)
  const stale = inqs.filter((q) => !q.last_confirmed_at || now - Date.parse(q.last_confirmed_at) > 30 * 864e5)
  const Item = ({ m, extra }) => <div className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '8px 0' }}><span><Link href={`/investicie/dopyt/${m.inquiry_id}`} style={{ fontWeight: 700 }}>{title(m)}</Link><small className="iv-hint" style={{ display: 'block' }}>{extra || (m.result && m.result.rank_reason)}</small></span><span className="iv-pill ok">skóre {m.score}</span></div>
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv">
        <div className="iv-head"><div><h1>Prehľad investícií</h1><p className="iv-sub">Nové zhody, zmeny a úlohy {all ? 'celého tímu' : 'pre teba'}. {all ? <Link href="/investicie/prehlad">Len moje</Link> : <Link href="/investicie/prehlad?all=1">Celý tím</Link>}</p></div></div>
        <IvNav active="prehlad" isAdmin={isAdmin} badge={fresh.length + review.length + gone.length} />
        {notifs.some((n) => !n.read_at) && <section className="card"><h2>Posledné upozornenia</h2>{notifs.slice(0, 4).map((n) => <div key={n.id} className="iv-hint" style={{ whiteSpace: 'pre-line' }}><b>{n.title}</b> · {fmtDateTime(n.created_at)}{n.body ? `\n${n.body}` : ''}</div>)}</section>}
        <section className="card"><h2>Nové vhodné zhody ({fresh.length})</h2>{fresh.slice(0, 20).map((m) => <Item key={m.id} m={m} />)}{!fresh.length && <p className="iv-hint">Žiadna nová zhoda za posledné dva týždne.</p>}</section>
        {review.length > 0 && <section className="card"><h2>Zamietnuté, ale zmenené: na opätovné posúdenie ({review.length})</h2>{review.map((m) => <Item key={m.id} m={m} extra={m.review_reason} />)}</section>}
        {gone.length > 0 && <section className="card"><h2>Už nedostupné pri aktívnych dopytoch ({gone.length})</h2>{gone.map((m) => <Item key={m.id} m={m} extra={`Stav nehnuteľnosti: ${pBy[m.property_id].status}`} />)}</section>}
        <section className="card"><h2>Úlohy ({tasks.length})</h2>{tasks.map((t) => <div key={t.id} className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '6px 0' }}><span>{t.title}{t.due ? ` · do ${fmtDate(t.due)}` : ''}</span>{t.inquiry_id ? <Link href={`/investicie/dopyt/${t.inquiry_id}`}>dopyt</Link> : t.property_id ? <Link href={`/investicie/n/${t.property_id}`}>nehnuteľnosť</Link> : null}</div>)}{!tasks.length && <p className="iv-hint">Žiadne otvorené úlohy.</p>}</section>
        {cands.length > 0 && <section className="card"><h2>Možné duplicity na zlúčenie ({cands.length})</h2>{cands.map((c) => <div key={c.id}><Link href={`/investicie/n/${c.property_a}`}>Skontrolovať dvojicu (zhoda {c.score} %)</Link></div>)}</section>}
        {stale.length > 0 && <section className="card"><h2>Dopyty na potvrdenie aktuálnosti ({stale.length})</h2><p className="iv-hint">Záujem klienta nebol potvrdený viac ako 30 dní (alebo vôbec).</p>{stale.map((q) => <div key={q.id}><Link href={`/investicie/dopyt/${q.id}`}>{(lBy[q.lead_id] || {}).name || 'Klient'} · {q.label || 'dopyt'}</Link> <small className="iv-hint">{q.last_confirmed_at ? `naposledy ${fmtDate(q.last_confirmed_at)}` : 'nepotvrdené'}</small></div>)}</section>}
      </div>
    </Shell>
  )
}
