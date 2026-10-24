'use client'
import { useState } from 'react'

const SRC = (s) => {
  const v = String(s || '').toLowerCase()
  if (v.startsWith('airbnb')) return 'Airbnb'
  if (v.startsWith('booking')) return 'Booking'
  if (v.startsWith('owner')) return 'Majiteľ'
  if (v === 'manual') return 'Priamo'
  if (v === 'vrbo' || v.startsWith('homeaway')) return 'VRBO'
  return s || '?'
}

export default function TodayBoard({ arrivals, departures }) {
  const [tab, setTab] = useState('arr')
  const [city, setCity] = useState('')
  const [all, setAll] = useState(false)
  const list = tab === 'arr' ? arrivals : departures
  const cities = [...new Set([...arrivals, ...departures].map((x) => x.city).filter(Boolean))]
  const rows = list.filter((x) => !city || x.city === city)
  const shown = all ? rows : rows.slice(0, 8)
  return (
    <section className="card board" aria-label="Rezervácie dnes">
      <div className="bh">
        <h2>Rezervácie dnes</h2>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'arr'} className={tab === 'arr' ? 'on' : ''} onClick={() => { setTab('arr'); setAll(false) }}>Príchody {arrivals.length}</button>
          <button role="tab" aria-selected={tab === 'dep'} className={tab === 'dep' ? 'on' : ''} onClick={() => { setTab('dep'); setAll(false) }}>Odchody {departures.length}</button>
        </div>
      </div>
      {cities.length > 1 && (
        <div className="cf">
          <button className={!city ? 'on' : ''} onClick={() => setCity('')}>Všetky</button>
          {cities.map((c) => <button key={c} className={city === c ? 'on' : ''} onClick={() => { setCity(c); setAll(false) }}>{c}</button>)}
        </div>
      )}
      {rows.length === 0 && <p className="hint">Dnes tu nič nie je.</p>}
      <ul className="rl">
        {shown.map((x, k) => (
          <li key={k}>
            <span className="nm">{x.name}</span>
            <span className="mt">{x.city} · {x.guests || '?'} hostí · {x.nights} {x.nights === 1 ? 'noc' : x.nights >= 2 && x.nights <= 4 ? 'noci' : 'nocí'}</span>
            <span className={'src s-' + SRC(x.source).toLowerCase()}>{SRC(x.source)}</span>
          </li>
        ))}
      </ul>
      {rows.length > 8 && <button className="more" onClick={() => setAll(!all)}>{all ? 'Zobraziť menej' : `Zobraziť všetkých ${rows.length}`}</button>}
    </section>
  )
}
