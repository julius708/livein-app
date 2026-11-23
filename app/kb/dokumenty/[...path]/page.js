import Link from 'next/link'
import { notFound } from 'next/navigation'
import KbShell from '@/components/kb/KbShell'
import DocReview from '@/components/kb/DocReview'
import PrintButton from '@/components/kb/PrintButton'
import { requireTeam, STATUS, fmtD, reviewState } from '@/lib/kb-viewer'
import { mdToHtml } from '@/lib/kb-md'

export const dynamic = 'force-dynamic'

export default async function DocDetail({ params }) {
  const { path } = await params
  const p = path.map(decodeURIComponent).join('/')
  const { s, me, isAdmin } = await requireTeam()
  const { data } = await s.rpc('kb_doc_get', { p_path: p })
  const doc = data && data[0]
  if (!doc) notFound()
  const rs = reviewState(doc.next_review_at)
  const looksMd = /^#|\n#|\n- |\n\* /.test(doc.content || '')
  return (
    <KbShell active="dokumenty">
      <article className="doc">
        <h1>{doc.title}</h1>
        <div className="meta"><span className={`status ${doc.status}`}>{STATUS[doc.status] || doc.status}</span><span>Zdroj <b>{doc.source || '—'}</b></span><span>Posledná kontrola <b>{fmtD(doc.reviewed_at) || '—'}</b></span>{rs && <span className={`review ${rs.cls}`}>{rs.text}</span>}{(doc.tags || []).length > 0 && <span>Témy: {doc.tags.join(', ')}</span>}</div>
        {looksMd ? <div className="body" dangerouslySetInnerHTML={{ __html: mdToHtml(doc.content) }} /> : <div className="body"><pre>{doc.content}</pre></div>}
        <div className="foot"><span>Interný dokument — Nezdieľať externe</span><span>{doc.path} · {fmtD(doc.updated_at)}</span></div>
      </article>
      <div className="actions"><PrintButton /><Link className="mini" href="/kb/dokumenty">← Všetky dokumenty</Link></div>
      {isAdmin && <section className="card"><h2>Stav a kontrola</h2><DocReview doc={doc} /></section>}
    </KbShell>
  )
}
