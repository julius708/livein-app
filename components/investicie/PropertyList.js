'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PROP_STATUS, fold } from '@/lib/inv-core'
import { eur, pct1 } from '@/lib/inv-fmt'
import { fmtDate } from '@/lib/fmt'
import { StatusPill, QualityPill } from './ui'

const SORTS = { updated: ['Naposledy zmenené', (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')], price_asc: ['Cena ↑', (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12)], price_desc: ['Cena ↓', (a, b) => (b.price ?? -1) - (a.price ?? -1)], yield: ['Výnos z investície ↓', (a, b, c) => (c[b.id]?.yield ?? -99) - (c[a.id]?.yield ?? -99)], quality: ['Kvalita podkladov ↓', (a, b, c) => (c[b.id]?.quality ?? -1) - (c[a.id]?.quality ?? -1)], matches: ['Počet zhôd ↓', (a, b, c, m) => (m[b.id]?.match || 0) - (m[a.id]?.match || 0)], checked: ['Najstaršia kontrola', (a, b) => (a.last_checked_at || '').localeCompare(b.last_checked_at || '')] }

export default function PropertyList({ props, calcs, counts, serverNow, ready }) {
  const [q, setQ] = useState(''), [city, setCity] = useState(''), [status, setStatus] = useState('live'), [rooms, setRooms] = useState(''), [pmax, setPmax] = useState(''), [only, setOnly] = useState(''), [sort, setSort] = useState('updated')
  const cities = useMemo(() => [...new Set(props.map((p) => p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sk')), [props])
  const list = useMemo(() => {
    const t = fold(q)
    return props.filter((p) => {
      if (status === 'live' ? ['sold', 'withdrawn', 'reserved'].includes(p.status) : status && p.status !== status) return false
      if (city && p.city !== city) return false
      if (rooms && String(p.rooms) !== rooms) return false
      if (pmax && p.price != null && p.price > Number(pmax)) return false
      if (only === 'complete' && !(calcs[p.calc_id] || {}).complete) return false
      if (only === 'incomplete' && (calcs[p.calc_id] || {}).complete) return false
      if (only === 'stale' && !(p.last_checked_at && serverNow - Date.parse(p.last_checked_at) > 7 * 864e5) && p.last_checked_at) return false
      if (only === 'matched' && !((counts[p.id] || {}).match > 0)) return false
      return !t || fold(`${p.address || ''} ${p.district || ''} ${p.city || ''} ${p.title || ''}`).includes(t)
    }).sort((a, b) => SORTS[sort][1](a, b, calcs, counts))
  }, [props, calcs, counts, q, city, status, rooms, pmax, only, sort, serverNow])
  if (!ready) return <section className="card"><h2>Modul ešte nie je pripravený</h2><p className="iv-hint">Databázové tabuľky pre Investície ešte nie sú vytvorené (migrácia 20261112_investicie). Požiadaj admina.</p></section>
  return (
    <>
      <section className="card iv-filters">
        <input type="search" placeholder="Hľadať adresu, štvrť, mesto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hľadať" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stav"><option value="live">Aktuálne (bez predaných, rezervovaných, stiahnutých)</option><option value="">Všetky stavy</option>{PROP_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Mesto"><option value="">Všetky mestá</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={rooms} onChange={(e) => setRooms(e.target.value)} aria-label="Izby"><option value="">Všetky dispozície</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}-izbový</option>)}</select>
        <input type="number" inputMode="numeric" placeholder="Cena do (€)" value={pmax} onChange={(e) => setPmax(e.target.value)} style={{ maxWidth: 140 }} aria-label="Cena do" />
        <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Podklady"><option value="">Všetky podklady</option><option value="complete">Úplné náklady</option><option value="incomplete">Chýbajú náklady</option><option value="stale">Dávno nekontrolované</option><option value="matched">Má zhodu s dopytom</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Triedenie">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
      </section>
      <p className="iv-hint">{list.length} z {props.length} nehnuteľností. Inzerát na portáli neznamená dostupnosť potvrdenú predajcom.</p>
      <div className="iv-list">
        {list.map((p) => {
          const c = calcs[p.calc_id] || null
          const age = p.last_checked_at ? Math.floor((serverNow - Date.parse(p.last_checked_at)) / 864e5) : null
          return (
            <Link key={p.id} href={`/investicie/n/${p.id}`} className="iv-row">
              <div><div className="t">{[p.address || p.district, p.city].filter(Boolean).join(', ') || 'Bez adresy'}</div><small>{[p.rooms ? `${p.rooms}-izbový` : null, p.area_interior ? `${String(p.area_interior).replace('.', ',')} m²` : null, p.area_exterior ? `+ ${String(p.area_exterior).replace('.', ',')} m² exteriér` : null].filter(Boolean).join(' · ') || 'rozmery neznáme'}</small></div>
              <div><span className="n">{p.price != null ? eur(p.price) : '—'}</span><small>cena</small></div>
              <div><span className="n">{c && c.total != null ? eur(c.total) : '—'}</span><small>{c ? (c.complete ? 'celková investícia' : <span className="iv-unknown">aspoň, chýba {c.unknown} pol.</span>) : 'bez výpočtu'}</small></div>
              <div><span className="n">{c && c.yield != null ? pct1(c.yield) : '—'}</span><small>{c && c.yield != null ? (c.provisional ? 'výnos (predbežne)' : 'výnos z investície') : 'výnos neznámy'}</small></div>
              <div><span className="n">{(counts[p.id] || {}).match || 0}</span><small>zhôd s dopytmi</small></div>
              <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}><StatusPill status={p.status} />{c && <QualityPill level={c.level} score={c.quality} />}<small suppressHydrationWarning>{age == null ? 'zdroj nekontrolovaný' : `kontrola pred ${age} d`}{p.last_confirmed_at ? ` · potvrdené ${fmtDate(p.last_confirmed_at)}` : ''}</small></div>
            </Link>
          )
        })}
        {!list.length && <section className="card"><p>Nič nezodpovedá filtru. Pridaj ponuku odkazom alebo formulárom, alebo počkaj na ďalší beh agenta.</p></section>}
      </div>
    </>
  )
}
