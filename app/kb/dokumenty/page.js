import Link from 'next/link'
import KbShell from '@/components/kb/KbShell'
import { requireTeam, STATUS, fmtD, reviewState } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dokumenty' }

export default async function Docs({ searchParams }) {
  const sp = await searchParams
  const grp = String(sp?.skupina || '')
  const { s, me } = await requireTeam()
  const { data: docs } = await s.rpc('kb_docs_list')
  const group = (p) => (p.startsWith('KB/KARTY/') ? 'Karty bytov' : 'Firemná báza a podklady')
  const all = docs || []
  const shown = all.filter((d) => !grp || group(d.path) === grp)
  return (
    <KbShell active="dokumenty" intro={{ eyebrow: 'Podklady', title: 'Dokumenty', text: 'Dokumenty z Drive a karty bytov.' }}>
      <div className="filters"><Link className={!grp ? 'on' : ''} href="/kb/dokumenty">Všetko ({all.length})</Link>{['Firemná báza a podklady', 'Karty bytov'].map((g) => <Link key={g} className={grp === g ? 'on' : ''} href={`/kb/dokumenty?skupina=${encodeURIComponent(g)}`}>{g} ({all.filter((d) => group(d.path) === g).length})</Link>)}</div>
      <table className="list">
        <thead><tr><th>Dokument</th><th>Zdroj</th><th>Stav</th><th>Kontrola</th><th>Aktualizované</th></tr></thead>
        <tbody>{shown.map((d) => { const rs = reviewState(d.next_review_at); return (
          <tr key={d.path}><td><Link href={`/kb/dokumenty/${d.path.split('/').map(encodeURIComponent).join('/')}`}>{d.title}</Link><br /><small style={{ color: 'var(--muted)' }}>{d.path}</small></td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{d.source}</td><td><span className={`status ${d.status}`}>{STATUS[d.status] || d.status}</span></td><td>{rs ? <span className={`review ${rs.cls}`}>{rs.text}</span> : '—'}</td><td>{fmtD(d.updated_at)}</td></tr>) })}</tbody>
      </table>
    </KbShell>
  )
}
