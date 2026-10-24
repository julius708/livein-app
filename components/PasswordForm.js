'use client'
import { useActionState, useState } from 'react'
import { changePassword } from '@/app/heslo/actions'

export default function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null)
  const [show, setShow] = useState(false)
  return (
    <form action={action}>
      <label className="lb" htmlFor="p1">Nové heslo</label>
      <input id="p1" name="p1" className="f" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="aspoň 8 znakov" autoFocus />
      <label className="lb" htmlFor="p2" style={{ marginTop: 12 }}>Nové heslo ešte raz</label>
      <input id="p2" name="p2" className="f" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="pre istotu" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Zobraziť heslo
      </label>
      <button className="btn w" type="submit" disabled={pending} style={{ marginTop: 16 }}>{pending ? 'Ukladám…' : 'Uložiť heslo'}</button>
      {state && !state.ok && <div className="msg err" role="alert">{state.error}</div>}
    </form>
  )
}
