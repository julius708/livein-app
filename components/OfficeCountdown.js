'use client'
import { useEffect, useState } from 'react'
import { OFFICE_OPENING, countdownParts, countdownProgress, countdownSpeech, daysWord } from '@/lib/countdown'
import './office-countdown.css'

const two = (n) => String(n).padStart(2, '0')

/** Odpočítavanie do otvorenia kancelárie (1. decembra) v pravom rohu úvodnej dlaždice. */
export default function OfficeCountdown() {
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (now === null) return <aside className="oc" aria-hidden="true"><div className="oc-skel" /></aside>
  const p = countdownParts(now, OFFICE_OPENING)
  const pct = Math.round(countdownProgress(now) * 100)
  if (p.done) {
    return (
      <aside className="oc oc-open" aria-label="Kancelária je otvorená">
        <div className="oc-glow" aria-hidden="true" />
        <div className="oc-label">Je to tu</div>
        <div className="oc-open-t">Kancelária je otvorená <span aria-hidden="true">🎉</span></div>
        <div className="oc-date">od 1. decembra</div>
      </aside>
    )
  }
  const cells = [
    [p.days, daysWord(p.days)],
    [two(p.hours), 'hod.'],
    [two(p.minutes), 'min.'],
    [two(p.seconds), 'sek.'],
  ]
  return (
    <aside className={'oc' + (p.last24 ? ' oc-last' : '')} aria-label="Odpočítavanie do otvorenia kancelárie">
      <div className="oc-glow" aria-hidden="true" />
      <div className="oc-label"><i aria-hidden="true" />Otvorenie kancelárie</div>
      <div className="oc-date">{p.last24 ? 'Už zajtra, 1. decembra' : '1. decembra'}</div>
      <div className="oc-cells" aria-hidden="true">
        {cells.map(([v, l], i) => (
          <div className="oc-cell" key={l}>
            <b key={i === 3 ? v : 'k' + i} className={i === 3 ? 'oc-sec' : undefined}>{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <div className="oc-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <span className="oc-sr" role="status">{countdownSpeech(p)}</span>
    </aside>
  )
}
