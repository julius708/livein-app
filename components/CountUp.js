'use client'
import { useEffect, useRef, useState } from 'react'

export default function CountUp({ value, suffix = '', duration = 1400 }) {
  const [n, setN] = useState(value)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf
    const t0 = performance.now()
    setN(0)
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span>{Number(n).toLocaleString('sk-SK')}{suffix}</span>
}
