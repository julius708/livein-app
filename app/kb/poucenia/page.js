import KbShell from '@/components/kb/KbShell'
import LessonForm from '@/components/kb/LessonForm'
import { requireTeam, STATUS, fmtD } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Poučenia' }

export default async function Lessons() {
  const { s, me } = await requireTeam()
  const { data: rows } = await s.rpc('kb_lessons_list')
  return (
    <KbShell active="poucenia" intro={{ eyebrow: 'Učíme sa', title: 'Poučenia', text: 'Čo sa stalo a čo zmeniť.' }}>
      <section className="card"><h2>Pridať poučenie</h2><LessonForm /></section>
      <section className="card"><h2>Záznamy</h2>
        {(rows || []).length === 0 && <p className="hint">Zatiaľ žiadne poučenie.</p>}
        <ul className="faq-list">{(rows || []).map((l) => <li key={l.id}><details open><summary>{l.what_happened.slice(0, 120)}</summary><div className="a"><b>Čo sa stalo:</b> {l.what_happened}{l.what_to_change ? <><br /><b>Čo zmeniť:</b> {l.what_to_change}</> : null}</div><div className="m"><span className={`status ${l.status}`}>{STATUS[l.status] || l.status}</span> · {l.created_by} · {fmtD(l.created_at)}{l.source ? ` · ${l.source}` : ''}</div></details></li>)}</ul>
      </section>
    </KbShell>
  )
}
