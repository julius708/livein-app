'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PROP_STATUS, propStatusLabel } from '@/lib/inv-core'

export const StatusPill = ({ status }) => <span className={`iv-pill ${status}`}>{propStatusLabel(status)}</span>
export const statusTitle = (s) => (PROP_STATUS.find((x) => x.id === s) || {}).hint || ''
export const QualityPill = ({ level, score }) => <span className={`iv-pill ${level === 'overena' ? 'ok' : level === 'ciastocna' ? 'warn' : 'bad'}`} title="Kvalita a úplnosť vstupov výpočtu (nie výhodnosť a nie zhoda s klientom)">{level === 'overena' ? 'overené' : level === 'ciastocna' ? 'čiastočné' : 'orientačné'}{score != null ? ` · ${score}` : ''}</span>
export const FreshPill = ({ f }) => <span className={`iv-pill ${f.source === 'fresh' ? 'ok' : f.source === 'stale' ? 'warn' : 'bad'}`} title={f.seller_label}>{f.label}</span>

/** Spúšťanie akcií so správou o výsledku a obnovou stránky. */
export function useAct() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), msg.err ? 9000 : 3500); return () => clearTimeout(t) }, [msg])
  const run = (fn, okText = 'Uložené.', after) => start(async () => {
    const r = await fn()
    if (r && r.ok) { setMsg({ ok: typeof okText === 'function' ? okText(r) : okText }); router.refresh(); if (after) after(r) } else setMsg({ err: (r && r.error) || 'Nepodarilo sa.' })
  })
  return { run, pending, msg, setMsg, router }
}
export const Toast = ({ msg, onClose }) => (msg ? <div className={`iv-toast ${msg.err ? 'err' : 'ok'}`} role="status" onClick={onClose}>{msg.err || msg.ok}</div> : null)
export const plural = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`
