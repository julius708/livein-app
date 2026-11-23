import Link from 'next/link'
import { notFound } from 'next/navigation'
import PrintButton from '@/components/onb/PrintButton'
import { requireOnboarding, TYPES, fmtD } from '@/lib/onb-viewer'
import { STYLES, ROOMS } from '@/lib/onb-design'
const TIERS = { minimum: 'Nevyhnutné minimum', standard: 'Odporúčané (štandard LIVE-IN)', komplet: 'Kompletné podľa návrhu' }
import { BASE } from '@/lib/onb-base'

export const dynamic = 'force-dynamic'
const BUCKET = 'onboarding'
const eur = (n) => `${Math.round(Number(n || 0))} €`

/** Tlačový výstup: logo, rekapitulácia bytu, vybrané návrhy, čo v byte je a čo treba doplniť. Bez údajov o majiteľovi. */
export default async function PdfPage({ params }) {
  const { id } = await params
  const { s, me, can } = await requireOnboarding()
  if (!can) return <p className="msg err">Len pre tím zaraďovania.</p>
  const [{ data: u }, { data: rooms }, { data: items }] = await Promise.all([s.rpc('onb_unit_get', { p_id: id }), s.rpc('onb_rooms', { p_unit_id: id }), s.rpc('onb_items', { p_unit_id: id })])
  if (!u || !u.id) notFound()
  const paths = []
  for (const r of rooms || []) { paths.push(r.photo_path); const d = r.designs.find((x) => x.chosen); if (d && d.image_path) paths.push(d.image_path) }
  const urls = {}
  if (paths.length) { const { data } = await s.storage.from(BUCKET).createSignedUrls(paths, 3600); for (const x of data || []) if (x.signedUrl && x.path) urls[x.path] = x.signedUrl }
  const list = (rooms || []).map((r) => { const d = r.designs.find((x) => x.chosen); return { ...r, photo_url: urls[r.photo_path], design: d ? { ...d, url: d.image_path ? urls[d.image_path] || d.result_url : d.result_url } : null, items: (items || []).filter((i) => i.room_id === r.id && (!i.tier || i.tier === (r.items_tier || 'standard'))) } })
  const shown = list.flatMap((r) => r.items)
  const missing = shown.filter((i) => !i.present)
  const tot = (k) => missing.reduce((a, i) => a + (i[k] != null ? Number(i[k]) * (i.qty || 1) : 0), 0)
  return (
    <div className="pdf">
      <div className="noprint bar2"><Link className="btn o" href={`/zaradenie/${u.id}/dizajn`}>← Späť na dizajn</Link><PrintButton /></div>
      <header className="ph"><img src={`${BASE}/logo.png`} alt="LIVE-IN" /><div><h1>{u.address}</h1><p>{u.city} {u.zip} · {TYPES[u.unit_type]} · štýl {STYLES[u.design_style]?.label || '—'} · rozpočet {u.budget_eur ? eur(u.budget_eur) : '—'}</p></div></header>
      <section className="recap">
        <div><b>m²</b>{u.sqm ?? '—'}</div><div><b>Spálne</b>{u.bedrooms ?? '—'}</div><div><b>Kapacita</b>{u.capacity ?? '—'}</div><div><b>Poschodie</b>{u.floor || '—'}</div><div><b>Spustenie</b>{u.planned_launch ? fmtD(u.planned_launch) : '—'}</div><div><b>Zodpovedá</b>{u.responsible || '—'}</div>
      </section>
      <section className="sum">
        <h2>Čo treba doplniť: {missing.length} položiek, odhad {eur(tot('est_min'))} až {eur(tot('est_max'))}{u.budget_eur ? ` z rozpočtu ${eur(u.budget_eur)}` : ''}</h2>
        <p>V byte už je {shown.length - missing.length} položiek zo zoznamu. Ceny sú odhad pre IKEA, JYSK, Möbelix, Sconto, XXXLutz, Kondela a e-shopy, overia sa pri nákupe.</p>
      </section>
      {list.map((r) => (
        <section key={r.id} className="room">
          <h2>{ROOMS[r.room_type]}{r.label ? ` · ${r.label}` : ''} {r.items.some((i) => i.tier) && <small>· {TIERS[r.items_tier || 'standard']}</small>}</h2>
          <div className="pics">
            <figure><img src={r.photo_url || ''} alt="Pôvodný stav" /><figcaption>Pôvodný stav</figcaption></figure>
            {r.design ? <figure><img src={r.design.url || ''} alt="Vybraný návrh" /><figcaption>Vybraný návrh dizajnu (vizualizácia, nie fotka bytu)</figcaption></figure> : <figure className="empty"><figcaption>Návrh ešte nie je vybraný</figcaption></figure>}
          </div>
          {r.items.length > 0 && (
            <table>
              <thead><tr><th>Stav</th><th>Položka</th><th>Ks</th><th>Odhad / ks</th><th>Poznámka</th></tr></thead>
              <tbody>{r.items.map((i) => <tr key={i.id} className={i.present ? 'have' : ''}><td>{i.present ? '✓ je' : '＋ doplniť'}</td><td>{i.name}</td><td>{i.qty}</td><td>{i.est_min != null || i.est_max != null ? `${i.est_min != null ? eur(i.est_min) : ''}${i.est_max != null ? ` – ${eur(i.est_max)}` : ''}` : ''}</td><td>{i.note || ''}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      ))}
      {missing.some((i) => i.product_url) && (() => { const bought = missing.filter((i) => i.product_url); const byV = {}; for (const i of bought) (byV[i.vendor || 'Iné'] ||= []).push(i); const tot = bought.reduce((a, i) => a + (i.price != null ? Number(i.price) * (i.qty || 1) : 0), 0); return (
        <section className="room buy">
          <h2>Nákupný zoznam podľa predajcu <small>· spolu {eur(tot)}{u.budget_eur ? ` z rozpočtu ${eur(u.budget_eur)}` : ''}</small></h2>
          {Object.entries(byV).sort().map(([v, arr]) => (
            <div key={v}><h3>{v} <small>{arr.length} vecí · {eur(arr.reduce((a, i) => a + (i.price != null ? Number(i.price) * (i.qty || 1) : 0), 0))}</small></h3>
              <table><thead><tr><th>Ks</th><th>Položka</th><th>Produkt</th><th>Cena / ks</th><th>Dostupnosť</th><th>Stav</th></tr></thead>
                <tbody>{arr.map((i) => <tr key={i.id}><td>{i.qty}</td><td>{i.name}</td><td><a href={i.product_url}>{i.product_name || i.product_url}</a></td><td>{i.price != null ? eur(i.price) : '—'}</td><td>{i.availability || ''}</td><td>{i.purchase_status || ''}</td></tr>)}</tbody></table>
            </div>))}
        </section>) })()}
      <footer>LIVE-IN · Zaradenie bytov · vytvorené {fmtD(new Date().toISOString())} · {me.name}. Vygenerované obrázky sú návrh dizajnu, nikdy sa nepoužívajú ako fotky listingu. Interný dokument.</footer>
    </div>
  )
}
