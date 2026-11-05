'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { browserClient } from '@/lib/browser'
import { markNotificationsRead } from '@/app/crm/actions'

function beep() {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12); o.stop(ctx.currentTime + 0.28) } catch {}
}
const urlB64ToU8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) }

/** Zvonček s notifikáciami: živé (Supabase realtime), zvuk, systémové upozornenie a push na telefón. */
export default function CrmNotifier({ me, initial = [], pushPublicKey }) {
  const [items, setItems] = useState(initial)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [push, setPush] = useState('unknown')
  const unread = items.filter((n) => !n.read_at)
  const seen = useRef(new Set(initial.map((n) => n.id)))

  useEffect(() => {
    const c = browserClient()
    const ch = c.channel('crm-notifs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_email=eq.${me.email}` }, (p) => {
      const n = p.new; if (!n || seen.current.has(n.id)) return; seen.current.add(n.id)
      setItems((cur) => [n, ...cur].slice(0, 50)); setToast(n); beep()
      try { if (Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(n.title, { body: n.body, tag: 'crm-' + n.id }) } catch {}
      setTimeout(() => setToast((t) => (t && t.id === n.id ? null : t)), 8000)
    }).subscribe()
    return () => { c.removeChannel(ch) }
  }, [me.email])
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !pushPublicKey) { setPush('unsupported'); return }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => { const s = await reg.pushManager.getSubscription(); setPush(s ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off') }).catch(() => setPush('unsupported'))
  }, [pushPublicKey])
  const enablePush = async () => {
    try {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') { setPush('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(pushPublicKey) })
      const j = sub.toJSON()
      const r = await fetch('/api/push/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) })
      setPush(r.ok ? 'on' : 'off')
    } catch { setPush('off') }
  }
  const openList = () => { setOpen((o) => !o); if (!open && unread.length) { const ids = unread.map((n) => n.id); setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))); markNotificationsRead(ids).catch(() => {}) } }
  return (
    <div className="crm-bell-wrap">
      <button type="button" className={'crm-bell' + (unread.length ? ' has' : '')} onClick={openList} aria-expanded={open} aria-label={`Notifikácie, ${unread.length} neprečítaných`}>🔔{unread.length > 0 && <b>{unread.length}</b>}</button>
      {open && (
        <div className="crm-notifs" role="dialog" aria-label="Notifikácie">
          <div className="crm-notifs-head"><b>Notifikácie</b>{push === 'off' && <button type="button" className="eko-link" onClick={enablePush}>Zapnúť push na tomto zariadení</button>}{push === 'on' && <span className="crm-push-on">push zapnutý</span>}{push === 'denied' && <span className="crm-low">push zakázaný v prehliadači</span>}</div>
          {!items.length && <p className="eko-fine">Zatiaľ nič. Nový lead sa ohlási sám.</p>}
          <ul>{items.map((n) => <li key={n.id} className={n.read_at ? '' : 'new'}><Link href={n.url || '/crm'} onClick={() => setOpen(false)}><b>{n.title}</b><span>{n.body}</span><small>{new Date(n.created_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></Link></li>)}</ul>
        </div>
      )}
      {toast && <Link href={toast.url || '/crm'} className="crm-toast" onClick={() => setToast(null)}><b>{toast.title}</b><span>{toast.body}</span></Link>}
    </div>
  )
}
