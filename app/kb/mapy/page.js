import Link from 'next/link'
import KbShell from '@/components/kb/KbShell'
import { requireTeam, STATUS } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mapy problémov' }

export default async function Maps({ searchParams }) {
  const sp = await searchParams
  const cat = String(sp?.kat || '')
  const { s, me } = await requireTeam()
  const [{ data: flows }, { data: rules }, { data: conflicts }] = await Promise.all([s.rpc('kb_flows_list'), s.rpc('kb_rules'), s.rpc('kb_conflicts')])
  const cats = [...new Set((flows || []).map((f) => f.category))]
  const shown = (flows || []).filter((f) => !cat || f.category === cat)
  return (
    <KbShell active="mapy" intro={{ eyebrow: 'Troubleshooting', title: 'Mapy problémov', text: 'Čo robiť, keď hosť niečo nahlási. Chýbajúce kroky sú označené DOPLNIŤ.' }}>
      <section className="rules"><h3>Pravidlá, ktoré platia pri každej mape</h3><ul>{(rules || []).map((r) => <li key={r.id}>{r.text}</li>)}</ul></section>
      {conflicts && conflicts.length > 0 && (
        <section className="conf"><h3>Rozpory v zdrojoch, ktoré treba rozhodnúť</h3>
          <ul>{conflicts.map((c) => <li key={c.id}><b>{c.topic}</b>: {c.sources}{c.proposed_decision ? ` → návrh: ${c.proposed_decision}` : ''}{c.owner ? ` (rozhoduje ${c.owner})` : ''} <span className={`status ${c.status}`}>{STATUS[c.status] || c.status}</span></li>)}</ul>
        </section>
      )}
      <div className="legend"><span><i className="sw" style={{ background: '#173E2C' }} />Začiatok / výsledok</span><span><i className="sw" />Krok</span><span><i className="sw" style={{ borderColor: '#F46D16', borderWidth: 2 }} />Otázka, rozhodnutie</span><span><i className="sw" style={{ background: '#EFE6DC', borderColor: '#70513E' }} />Eskalácia</span><span><i className="sw" style={{ background: '#FFF1E6', border: '2px dashed #A8420B' }} />DOPLNIŤ</span></div>
      <div className="filters"><Link className={!cat ? 'on' : ''} href="/kb/mapy">Všetko ({(flows || []).length})</Link>{cats.map((c) => <Link key={c} className={cat === c ? 'on' : ''} href={`/kb/mapy?kat=${encodeURIComponent(c)}`}>{c}</Link>)}</div>
      <div className="maps">
        {shown.map((f) => <Link key={f.id} href={`/kb/mapy/${f.id}`}><b>{f.title}</b><span>{f.category} · {f.steps} krokov · <span className={`status ${f.status}`}>{STATUS[f.status]}</span></span></Link>)}
      </div>
    </KbShell>
  )
}
