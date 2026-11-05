'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { countdown, stageOf, SOURCES } from '@/lib/crm'
import { Ring, Pill, ContactButtons, StageBar, stateOf, fmtDT, firstName } from './ui'
import { setStage, logContact, addNote, assignLead } from '@/app/crm/actions'

const TYPES = { stage_change: 'Zmena štádia', call: 'Hovor', whatsapp: 'WhatsApp', email: 'E-mail', sms: 'SMS', note: 'Poznámka', system: 'Systém' }
const HUB = 'https://app.hubspot.com/contacts/48987752/record/0-1/'

function describe(e, people) {
  const p = e.payload || {}
  if (e.type === 'stage_change') return `${stageOf(p.from).label} → ${stageOf(p.to).label}${p.lost_reason ? ' (' + p.lost_reason + ')' : ''}${p.via ? ' · z ' + p.via : ''}${p.note ? ': ' + p.note : ''}`
  if (e.type === 'system') return p.via === 'zapier' ? 'Lead prišiel zo Zapieru' : p.via === 'manual' ? 'Lead pridaný ručne' : p.assigned_to ? 'Priradený: ' + firstName(p.assigned_to, people) : 'Systém'
  if (e.type === 'note') return p.note || ''
  return p.note ? p.note : ''
}

export default function LeadDetail({ lead: initial, events: initialEvents, people, me }) {
  const router = useRouter()
  const [lead, setLead] = useState(initial)
  const [events, setEvents] = useState(initialEvents)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()
  const now = Date.now(), st = stateOf(lead, now), c = countdown(lead.due_at, now)
  const refresh = () => router.refresh()
  const doStage = (stage, opts) => start(async () => { setErr(''); const r = await setStage(lead.id, stage, opts || {}); if (!r.ok) { setErr(r.error); return } setLead({ ...lead, stage, kind: stage === 'client' ? 'client' : lead.kind, first_contact_at: lead.first_contact_at || (lead.stage === 'new' && stage !== 'new' ? new Date().toISOString() : null) }); refresh() })
  const doLog = (type) => { logContact(lead.id, type).then(() => refresh()).catch(() => {}) }
  const saveNote = () => start(async () => { setErr(''); const r = await addNote(lead.id, note); if (!r.ok) { setErr(r.error); return } setEvents([{ id: 'tmp' + Date.now(), at: new Date().toISOString(), type: 'note', payload: { note }, user_name: me.name }, ...events]); setNote(''); refresh() })
  const s = stageOf(lead.stage)
  return (
    <div className="crm crm-detail">
      <section className={'card crm-dhead ' + st}>
        <Ring lead={lead} now={now} size={72} />
        <div className="crm-dhead-main">
          <div className="crm-row-head"><h1>{lead.name}</h1><Pill lead={lead} />{lead.kind === 'not_lead' && <span className="crm-low">označený ako nie lead</span>}</div>
          <div className="crm-meta" suppressHydrationWarning>{lead.city_group !== 'Iné' ? lead.city_group : ''}{lead.city ? ` · ${lead.city}` : ''} · {lead.source || 'zdroj neznámy'} · prijatý {fmtDT(lead.received_at)}{lead.due_at && lead.stage === 'new' ? ` · lehota ${c.state === 'over' ? 'prekročená o ' + c.label.slice(1) : 'do ' + fmtDT(lead.due_at)}` : ''}</div>
          <div className="crm-meta">{lead.first_contact_at ? `Prvý kontakt ${fmtDT(lead.first_contact_at)} (${firstName(lead.contacted_by, people)})` : 'Zatiaľ bez kontaktu'}{lead.lost_reason ? ` · dôvod straty: ${lead.lost_reason}` : ''}{lead.property_address ? ` · nehnuteľnosť: ${lead.property_address}` : ''}</div>
          <ContactButtons lead={lead} onLog={doLog} big />
          <StageBar lead={lead} onStage={doStage} />
          {err && <p className="msg err">{err}</p>}
        </div>
      </section>
      <div className="eko-two">
        <section className="card">
          <h2>História</h2>
          <form className="crm-noteform" onSubmit={(e) => { e.preventDefault(); saveNote() }}><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Poznámka z hovoru, čo dohodnuté, kedy zavolať znova…" /><button type="submit" className="btn" disabled={busy || !note.trim()}>Uložiť poznámku</button></form>
          <ul className="crm-hist">{events.map((e) => <li key={e.id}><span className={'crm-ev t-' + e.type}>{TYPES[e.type] || e.type}</span><div><b>{describe(e, people)}</b><small>{fmtDT(e.at)} · {e.user_name || 'automaticky'}</small></div></li>)}{!events.length && <li className="eko-fine">Zatiaľ bez udalostí.</li>}</ul>
        </section>
        <section className="card">
          <h2>Údaje</h2>
          <dl className="crm-dl">
            <dt>Telefón</dt><dd>{lead.phone || '—'}</dd>
            <dt>E-mail</dt><dd>{lead.email || '—'}{lead.email_optout ? ' (odhlásený z e-mailov)' : ''}</dd>
            <dt>Mesto</dt><dd>{lead.city || lead.city_group}</dd>
            <dt>Zdroj</dt><dd>{lead.source || '—'}</dd>
            <dt>Komu</dt><dd><select value={lead.assigned_to || ''} onChange={(e) => start(async () => { const v = e.target.value; const r = await assignLead(lead.id, v); if (r.ok) setLead({ ...lead, assigned_to: v }); else setErr(r.error) })}><option value="">nepriradený</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select></dd>
            <dt>Priorita</dt><dd>{lead.priority === 'high' ? 'vysoká' : lead.priority === 'normal' ? 'bežná' : 'nižšia (mimo BA, KE, TT)'}</dd>
            <dt>HubSpot</dt><dd>{lead.hubspot_contact_id ? <a href={HUB + lead.hubspot_contact_id} target="_blank" rel="noopener noreferrer">otvoriť kontakt ↗</a> : 'čaká na prepojenie'}</dd>
            <dt>Asana</dt><dd>{lead.asana_task_gid ? <a href={`https://app.asana.com/0/1203570903024669/${lead.asana_task_gid}`} target="_blank" rel="noopener noreferrer">otvoriť úlohu ↗</a> : '—'}</dd>
            <dt>Stav v HubSpote</dt><dd>{lead.hubspot_lifecycle || '—'}{lead.hubspot_lead_status ? ` · ${lead.hubspot_lead_status}` : ''}</dd>
          </dl>
          {lead.notes && <><h3 className="eko-h3">Posledná poznámka</h3><p className="crm-note">{lead.notes}</p></>}
          <p className="eko-fine">Zmeny štádia sa zapisujú do HubSpotu aj Asany na pozadí (do minúty). {s.id === 'client' ? 'Klient: v HubSpote má lifecycle Customer.' : ''}</p>
          <Link className="eko-link" href="/crm">← Späť na leady</Link>
        </section>
      </div>
    </div>
  )
}
