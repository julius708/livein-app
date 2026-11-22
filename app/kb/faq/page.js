import KbShell from '@/components/kb/KbShell'
import { requireTeam, fmtD } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'FAQ pre hostí' }

export default async function Faq() {
  const { s, me } = await requireTeam()
  const { data: qa } = await s.rpc('kb_faq_list')
  return (
    <KbShell active="faq" intro={{ eyebrow: 'Zákaznícky servis', title: 'FAQ pre hostí', text: 'Odpovede pre hostí so zdrojom a dátumom. Kódy a heslá vidí len tím.' }}>
      <ul className="faq-list">
        {(qa || []).map((x) => (
          <li key={x.id} id={`q${x.id}`}>
            <details><summary>{x.question}</summary>
              <div className="a">{x.answer}</div>
              <div className="m">{x.status ? `stav: ${x.status} · ` : ''}{x.created_by ? `${x.created_by} · ` : ''}{fmtD(x.updated_at)}{(x.tags || []).length ? ` · ${x.tags.join(', ')}` : ''}</div>
            </details>
          </li>
        ))}
      </ul>
      {(qa || []).length === 0 && <p className="hint" style={{ marginTop: 14 }}>Zatiaľ žiadne otázky.</p>}
    </KbShell>
  )
}
