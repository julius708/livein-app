'use client'
import { useActionState } from 'react'
import { saveNote } from '@/app/note/actions'

export default function PinnedNoteForm({ current }) {
  const [st, act, pending] = useActionState(saveNote, null)
  return (
    <details className="notedit">
      <summary>{current ? 'Zmeniť alebo zrušiť odkaz' : 'Pripnúť odkaz pre tím'}</summary>
      <form action={act}>
        <textarea name="text" rows={3} maxLength={600} defaultValue={current || ''} placeholder="Napr. Dnes od 14:00 výpadok internetu v Košiciach, hostom píšte cez telefón." />
        <div className="row">
          <button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť odkaz'}</button>
          <span className="hint">Prázdne pole odkaz zruší. Vidia ho všetci v tíme.</span>
        </div>
        {st && !st.ok && <div className="msg err">{st.error}</div>}
        {st && st.ok && <div className="msg ok">{st.cleared ? 'Odkaz je zrušený.' : 'Odkaz je pripnutý.'}</div>}
      </form>
    </details>
  )
}
