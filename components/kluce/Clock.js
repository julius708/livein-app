'use client'
import { useEffect, useState } from 'react'
/** Dnešný dátum a čas v hlavičke kiosku (Bratislava), obnovuje sa každú minútu – aby bolo vždy jasné, ktorý deň to je. */
export default function KeysClock() {
  const fmt = () => new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const [t, setT] = useState('')
  useEffect(() => { setT(fmt()); const i = setInterval(() => setT(fmt()), 30000); return () => clearInterval(i) }, [])
  return <time className="kl-clock" suppressHydrationWarning>{t}</time>
}
