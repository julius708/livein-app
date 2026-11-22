import Link from 'next/link'
import { notFound } from 'next/navigation'
import KbShell from '@/components/kb/KbShell'
import Flow from '@/components/kb/Flow'
import PrintButton from '@/components/kb/PrintButton'
import { requireTeam, STATUS, fmtD } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'

export default async function MapDetail({ params }) {
  const { id } = await params
  const { s, me } = await requireTeam()
  const [{ data: f }, { data: rules }] = await Promise.all([s.rpc('kb_flow_get', { p_id: id }), s.rpc('kb_rules')])
  if (!f || !f.id) notFound()
  return (
    <KbShell active="mapy" intro={{ eyebrow: f.category, title: f.title, text: `${f.nodes.length} krokov · stav ${STATUS[f.status]} · verzia ${f.version}${f.source ? ` · zdroj: ${f.source}` : ''}` }}>
      <section className="card"><Flow nodes={f.nodes} /></section>
      <details className="rules" style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--ch)' }}>Pravidlá, ktoré platia pri každej mape</summary><ul style={{ marginTop: 8 }}>{(rules || []).map((r) => <li key={r.id}>{r.text}</li>)}</ul></details>
      <div className="actions"><PrintButton /><Link className="mini" href="/kb/mapy">← Všetky mapy</Link><span className="hint">Aktualizované {fmtD(f.updated_at)}</span></div>
    </KbShell>
  )
}
