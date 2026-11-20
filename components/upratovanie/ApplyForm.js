'use client'
import { useState } from 'react'
import { applyAction } from '@/app/uprat/prihlaska/actions'
import { useRun, Msg, Field, WorkDaysPicker } from './ui'

export default function ApplyForm() {
  const [f, setF] = useState({ name: '', email: '', phone: '', address: '', city: '', note: '', website: '' })
  const [days, setDays] = useState([])
  const [sent, setSent] = useState(false)
  const { pending, msg, run } = useRun()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  if (sent) return <section className="up-panel"><h2>Ďakujeme, prihláška je odoslaná</h2><p className="up-hint">Manažérka upratovania ju pozrie a ozve sa ti na telefón alebo e-mail. Po schválení dostaneš prístup do appky.</p></section>
  return (
    <form className="up-panel up-form" onSubmit={(e) => { e.preventDefault(); run(() => applyAction({ ...f, work_days: days }), { then: () => setSent(true) }) }}>
      <Field label="Meno a priezvisko"><input required minLength="2" maxLength="80" autoComplete="name" value={f.name} onChange={set('name')} /></Field>
      <Field label="E-mail"><input required type="email" maxLength="120" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Telefón"><input required type="tel" minLength="6" maxLength="30" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Adresa bydliska" hint="Podľa nej ti appka priradí byty v blízkosti." wide><input required minLength="5" maxLength="200" autoComplete="street-address" value={f.address} onChange={set('address')} /></Field>
      <Field label="Mesto / mestská časť"><input maxLength="80" autoComplete="address-level2" value={f.city} onChange={set('city')} /></Field>
      <WorkDaysPicker value={days} onChange={setDays} />
      <Field label="Poznámka (skúsenosti, kedy môžeš pracovať)" wide><textarea rows="3" maxLength="500" value={f.note} onChange={set('note')} /></Field>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
      <div className="up-row"><button className="btn" disabled={pending || days.length === 0}>{pending ? 'Odosielam…' : 'Odoslať prihlášku'}</button></div>
      <Msg msg={msg} />
    </form>
  )
}
