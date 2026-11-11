'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPropertyByUrlAction, addPropertyManualAction } from '@/app/investicie/actions'
import { useAct, Toast } from './ui'

const EMPTY = { url: '', city: '', district: '', address: '', type: 'byt', rooms: '', area_interior: '', area_exterior: '', floor: '', price: '', condition: '', parking_mandatory: '', parking_in_price: '', parking_price: '', commission_in_price: '', legal_costs: '', reno: '', furnishing: '', setup: '', reserve: '', monthly_fixed: '', seller: '', notes_internal: '' }
const TRI = [['', 'neznáme'], ['true', 'áno'], ['false', 'nie']]
export default function AddProperty() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [f, setF] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const { run, pending, msg, setMsg } = useAct()
  const router = useRouter()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const num = (k, label, ph) => <label>{label}<input inputMode="decimal" value={f[k]} onChange={set(k)} placeholder={ph || 'neznáme'} /></label>
  const tri = (k, label) => <label>{label}<select value={f[k]} onChange={set(k)}>{TRI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
  const byUrl = () => run(() => addPropertyByUrlAction(url), (r) => (r.merged ? 'Ponuka bola pripojená k už evidovanej nehnuteľnosti.' : r.suggested ? 'Pridané. Je podobná inej ponuke, skontroluj návrh na zlúčenie.' : 'Pridané.'), (r) => { if (r.id) router.push(`/investicie/n/${r.id}`) })
  const manual = () => run(() => addPropertyManualAction(f), (r) => (r.merged ? 'Pripojené k už evidovanej nehnuteľnosti.' : 'Pridané.'), (r) => { setF(EMPTY); if (r.id) router.push(`/investicie/n/${r.id}`) })
  return (
    <>
      <div className="iv-actions"><button type="button" className="btn" onClick={() => setOpen(!open)}>{open ? 'Zavrieť' : '+ Pridať ponuku'}</button></div>
      {open && (
        <section className="card">
          <h2>Pridať ponuku</h2>
          <p className="iv-hint">Vlož odkaz na inzerát. Systém prečíta, čo sa dá overiť (cena, mesto, výmera); čo sa nepodarí, doplníš vo formulári. Rovnaký byt z iného portálu sa nezduplikuje.</p>
          <div className="iv-actions"><input style={{ flex: '1 1 320px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Odkaz na inzerát" /><button type="button" className="btn" disabled={pending || !/^https?:\/\//i.test(url)} onClick={byUrl}>Načítať z odkazu</button><button type="button" className="btn line" onClick={() => { setShowForm(!showForm); if (url && !f.url) setF({ ...f, url }) }}>{showForm ? 'Skryť formulár' : 'Vyplniť ručne'}</button></div>
          {showForm && (
            <div className="iv-form" style={{ marginTop: 12 }}>
              <label className="wide">Odkaz na inzerát (voliteľné)<input value={f.url} onChange={set('url')} placeholder="https://…" /></label>
              <label>Mesto *<input value={f.city} onChange={set('city')} /></label><label>Štvrť<input value={f.district} onChange={set('district')} /></label><label>Ulica a číslo<input value={f.address} onChange={set('address')} /></label>
              <label>Typ<select value={f.type} onChange={set('type')}><option value="byt">Byt</option><option value="dom">Dom</option></select></label>
              {num('rooms', 'Izby')}{num('area_interior', 'Výmera interiér m²')}{num('area_exterior', 'Exteriér m² (balkón…)')}{num('floor', 'Poschodie')}{num('price', 'Cena € *')}
              <label>Stav<input value={f.condition} onChange={set('condition')} placeholder="napr. po rekonštrukcii" /></label>
              <fieldset><legend>Náklady (prázdne = neznáme, nikdy nula)</legend><div className="iv-form">
                {tri('parking_mandatory', 'Povinné parkovanie?')}{tri('parking_in_price', 'Parkovanie v cene?')}{num('parking_price', 'Parkovanie mimo ceny €')}{tri('commission_in_price', 'Provízia RK v cene?')}
                {num('legal_costs', 'Právne a administratívne €')}{num('reno', 'Rekonštrukcia €')}{num('furnishing', 'Zariadenie €')}{num('setup', 'Sprevádzkovanie €')}{num('reserve', 'Rezerva €')}{num('monthly_fixed', 'Mesačné náklady majiteľa €')}
              </div></fieldset>
              <label>Predajca / kontakt (interné)<input value={f.seller} onChange={set('seller')} /></label>
              <label className="wide">Interná poznámka<textarea value={f.notes_internal} onChange={set('notes_internal')} /></label>
              <div className="iv-actions"><button type="button" className="btn" disabled={pending || !f.city.trim() || !f.price} onClick={manual}>Pridať ponuku</button></div>
            </div>
          )}
        </section>
      )}
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </>
  )
}
