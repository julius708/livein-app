import Link from 'next/link'
import { notFound } from 'next/navigation'
import KbShell from '@/components/kb/KbShell'
import SopForm from '@/components/kb/SopForm'
import PrintButton from '@/components/kb/PrintButton'
import { requireTeam, STATUS, fmtD, reviewState } from '@/lib/kb-viewer'
import { mdToHtml } from '@/lib/kb-md'

export const dynamic = 'force-dynamic'

export default async function SopDetail({ params, searchParams }) {
  const { slug } = await params
  const sp = await searchParams
  const { s, me, user, isAdmin } = await requireTeam()
  const { data: sop } = await s.rpc('kb_sop_get', { p_slug: slug })
  if (!sop || !sop.id) notFound()
  const { data: versions } = await s.rpc('kb_sop_versions', { p_slug: slug })
  const canEdit = isAdmin || (sop.owner_email && sop.owner_email.toLowerCase() === user.email.toLowerCase())
  const rs = reviewState(sop.next_review_at)
  const edit = sp?.upravit === '1' && canEdit
  return (
    <KbShell active="sop">
      <article className="doc">
        <h1>{sop.title}</h1>
        <div className="meta">
          <span className={`status ${sop.status}`}>{STATUS[sop.status]}</span>
          <span>Verzia <b>{sop.version}</b></span>
          <span>Vlastník <b>{sop.owner || '—'}</b></span>
          <span>Posledná kontrola <b>{fmtD(sop.reviewed_at) || '—'}</b></span>
          {rs && <span className={`review ${rs.cls}`}>{rs.text}</span>}
          {sop.todo && <span className="todo">Bude doplnené</span>}
          {(sop.tags || []).length > 0 && <span>Témy: {sop.tags.join(', ')}</span>}
        </div>
        <div className="body" dangerouslySetInnerHTML={{ __html: mdToHtml(sop.body_md) || '<p><mark class="doplnit">DOPLNIŤ</mark> Text postupu ešte nie je napísaný.</p>' }} />
        <div className="foot"><span>Interný dokument — Nezdieľať externe</span><span>LIVE-IN International · SOP {sop.slug} v{sop.version} · {fmtD(sop.updated_at)}</span></div>
      </article>
      <div className="actions">
        <PrintButton />
        {canEdit && !edit && <Link className="mini" href={`/kb/sop/${slug}?upravit=1`}>Upraviť</Link>}
        {edit && <Link className="mini" href={`/kb/sop/${slug}`}>Zrušiť úpravu</Link>}
        <Link className="mini" href="/kb/sop">← Všetky SOP</Link>
      </div>
      {edit && <section className="card"><h2>Úprava SOP</h2><p className="sub">Zmena textu zvýši verziu a uloží sa do histórie. Schváliť môže len admin.</p><SopForm sop={sop} isAdmin={isAdmin} me={me} /></section>}
      {versions && versions.length > 0 && (
        <section className="card"><h2>História verzií</h2>
          <ul className="versions">{versions.map((v) => <li key={v.id}>v{v.version} · {fmtD(v.created_at)} · {v.changed_by}{v.change_note ? ` · ${v.change_note}` : ''}</li>)}</ul>
        </section>
      )}
    </KbShell>
  )
}
