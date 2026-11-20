'use client'
import { useState } from 'react'
import { completeProfileAction } from '@/app/uprat/prihlaska/actions'
import { useRun, Msg, Field, WorkDaysPicker } from './ui'

/** Formulár z pozvánky: len osobné údaje. Nič, čo nastavuje manažérka (limity, dni, ceny), tu nie je. */
export default function ProfileForm({ token }) {
  const [f, setF] = useState({ phone: '', address: '', city: '', note: '', website: '' })
  const [days, setDays] = useState([])
  const [done, setDone] = useState(null)
  const { pending, msg, run } = useRun()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  if (done) return (
    <section className="up-panel"><h2>Ďakujeme, údaje sú uložené ✅</h2>
      <p className="up-hint">{done.mapped ? 'Adresu sme našli na mape, appka ti vie priraďovať byty v blízkosti.' : 'Adresu sa nepodarilo nájsť na mape, manažérka ju doplní.'} Do appky sa prihlásiš e-mailom: zadaj svoj e-mail a vyber prihlásenie odkazom do e-mailu, heslo nepotrebuješ.</p>
      <a className="btn" href="/login">Prejsť na prihlásenie</a></section>
  )
  return (
    <form className="up-panel up-form" onSubmit={(e) => { e.preventDefault(); run(() => completeProfileAction({ ...f, token, work_days: days }), { then: (r) => setDone(r) }) }}>
      <Field label="Telefón"><input required type="tel" minLength="6" maxLength="30" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Mesto / mestská časť"><input maxLength="80" autoComplete="address-level2" value={f.city} onChange={set('city')} /></Field>
      <Field label="Adresa bydliska" hint="Ulica a číslo." wide><input required minLength="5" maxLength="200" autoComplete="street-address" value={f.address} onChange={set('address')} /></Field>
      <WorkDaysPicker value={days} onChange={setDays} />
      <Field label="Poznámka (nepovinné)" wide><textarea rows="3" maxLength="500" value={f.note} onChange={set('note')} placeholder="napr. kedy ti vyhovuje pracovať" /></Field>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
      <div className="up-row"><button className="btn" disabled={pending || days.length === 0}>{pending ? 'Ukladám…' : 'Uložiť údaje'}</button></div>
      <Msg msg={msg} />
    </form>
  )
}
