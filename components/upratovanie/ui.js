'use client'
import { useState, useTransition } from 'react'

/** Spustí serverovú akciu, ukáže hlášku (zelenú/červenú) a po úspechu zavolá `then`. */
export function useRun() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState(null)
  const run = (fn, { ok: okText, then } = {}) => start(async () => {
    setMsg(null)
    let r
    try { r = await fn() } catch { r = { ok: false, error: 'Nepodarilo sa. Skús to znova.' } }
    if (r && r.ok) { setMsg(okText ? { ok: true, text: okText } : null); if (then) then(r) } else setMsg({ ok: false, text: (r && r.error) || 'Nepodarilo sa.' })
  })
  return { pending, msg, setMsg, run }
}

export function Msg({ msg }) {
  if (!msg) return null
  return <p className={'up-msg ' + (msg.ok ? 'ok' : 'err')} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>
}

export function Field({ label, hint, children, wide }) {
  return <label className={'up-f' + (wide ? ' wide' : '')}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

export function Pill({ tone = '', children }) {
  return <span className={'up-pill ' + tone}>{children}</span>
}
