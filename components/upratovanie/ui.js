'use client'
import { useState, useTransition } from 'react'
import { WEEKDAYS_SHORT } from '@/lib/cl-core'

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

/** Výber pracovných dní (Po–Ne): tlačidlá, aspoň jeden deň musí byť vybraný. */
export function WorkDaysPicker({ value, onChange, label = 'V ktoré dni môžeš pracovať' }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())
  return (
    <div className="up-f wide"><span>{label}</span>
      <div className="up-days">{WEEKDAYS_SHORT.map((d, i) => <button type="button" key={d} aria-pressed={value.includes(i + 1)} className={value.includes(i + 1) ? 'on' : ''} onClick={() => toggle(i + 1)}>{d}</button>)}</div>
      {value.length === 0 && <small>Vyber aspoň jeden deň.</small>}
    </div>
  )
}
