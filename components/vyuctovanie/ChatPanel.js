'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { billingChatAction, applyChatActionsAction } from '@/app/vyuctovanie/actions'

const HINTS = ['Koľko riadkov nemá sumu?', 'Pridaj k bytu … položku … za … €', 'Presuň riadok … k bytu …', 'Zmeň firmu bytu … na Management', 'Chcem nový stĺpec „Dátum faktúry“']

/** Chat Pomocník: odpovedá o tabuľke a navrhuje zmeny dát; zmeny sa vykonajú až po tvojom potvrdení. Zmeny funkcií ide ako požiadavka na vývoj. */
export default function ChatPanel({ periodId, focus = [], readOnly = false }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])           // { role, content, proposals?, checked?, applied? }
  const [text, setText] = useState('')
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  const end = useRef(null)
  useEffect(() => { try { const v = sessionStorage.getItem('vy-chat-' + periodId); if (v) setMsgs(JSON.parse(v)) } catch {} }, [periodId])
  useEffect(() => { try { sessionStorage.setItem('vy-chat-' + periodId, JSON.stringify(msgs.slice(-30))) } catch {} ; if (end.current) end.current.scrollIntoView({ block: 'end' }) }, [msgs, periodId, open])

  const send = (t) => {
    const content = String(t ?? text).trim(); if (!content || busy) return
    const next = [...msgs, { role: 'user', content }]
    setMsgs(next); setText(''); setErr('')
    start(async () => {
      const r = await billingChatAction({ period_id: periodId, messages: next.map(({ role, content: c }) => ({ role, content: c })), focus })
      if (r && r.ok) setMsgs((m) => [...m, { role: 'assistant', content: r.reply, proposals: r.proposals || [], checked: Object.fromEntries((r.proposals || []).map((p) => [p.id, true])) }])
      else setErr((r && r.error) || 'Nepodarilo sa.')
    })
  }
  const toggle = (mi, id) => setMsgs((m) => m.map((x, i) => (i === mi ? { ...x, checked: { ...x.checked, [id]: !x.checked[id] } } : x)))
  const apply = (mi) => {
    const m = msgs[mi]; const chosen = (m.proposals || []).filter((p) => m.checked[p.id])
    if (!chosen.length || busy) return
    start(async () => {
      const r = await applyChatActionsAction({ period_id: periodId, actions: chosen.map((p) => p.action) })
      if (r && r.ok) {
        const lines = r.results.map((x) => `${x.ok ? '✓' : '✕'} ${x.label}${x.error ? ': ' + x.error : ''}`).join('\n')
        setMsgs((all) => all.map((x, i) => (i === mi ? { ...x, applied: lines } : x)).concat([{ role: 'assistant', content: `Používateľ potvrdil návrhy. Výsledok:\n${lines}` }]))
        router.refresh()
      } else setErr((r && r.error) || 'Nepodarilo sa.')
    })
  }
  return (
    <>
      <button type="button" className="vy-chat-fab" aria-label="Otvoriť Pomocníka" onClick={() => setOpen(!open)}>{open ? '✕' : '💬 Pomocník'}</button>
      {open && (
        <div className="vy-chat" role="dialog" aria-label="Pomocník vyúčtovania">
          <header><b>Pomocník</b><small>Opýtaj sa, nechaj si navrhnúť zmeny v tabuľke. Zmeny dát potvrdzuješ ty; zmeny funkcií idú ako požiadavka na vývoj.</small></header>
          <div className="vy-chat-log">
            {!msgs.length && <div className="vy-chat-hints">{HINTS.map((h) => <button key={h} type="button" onClick={() => setText(h)}>{h}</button>)}</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`vy-chat-msg ${m.role}`}>
                <div className="vy-chat-bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                {m.proposals && m.proposals.length > 0 && (
                  <div className="vy-chat-props">
                    {m.proposals.map((p) => (
                      <label key={p.id} className={p.type === 'request_feature' ? 'feat' : ''}><input type="checkbox" disabled={!!m.applied || readOnly} checked={!!(m.checked && m.checked[p.id])} onChange={() => toggle(i, p.id)} /> <span>{p.label}</span></label>
                    ))}
                    {m.applied ? <pre className="vy-chat-done">{m.applied}</pre> : <div className="vy-chat-btns"><button type="button" className="btn" disabled={busy || readOnly} onClick={() => apply(i)}>Použiť vybrané</button><button type="button" className="btn line" disabled={busy} onClick={() => setMsgs((all) => all.map((x, j) => (j === i ? { ...x, proposals: [], applied: null } : x)))}>Zahodiť</button></div>}
                    {readOnly && !m.applied && <small>Obdobie je uzavreté, zmeny nie sú možné.</small>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="vy-chat-msg assistant"><div className="vy-chat-bubble">Pracujem…</div></div>}
            {err && <div className="vy-chat-err" role="alert">{err}</div>}
            <div ref={end} />
          </div>
          <form className="vy-chat-form" onSubmit={(e) => { e.preventDefault(); send() }}>
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Napíš, čo potrebuješ…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <button type="submit" className="btn" disabled={busy || !text.trim()}>Poslať</button>
          </form>
        </div>
      )}
    </>
  )
}
