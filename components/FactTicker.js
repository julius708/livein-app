'use client'
import { useEffect, useState } from 'react'

export default function FactTicker({ facts, label }) {
  const [i, setI] = useState(0)
  const [hold, setHold] = useState(false)
  useEffect(() => {
    if (hold || facts.length < 2) return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((x) => (x + 1) % facts.length), 5000)
    return () => clearInterval(t)
  }, [hold, facts.length])
  if (!facts.length) return null
  const f = facts[i % facts.length]
  return (
    <div className="ticker band" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} aria-live="polite">
      {label && <span className="tk-lb">{label}</span>}
      <span className="tk-ic" aria-hidden="true">{f.icon}</span>
      <span className="tk-tx" key={i}>{f.text}</span>
      <span className="tk-dots" aria-hidden="true">
        {facts.map((_, k) => <i key={k} className={k === i % facts.length ? 'on' : ''} onClick={() => setI(k)} />)}
      </span>
    </div>
  )
}
