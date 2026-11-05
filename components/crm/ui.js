'use client'
import { useState } from 'react'
import { countdown, remainingPct, telLink, waLink, normalizePhone, STAGES, stageOf, LOST_REASONS } from '@/lib/crm'

export const COLORS = { ok: '#1E8A5A', soon: '#D98A00', critical: '#C23B3B', over: '#C23B3B', none: '#9BB0A5' }
export const SCRIPT = 'Dobrý deň, volám z LIVE-IN. Ďakujem za záujem o správu bytu. Máte chvíľu? Poviem vám, ako to u nás funguje a čo by vám z bytu zostalo.'
export const WA_TEXT = 'Dobry den, tu LIVE-IN. Dakujeme za zaujem o spravu bytu. Kedy by sa vam hodil kratky hovor?'

/** Kruh s odpočtom lehoty. */
export function Ring({ lead, now, size = 58 }) {
  const c = countdown(lead.due_at, now), pct = remainingPct(lead.due_at, lead.alarm_hours, now)
  const done = lead.stage !== 'new' || lead.kind !== 'lead'
  const col = done ? COLORS.ok : COLORS[c.state] || COLORS.none
  return (
    <div className={'crm-ring' + (c.state === 'over' && !done ? ' over' : '')} style={{ '--p': done ? 100 : pct, '--c': col, width: size, height: size }} title={done ? 'Vybavené' : c.state === 'over' ? 'Po lehote' : 'Do konca lehoty'}>
      <span>{done ? 'OK' : lead.due_at ? c.label : '—'}</span>
    </div>
  )
}
export function stateOf(lead, now) {
  if (lead.stage !== 'new' || lead.kind !== 'lead') return 'done'
  return countdown(lead.due_at, now).state
}
export function Pill({ lead }) {
  const s = stageOf(lead.stage)
  return <span className={'crm-pill s-' + lead.stage}>{s.label}</span>
}
/** Zavolať / WhatsApp / E-mail / Kopírovať číslo. */
export function ContactButtons({ lead, onLog, big = false }) {
  const [copied, setCopied] = useState(false)
  const phone = normalizePhone(lead.phone)
  const copy = async () => { try { await navigator.clipboard.writeText(phone || lead.phone || '') ; setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  return (
    <div className={'crm-contact' + (big ? ' big' : '')}>
      {phone ? <a className="btn crm-call" href={telLink(phone)} onClick={() => onLog && onLog('call')}>📞 Zavolať</a> : <span className="crm-nophone">Bez telefónu</span>}
      {phone && <a className="btn line" href={waLink(phone, WA_TEXT)} target="_blank" rel="noopener noreferrer" onClick={() => onLog && onLog('whatsapp')}>WhatsApp</a>}
      {lead.email && <a className="btn line" href={`mailto:${lead.email}`} onClick={() => onLog && onLog('email')}>E-mail</a>}
      {phone && <button type="button" className="btn line" onClick={copy}>{copied ? 'Skopírované ✓' : phone}</button>}
    </div>
  )
}
/** Rad tlačidiel štádií. Stratený otvorí výber dôvodu. */
export function StageBar({ lead, onStage, compact = false }) {
  const [lost, setLost] = useState(false)
  const [reason, setReason] = useState(LOST_REASONS[0])
  const [note, setNote] = useState('')
  return (
    <div className="crm-stagebar">
      {STAGES.map((s) => <button key={s.id} type="button" className={lead.stage === s.id ? 'on' : ''} disabled={lead.stage === s.id} onClick={() => (s.id === 'lost' ? setLost(true) : onStage(s.id))}>{compact ? s.label : s.short}</button>)}
      {lost && (
        <div className="crm-lost" role="dialog" aria-label="Dôvod straty">
          <b>Prečo sme lead stratili?</b>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Doplnenie (nepovinné)" />
          <div className="crm-row"><button type="button" className="btn" onClick={() => { onStage('lost', { lost_reason: reason, note }); setLost(false) }}>Uložiť ako stratený</button><button type="button" className="btn line" onClick={() => setLost(false)}>Zrušiť</button></div>
        </div>
      )}
    </div>
  )
}
export const fmtDT = (d) => (d ? new Date(d).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
export const fmtD = (d) => (d ? new Date(d).toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' }) : '—')
export const firstName = (email, people) => { const p = (people || []).find((x) => x.email.toLowerCase() === String(email || '').toLowerCase()); return p ? p.name.split(' ')[0] : (email || '').split('@')[0] }
