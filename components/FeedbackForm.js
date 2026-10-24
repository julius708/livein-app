'use client'
import { useActionState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { sendFeedback } from '@/app/feedback/actions'
import { KINDS } from '@/lib/feedback'

export default function FeedbackForm() {
  const [state, action, pending] = useActionState(sendFeedback, null)
  const path = usePathname() || ''
  const ref = useRef(null)
  useEffect(() => { if (state && state.ok && ref.current) ref.current.reset() }, [state])
  return (
    <form action={action} ref={ref} className="fbform">
      <input type="hidden" name="page" value={path} />
      <div className="kinds" role="radiogroup" aria-label="Typ správy">
        {Object.entries(KINDS).map(([k, v], i) => (
          <label key={k} className="kind">
            <input type="radio" name="kind" value={k} defaultChecked={i === 1} />
            <span>{v.icon} {v.label}</span>
          </label>
        ))}
      </div>
      <textarea className="f" name="message" rows={4} maxLength={4000} required placeholder="Čo sa ti páči, čo ti prekáža, čo by si chcel/a zmeniť…" />
      <button className="btn o w" type="submit" disabled={pending}>{pending ? 'Odosielam…' : 'Odoslať feedback'}</button>
      {state && state.ok && <div className="msg ok">Ďakujeme! Feedback sme dostali.</div>}
      {state && !state.ok && <div className="msg err">{state.error}</div>}
    </form>
  )
}
