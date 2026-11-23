'use client'
import { useActionState, useState } from 'react'
import { lookupAddress, createUnit } from '@/app/zaradenie/novy/actions'
import { ZONES } from '@/lib/onb-const'

function MapBox({ hit }) {
  if (!hit) return null
  const d = 0.004
  const bbox = `${hit.lng - d},${hit.lat - d / 2},${hit.lng + d},${hit.lat + d / 2}`
  return <div className="map"><iframe title="Mapa" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${hit.lat},${hit.lng}`} loading="lazy" /></div>
}

export default function NewUnitForm({ templates, members, canOwner, me }) {
  const [look, lookAct, looking] = useActionState(lookupAddress, null)
  const [st, act, pending] = useActionState(createUnit, null)
  const [step, setStep] = useState(1)
  const hit = look && look.ok ? look.hit : null
  if (step === 1) return (
    <form action={lookAct} className="big">
      <div><label>Adresa bytu (ulica, číslo, mesto)</label><input className="f" name="address" defaultValue={look?.address || ''} placeholder="napr. Dunajská 58, Bratislava" required autoFocus /></div>
      <div><button className="btn big" disabled={looking}>{looking ? 'Hľadám na mape…' : 'Nájsť na mape'}</button></div>
      {look && !look.ok && <p className="msg err">{look.error}</p>}
      {hit && (<>
        <div className="found"><b>{hit.display}</b>Mesto: {hit.city || '—'} · PSČ: {hit.zip || '—'} · {ZONES[hit.zone]}</div>
        <MapBox hit={hit} />
        <div><button type="button" className="btn big o" onClick={() => setStep(2)}>Adresa sedí, pokračovať →</button></div>
      </>)}
    </form>
  )
  return (
    <form action={act} className="big">
      <input type="hidden" name="address" value={look.address} /><input type="hidden" name="street" value={hit.street} /><input type="hidden" name="city" value={hit.city} /><input type="hidden" name="zip" value={hit.zip} /><input type="hidden" name="lat" value={hit.lat} /><input type="hidden" name="lng" value={hit.lng} /><input type="hidden" name="city_tax_zone" value={hit.zone} />
      <div className="found"><b>{look.address}</b>{hit.city} {hit.zip} · {ZONES[hit.zone]} <button type="button" className="mini" style={{ marginLeft: 8 }} onClick={() => setStep(1)}>zmeniť adresu</button></div>
      <div className="g3">
        <div><label>Metre štvorcové</label><input className="f" name="sqm" type="number" inputMode="decimal" min="10" max="500" step="0.5" placeholder="55" /></div>
        <div><label>Spálne</label><input className="f" name="bedrooms" type="number" inputMode="numeric" min="0" max="10" placeholder="2" /></div>
        <div><label>Kapacita (hostí)</label><input className="f" name="capacity" type="number" inputMode="numeric" min="1" max="20" placeholder="4" /></div>
      </div>
      <div className="g2">
        <div><label>Poschodie</label><input className="f" name="floor" placeholder="3. poschodie, výťah" /></div>
        <div><label>Typ bytu (určuje checklist)</label><select className="f" name="unit_type" defaultValue="vlastne">{templates.map((t) => <option key={t.unit_type} value={t.unit_type}>{t.label}</option>)}</select></div>
        <div><label>Zodpovedná osoba</label>
          {members.length ? <select className="f" name="responsible" defaultValue={me?.name || ''}><option value="">—</option>{[...new Set([me?.name, ...members.map((m) => m.name)].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}</select> : <input className="f" name="responsible" defaultValue={me?.name || ''} />}
        </div>
        <div><label>Odhadované spustenie</label><input className="f" name="planned_launch" type="date" /></div>
      </div>
      {canOwner && (
        <div className="owner"><small>Údaje o majiteľovi (vidia len admin a operations, nikdy nejdú do PDF ani listingu)</small>
          <div className="g2" style={{ marginTop: 8 }}>
            <div><label>Meno</label><input className="f" name="owner_name" /></div>
            <div><label>Telefón</label><input className="f" name="owner_phone" /></div>
            <div><label>E-mail</label><input className="f" name="owner_email" type="email" /></div>
            <div><label>Poznámka</label><input className="f" name="owner_note" /></div>
          </div>
        </div>
      )}
      <div><button className="btn big" disabled={pending}>{pending ? 'Zakladám byt a Asanu…' : 'Založiť byt a vytvoriť v Asane'}</button></div>
      {st && !st.ok && st.error && <p className="msg err">{st.error}</p>}
    </form>
  )
}
