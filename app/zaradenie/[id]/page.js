import Link from 'next/link'
import { notFound } from 'next/navigation'
import OnbShell from '@/components/onb/OnbShell'
import StepRow from '@/components/onb/StepRow'
import ListingForm from '@/components/onb/ListingForm'
import UnitForm from '@/components/onb/UnitForm'
import { requireOnboarding, STATUS, TYPES, ZONES, fmtD } from '@/lib/onb-viewer'
import { projectMembers, unitSubtasks, asanaConfigured } from '@/lib/onb-asana'
import { retryAsana } from './actions'

export const dynamic = 'force-dynamic'

export default async function UnitDetail({ params, searchParams }) {
  const { id } = await params
  const sp = await searchParams
  const tab = String(sp?.karta || 'checklist')
  const { s, me, can, canOwner } = await requireOnboarding()
  if (!can) return <OnbShell me={me}><p className="msg err" style={{ marginTop: 20 }}>Zaradenie bytov je pre roly admin, operations a onboarding.</p></OnbShell>
  let { data: u } = await s.rpc('onb_unit_get', { p_id: id })
  if (!u || !u.id) notFound()
  // Asana je zdroj pravdy: stav podúloh sa načíta (cache 10 min) a zapíše do appky
  const sub = await unitSubtasks(u.asana_task_gid)
  if (sub && sub.length) {
    const changed = sub.filter((x) => { const st = u.steps.find((y) => y.asana_gid === x.gid); return st && ((st.status === 'done') !== x.completed || (st.assignee || null) !== x.assignee || (st.due_on || null) !== x.due_on) })
    if (changed.length) { await s.rpc('onb_steps_sync', { p_unit_id: id, p_rows: changed }); ({ data: u } = await s.rpc('onb_unit_get', { p_id: id })) }
  }
  const members = await projectMembers()
  const done = u.steps.filter((x) => x.status === 'done').length, pct = u.steps.length ? Math.round((done / u.steps.length) * 100) : 0
  return (
    <OnbShell me={me} active="home" intro={{ eyebrow: `${u.city || ''} · ${TYPES[u.unit_type]}`, title: u.address, text: `${STATUS[u.status]} · ${pct} % hotovo (${done}/${u.steps.length}) · zodpovedá ${u.responsible || '—'}${u.planned_launch ? ` · spustenie ${fmtD(u.planned_launch)}` : ''}`, aside: u.asana_url ? <a className="li-shortcut" href={u.asana_url} target="_blank" rel="noreferrer">Otvoriť v Asane ↗</a> : null }}>
      {sp?.asana && <p className="msg err">Byt je uložený, ale Asana zlyhala: {sp.asana}. Skús „Vytvoriť v Asane“ nižšie.</p>}
      {!u.asana_task_gid && (
        <form action={retryAsana} className="msg info" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="id" value={u.id} /><span>Tento byt ešte nie je v Asane.</span><button className="mini" disabled={!asanaConfigured()}>Vytvoriť v Asane</button>
        </form>
      )}
      <div className="tabs"><Link className={tab === 'checklist' ? 'on' : ''} href={`/zaradenie/${u.id}`}>Checklist</Link><Link className={tab === 'listing' ? 'on' : ''} href={`/zaradenie/${u.id}?karta=listing`}>Údaje pre listing</Link><Link className={tab === 'byt' ? 'on' : ''} href={`/zaradenie/${u.id}?karta=byt`}>Byt a majiteľ</Link><Link href={`/zaradenie/${u.id}/dizajn`}>🎨 Dizajn</Link></div>
      {tab === 'checklist' && (
        <section className="card">
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <ul className="steps">{u.steps.map((st) => <StepRow key={st.id} step={st} members={members} taskGid={u.asana_task_gid || ''} />)}</ul>
          <p className="hint" style={{ marginTop: 10 }}>Odkliknutie sa hneď zapíše do podúlohy v Asane. Zmeny urobené v Asane sa sem načítajú do 10 minút.</p>
        </section>
      )}
      {tab === 'listing' && <section className="card"><h2>Údaje pre listing</h2><p className="sub">Všetko, čo treba na založenie listingu, bez opätovného zadávania. Ukladá sa k bytu.</p><ListingForm unit={u} /></section>}
      {tab === 'byt' && (
        <div className="side">
          <section className="card"><h2>Byt</h2>
            <div className="kv"><b>Adresa</b><span>{u.address}</span><b>Mesto</b><span>{u.city} {u.zip}</span><b>City tax</b><span>{ZONES[u.city_tax_zone] || u.city_tax_zone}</span><b>Typ</b><span>{TYPES[u.unit_type]}</span><b>Založil/a</b><span>{u.created_by} · {fmtD(u.created_at)}</span></div>
            {u.lat && <div className="map"><iframe title="Mapa" src={`https://www.openstreetmap.org/export/embed.html?bbox=${u.lng - 0.004},${u.lat - 0.002},${u.lng + 0.004},${u.lat + 0.002}&layer=mapnik&marker=${u.lat},${u.lng}`} loading="lazy" /></div>}
          </section>
          <section className="card"><h2>Nastavenia bytu</h2><UnitForm unit={u} members={members} canOwner={canOwner} /></section>
        </div>
      )}
    </OnbShell>
  )
}
