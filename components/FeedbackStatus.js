'use client'
import { useState, useTransition } from 'react'
import { setFeedbackStatus } from '@/app/admin/feedback/actions'
import { STATUSES } from '@/lib/feedback'

export default function FeedbackStatus({ id, status }) {
  const [v, setV] = useState(status)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  return (
    <>
      <select className="f sm" value={v} disabled={pending} aria-label="Stav" onChange={(e) => {
        const nv = e.target.value; const old = v; setV(nv); setErr('')
        start(async () => { const r = await setFeedbackStatus(id, nv); if (!r.ok) { setV(old); setErr(r.error) } })
      }}>
        {Object.entries(STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {err && <div className="row-st err">{err}</div>}
    </>
  )
}
