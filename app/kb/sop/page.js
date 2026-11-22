import Link from 'next/link'
import KbShell from '@/components/kb/KbShell'
import { requireTeam, STATUS, fmtD, reviewState } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SOP' }

export default async function SopList() {
  const { s, me, isAdmin } = await requireTeam()
  const { data: sops, error } = await s.rpc('kb_sops_list')
  return (
    <KbShell active="sop" intro={{ eyebrow: 'Postupy', title: 'SOP', text: 'Vlastník, stav a termín kontroly pri každom postupe.', aside: isAdmin ? <Link className="li-shortcut" href="/kb/sop/novy">+ Nový SOP</Link> : null }}>
      {error && <p className="msg err">{error.message}</p>}
      {sops && sops.length === 0 && <p className="hint" style={{ marginTop: 16 }}>Zatiaľ žiadny SOP. {isAdmin ? 'Založ prvý tlačidlom „Nový SOP“.' : 'Admin ich môže založiť.'}</p>}
      {sops && sops.length > 0 && (
        <table className="list">
          <thead><tr><th>Názov</th><th>Stav</th><th>Verzia</th><th>Vlastník</th><th>Posledná kontrola</th><th>Ďalšia kontrola</th></tr></thead>
          <tbody>
            {sops.map((x) => { const rs = reviewState(x.next_review_at); return (
              <tr key={x.id}>
                <td><Link href={`/kb/sop/${x.slug}`}>{x.title}</Link>{x.todo && <> <span className="todo">Bude doplnené</span></>}{x.city ? <small style={{ color: 'var(--muted)' }}> · {x.city}</small> : null}</td>
                <td><span className={`status ${x.status}`}>{STATUS[x.status]}</span></td>
                <td>v{x.version}</td>
                <td>{x.owner || '—'}</td>
                <td>{fmtD(x.reviewed_at) || '—'}</td>
                <td>{rs ? <span className={`review ${rs.cls}`}>{rs.text}</span> : '—'}</td>
              </tr>) })}
          </tbody>
        </table>
      )}
    </KbShell>
  )
}
