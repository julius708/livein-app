import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import IvNav from '@/components/investicie/Nav'
import { StatusPill } from '@/components/investicie/ui'
import { canInv, freshness, fold } from '@/lib/inv-core'
import { eur, pct1 } from '@/lib/inv-fmt'
import { fmtDate } from '@/lib/fmt'
import { loadSettings } from '@/lib/inv-store'
import { evaluateThresholds } from '@/lib/inv-calc'
import '../investicie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Porovnanie · Investície' }
const uuid = (x) => /^[0-9a-f-]{36}$/i.test(x)

export default async function ComparePage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/investicie')
  if (blocked) return <NoAccess email={user.email} />
  if (!canInv(me)) redirect('/investicie')
  const ids = String(sp.ids || '').split(',').filter(uuid).slice(0, 4)
  const qid = uuid(String(sp.q || '')) ? sp.q : null
  const props = ids.length ? ((await s.from('inv_properties').select('*').in('id', ids)).data || []) : []
  const calcs = props.length ? ((await s.from('inv_calcs').select('id,version,result').in('id', props.map((p) => p.calc_id).filter(Boolean))).data || []) : []
  const matches = qid && props.length ? ((await s.from('inv_matches').select('*').eq('inquiry_id', qid).in('property_id', ids)).data || []) : []
  const settings = await loadSettings(s)
  const cols = ids.map((id) => props.find((p) => p.id === id)).filter(Boolean).map((p) => ({ p, c: (calcs.find((c) => c.id === p.calc_id) || {}).result || null, v: (calcs.find((c) => c.id === p.calc_id) || {}).version, m: matches.find((m) => m.property_id === p.id) }))
  const now = Date.now()
  const rows = [
    ['Stav', (x) => <StatusPill status={x.p.status} />],
    ['Cena', (x) => (x.p.price ? eur(x.p.price) : '—')],
    ['Dispozícia · výmera (interiér)', (x) => [x.p.rooms ? `${x.p.rooms}-izb.` : '—', x.p.area_interior ? `${String(x.p.area_interior).replace('.', ',')} m²` : 'neznáma'].join(' · ')],
    ['Exteriér (balkón, terasa)', (x) => (x.p.area_exterior ? `${String(x.p.area_exterior).replace('.', ',')} m²` : 'neznámy / žiadny')],
    ['Celková investícia', (x) => x.c ? <><b>{eur(x.c.investment.known_total)}</b>{!x.c.investment.complete && <small className="iv-unknown" style={{ display: 'block' }}>aspoň; chýba: {x.c.investment.unknown.map((u) => u.label.toLowerCase()).join(', ')}</small>}</> : '—'],
    ['Rekonštrukcia + zariadenie + sprevádzkovanie', (x) => (x.c ? eur(x.c.investment.items.filter((i) => ['reno', 'furnishing', 'setup'].includes(i.key)).reduce((t, i) => t + (i.amount || 0), 0)) + (x.c.investment.items.some((i) => ['reno', 'furnishing', 'setup'].includes(i.key) && i.amount == null) ? ' (aspoň)' : '') : '—')],
    ['Rozpočet klienta', (x) => (x.m && x.m.result && x.m.result.budget ? <span className={`iv-pill ${x.m.result.budget.status === 'within' ? 'ok' : x.m.result.budget.status === 'over' ? 'bad' : 'warn'}`}>{x.m.result.budget.status === 'within' ? `v rozpočte, rezerva ${eur(x.m.result.budget.margin)}` : x.m.result.budget.status === 'over' ? `prekročený o ${eur(x.m.result.budget.over_by)}` : x.m.result.budget.status === 'unverified' ? 'neoverený (chýbajú náklady)' : 'neznámy'}</span> : '—')],
    ['Čistý prevádzkový výsledok / rok (základný scenár)', (x) => (x.c && x.c.metrics.base ? <>{eur(x.c.metrics.base.noi_year)}{x.c.metrics.base.provisional && <small className="iv-unknown" style={{ display: 'block' }}>predbežne</small>}</> : 'nepočíta sa')],
    ['Výnos z celkovej investície: konzervatívny / základný / optimistický', (x) => (x.c && x.c.metrics.base ? ['conservative', 'base', 'optimistic'].map((k) => pct1(x.c.metrics[k] && x.c.metrics[k].yield_total_pct)).join(' / ') : '—')],
    ['Bod zvratu (obsadenosť, základný)', (x) => (x.c && x.c.metrics.base ? (x.c.metrics.base.break_even_occupancy == null ? 'nedosiahnuteľný' : pct1(x.c.metrics.base.break_even_occupancy)) : '—')],
    ['Cashflow po splátkach (úver klienta)', (x) => { const f = x.m && x.m.result && x.m.result.financing; const b = x.m && x.m.result && x.m.result.metrics_base; return f && b && b.cashflow_month != null ? `${eur(b.cashflow_month)}/mes.` : f ? 'neznáme (chýba sadzba)' : 'bez úveru' }],
    ['Výhodnosť voči firemným kritériám', (x) => (x.c ? evaluateThresholds(x.c, (settings.calc || {}).thresholds).label : '—')],
    ['Zhoda s klientom (skóre)', (x) => (x.m ? <>{x.m.score} <small>{x.m.category === 'match' ? 'vyhovuje' : x.m.category === 'outside' ? 'mimo podmienok' : 'nedostupná'}</small></> : '—')],
    ['Kvalita podkladov', (x) => (x.c ? `${x.c.quality.level === 'overena' ? 'overené' : x.c.quality.level === 'ciastocna' ? 'čiastočné' : 'orientačné'} · ${x.c.quality.score}/100` : '—')],
    ['Aktuálnosť', (x) => { const f = freshness(x.p, now, settings.freshness); return <>{f.label}<small style={{ display: 'block' }}>{f.seller_label}</small></> }],
    ['Posledné potvrdenie predajcom', (x) => (x.p.last_confirmed_at ? fmtDate(x.p.last_confirmed_at) : <span className="iv-unknown">nepotvrdené</span>)],
    ['Odporúčaný ďalší krok', (x) => (x.m && x.m.result && x.m.result.next_step) || '—'],
  ]
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="investicie" guruApp="crm" hideFooter>
      <div className="iv">
        <div className="iv-head"><div><h1>Porovnanie nehnuteľností</h1><p className="iv-sub">Vybrané byty vedľa seba. Čísla sú z uloženého výpočtu; neznáme údaje sú označené, nie nulové.</p></div>{qid && <Link className="btn line" href={`/investicie/dopyt/${qid}`}>← Späť na dopyt</Link>}</div>
        <IvNav active="dopyty" isAdmin={isAdmin} />
        {cols.length < 2 ? <section className="card"><p>Vyber aspoň dve nehnuteľnosti v dopyte.</p></section> : (
          <section className="card iv-scroll"><table className="iv-table iv-cmp"><thead><tr><th></th>{cols.map((x) => <th key={x.p.id}><Link href={`/investicie/n/${x.p.id}`}>{[x.p.address || x.p.district, x.p.city].filter(Boolean).join(', ')}</Link></th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label}><td>{label}</td>{cols.map((x) => <td key={x.p.id}>{f(x)}</td>)}</tr>)}</tbody></table></section>
        )}
      </div>
    </Shell>
  )
}
