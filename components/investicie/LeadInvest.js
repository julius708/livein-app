'use client'
import { useState } from 'react'
import Link from 'next/link'
import InquiryForm from './InquiryForm'
import { inqStatusLabel, isActiveInquiry } from '@/lib/inv-core'
import { budgetSummary } from '@/lib/inv-inquiry'
import { fmtDate } from '@/lib/fmt'
import '@/app/investicie/investicie.css'

/** Investičné dopyty pri kontakte v CRM: nevytvára nový kontakt, len ďalší dopyt k tomuto; marketingový súhlas sa nemení. */
export default function LeadInvest({ leadId, inquiries = [], matchCounts = {}, people = [] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="iv card" style={{ marginTop: 12 }}>
      <div className="iv-head"><h2 style={{ margin: 0 }}>Investičné dopyty</h2><button type="button" className="btn" onClick={() => setOpen(!open)}>{open ? 'Zavrieť' : '+ Nový investičný dopyt'}</button></div>
      <p className="iv-hint">Ak klient hľadá investičný byt, zapíš jeho požiadavky. Systém hneď ukáže vhodné byty z našej databázy. Nejde o marketingový súhlas ani o prihlásenie na newsletter.</p>
      {inquiries.map((q) => { const b = budgetSummary(q); return (
        <div key={q.id} className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '8px 0' }}>
          <span><Link href={`/investicie/dopyt/${q.id}`} style={{ fontWeight: 800 }}>{q.label || 'Investičný dopyt'}</Link><small className="iv-hint" style={{ display: 'block' }}>{b.text}{b.ambiguous ? ' · význam sumy nepotvrdený' : ''} · {(q.cities || []).join(', ') || 'lokalita neznáma'} · záujem potvrdený {q.last_confirmed_at ? fmtDate(q.last_confirmed_at) : 'nie'}</small></span>
          <span className="iv-actions"><span className={`iv-pill ${isActiveInquiry(q) ? 'ok' : 'muted'}`}>{inqStatusLabel(q.status)}</span><span className="iv-pill active">{matchCounts[q.id] || 0} vhodných ponúk</span></span>
        </div>) })}
      {!inquiries.length && !open && <p className="iv-hint">Zatiaľ žiadny investičný dopyt.</p>}
      {open && <div style={{ marginTop: 10 }}><InquiryForm leadId={leadId} people={people} compact onDone={() => setOpen(false)} /></div>}
    </section>
  )
}
