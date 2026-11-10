'use client'
import { useEffect, useState } from 'react'
import Tile from '@/components/Tile'

const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch {} return null }

/**
 * Domov: appky v skupinách podľa toho, na čo ich potrebuješ. Hore karty skupín (s počtom), kliknutím sa pod nimi otvorí
 * panel s dlaždicami tej skupiny. Otvorená skupina sa pamätá v prehliadači. Hľadanie nájde appku naprieč skupinami.
 */
export default function HomeGroups({ groups = [] }) {
  const withTiles = groups.filter((g) => g.tiles.length || g.soon.length)
  const [open, setOpen] = useState(withTiles[0] ? withTiles[0].id : null)
  const [q, setQ] = useState('')
  useEffect(() => { const g = store('home-group'); if (g === 'all' || withTiles.some((x) => x.id === g)) setOpen(g) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id) => { const next = open === id ? null : id; setOpen(next); store('home-group', next || '') }
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hit = q.trim() ? withTiles.flatMap((g) => g.tiles.filter((t) => fold(t.title + ' ' + t.desc).includes(fold(q)))) : null
  const cur = withTiles.find((g) => g.id === open)
  const total = withTiles.reduce((n, g) => n + g.tiles.length, 0)
  return (
    <section className="toolsTop hg" aria-label="Tvoje nástroje">
      <div className="sec"><h2>Tvoje nástroje</h2><span>{total}</span><input className="hg-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať appku…" aria-label="Hľadať appku" /></div>
      {hit ? (
        <div className="tiles compact">{hit.map((m) => <Tile key={m.id} href={m.url} icon={m.icon} title={m.title} desc={m.desc} />)}{!hit.length && <p className="hg-empty">Nič sa nenašlo.</p>}</div>
      ) : (
        <>
          <div className="hg-groups" role="tablist" aria-label="Skupiny appiek">
            {withTiles.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={open === g.id} aria-controls={`hg-${g.id}`} className={`hg-g${open === g.id ? ' on' : ''}`} onClick={() => choose(g.id)}>
                <span className="hg-ic" aria-hidden="true">{g.icon}</span>
                <span className="hg-t" title={g.desc}><b>{g.title}</b></span>
                <span className="hg-n">{g.tiles.length}</span>
                <span className="hg-chev" aria-hidden="true" />
              </button>
            ))}
            <button type="button" role="tab" aria-selected={open === 'all'} className={`hg-g all${open === 'all' ? ' on' : ''}`} onClick={() => choose('all')}><span className="hg-ic" aria-hidden="true">▦</span><span className="hg-t" title="Celý zoznam na jednom mieste"><b>Všetky appky</b></span><span className="hg-n">{total}</span><span className="hg-chev" aria-hidden="true" /></button>
          </div>
          {open === 'all' && withTiles.map((g) => (
            <div key={g.id} className="hg-panel" id={`hg-${g.id}`}><h3 className="hg-h">{g.icon} {g.title}</h3><div className="tiles compact">{g.tiles.map((m) => <Tile key={m.id} href={m.url} icon={m.icon} title={m.title} desc={m.desc} />)}</div></div>
          ))}
          {cur && (
            <div className="hg-panel" id={`hg-${cur.id}`} role="tabpanel">
              <p className="hg-desc">{cur.icon} <b>{cur.title}</b> · {cur.desc}</p>
              <div className="tiles compact">{cur.tiles.map((m) => <Tile key={m.id} href={m.url} icon={m.icon} title={m.title} desc={m.desc} />)}</div>
              {!!cur.soon.length && <p className="hg-soon">Pripravujeme: {cur.soon.map((m) => m.title).join(' · ')}</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}
