'use client'
import CallScript from './CallScript'
import CallNotes from './CallNotes'
import LeadTasks from './LeadTasks'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { countdown, stageOf, SOURCES, CITY_GROUPS, originLabel, isFreshOrigin } from '@/lib/crm'
import { Ring, Pill, ContactButtons, StageBar, stateOf, fmtDT, firstName } from './ui'
import { setStage, logContact, addNote, assignLead, setCity, setKind, updateLead } from '@/app/crm/actions'

const TYPES = { stage_change: 'Zmena štádia', call: 'Hovor', whatsapp: 'WhatsApp', email: 'E-mail', sms: 'SMS', note: 'Poznámka', system: 'Systém' }
const HUB = 'https://app.hubspot.com/contacts/48987752/record/0-1/'

const FIELD_LABELS = { name: 'meno', phone: 'telefón', email: 'e-mail', city: 'mesto', city_group: 'mesto', source: 'zdroj', property_address: 'adresa bytu' }
function describe(e, people) {
  const p = e.payload || {}
  if (e.type === 'stage_change') return `${stageOf(p.from).label} → ${stageOf(p.to).label}${p.lost_reason ? ' (' + p.lost_reason + ')' : ''}${p.via ? ' · z ' + p.via : ''}${p.note ? ': ' + p.note : ''}`
  if (e.type === 'system' && p.edited) return 'Upravené údaje: ' + p.edited.map((k) => FIELD_LABELS[k] || k).join(', ')
  if (e.type === 'system') return p.via === 'zapier' ? 'Lead prišiel zo Zapieru' : p.via === 'manual' ? 'Lead pridaný ručne' : p.assigned_to ? 'Priradený: ' + firstName(p.assigned_to, people) : 'Systém'
  if (e.type === 'note') return p.note || ''
  return p.note ? p.note : ''
}

export default function LeadDetail({ lead: initial, events: initialEvents, tasks = [], people, me, serverNow }) {
  const router = useRouter()
  const [lead, setLead] = useState(initial)
  const [events, setEvents] = useState(initialEvents)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null)
  const [busy, start] = useTransition()
  const [now, setNow] = useState(() => serverNow || Date.now())
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  const st = stateOf(lead, now), c = countdown(lead.due_at, now)
  const refresh = () => router.refresh()
  const doStage = (stage, opts) => start(async () => { setErr(''); const r = await setStage(lead.id, stage, opts || {}); if (!r.ok) { setErr(r.error); return } setLead({ ...lead, stage, kind: stage === 'client' ? 'client' : lead.kind, first_contact_at: lead.first_contact_at || (lead.stage === 'new' && stage !== 'new' ? new Date().toISOString() : null) }); refresh() })
  const doLog = (type) => { logContact(lead.id, type).then(() => refresh()).catch(() => {}) }
  const saveNote = () => start(async () => { setErr(''); const r = await addNote(lead.id, note); if (!r.ok) { setErr(r.error); return } setEvents([{ id: 'tmp' + Date.now(), at: new Date().toISOString(), type: 'note', payload: { note }, user_name: me.name }, ...events]); setNote(''); refresh() })
  const saveEdit = () => start(async () => { setErr(''); const r = await updateLead(lead.id, edit); if (!r.ok) { setErr(r.error); return } setLead({ ...lead, ...r.patch }); setEdit(null); refresh() })
  const s = stageOf(lead.stage)
  return (
    <div className="crm crm-detail">
      <div className="crm-detail-grid">
      <div className="crm-detail-main">
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
      <CallScript compact />
      </div>
      <aside className="crm-detail-side"><CallNotes value={note} onChange={setNote} onSave={saveNote} busy={busy} /><LeadTasks lead={lead} tasks={tasks} people={people} onChanged={refresh} /></aside>
      </div>
      <div className="eko-two">
        <section className="card">
          <h2>História</h2>
          <ul className="crm-hist">{events.map((e) => <li key={e.id}><span className={'crm-ev t-' + e.type}>{TYPES[e.type] || e.type}</span><div><b>{describe(e, people)}</b><small>{fmtDT(e.at)} · {e.user_name || 'automaticky'}</small></div></li>)}{!events.length && <li className="eko-fine">Zatiaľ bez udalostí.</li>}</ul>
        </section>
        <section className="card">
          <div className="crm-row-head"><h2>Údaje</h2>{!edit && <button type="button" className="eko-link" onClick={() => setEdit({ name: lead.name || '', phone: lead.phone || '', email: lead.email || '', city: lead.city || '', source: lead.source || '', property_address: lead.property_address || '' })}>✎ Upraviť</button>}</div>
          {edit ? (
            <form className="crm-editform" onSubmit={(e) => { e.preventDefault(); saveEdit() }}>
              <label>Meno<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={160} autoFocus /></label>
              <label>Telefón<input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputMode="tel" placeholder="+421 900 123 456" /></label>
              <label>E-mail<input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} inputMode="email" /></label>
              <label>Mesto / lokalita<input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} placeholder="Bratislava, Košice, Trnava…" /></label>
              <label>Zdroj<select value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })}><option value="">neznámy</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Adresa bytu<input value={edit.property_address} onChange={(e) => setEdit({ ...edit, property_address: e.target.value })} placeholder="ulica a číslo" /></label>
              <div className="crm-two"><button type="submit" className="btn" disabled={busy}>Uložiť</button><button type="button" className="btn line" onClick={() => setEdit(null)}>Zrušiť</button></div>
              <p className="eko-fine">Zmena sa zapíše do histórie a do HubSpotu.</p>
            </form>
          ) : (
          <dl className="crm-dl">
            <dt>Telefón</dt><dd>{lead.phone || '—'}</dd>
            <dt>E-mail</dt><dd>{lead.email || '—'}{lead.email_optout ? ' (odhlásený z e-mailov)' : ''}</dd>
            <dt>Mesto</dt><dd><select value={lead.city_group || 'Iné'} onChange={(e) => start(async () => { const g = e.target.value; const r = await setCity(lead.id, g); if (r.ok) setLead({ ...lead, ...r.patch }); else setErr(r.error) })}>{CITY_GROUPS.map((c) => <option key={c} value={c}>{c}</option>)}</select>{lead.city && lead.city !== lead.city_group ? <small className="muted"> {lead.city}</small> : null}{(lead.city_group === 'Iné' || !lead.city_group) && <small className="crm-low"> · mimo našich miest, nepočíta sa do úspešnosti</small>}</dd>
            <dt>Zdroj</dt><dd>{lead.source || '—'}</dd>
            <dt>Pôvod záznamu</dt><dd>{lead.origin ? <>{originLabel(lead.origin)}{lead.origin_detail ? <small className="muted"> · {lead.origin_detail}</small> : null}{!isFreshOrigin(lead.origin) && <small className="crm-low"> · hromadný prenos, nie čerstvý dopyt</small>}</> : '—'}{lead.hs_created_at ? <small className="muted"> · v HubSpote od {fmtDT(lead.hs_created_at)}</small> : null}</dd>
            <dt>Komu</dt><dd><select value={lead.assigned_to || ''} onChange={(e) => start(async () => { const v = e.target.value; const r = await assignLead(lead.id, v); if (r.ok) setLead({ ...lead, assigned_to: v }); else setErr(r.error) })}><option value="">nepriradený</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select></dd>
            <dt>Priorita</dt><dd>{lead.priority === 'high' ? 'vysoká' : lead.priority === 'normal' ? 'bežná' : 'nižšia (mimo BA, KE, TT)'}</dd>
            <dt>HubSpot</dt><dd>{lead.hubspot_contact_id ? <a href={HUB + lead.hubspot_contact_id} target="_blank" rel="noopener noreferrer">otvoriť kontakt ↗</a> : 'čaká na prepojenie'}</dd>
            <dt>Asana</dt><dd>{lead.asana_task_gid ? <a href={`https://app.asana.com/0/1203570903024669/${lead.asana_task_gid}`} target="_blank" rel="noopener noreferrer">otvoriť úlohu ↗</a> : 'prepojí sa pri najbližšej zmene (do minúty)'}</dd>
            <dt>Stav v HubSpote</dt><dd>{lead.hubspot_lifecycle || '—'}{lead.hubspot_lead_status ? ` · ${lead.hubspot_lead_status}` : ''}</dd>
          </dl>
          )}
          {lead.notes && <><h3 className="eko-h3">Posledná poznámka</h3><p className="crm-note">{lead.notes}</p></>}
          <p className="eko-fine">Štádium, poznámky, údaje aj priradenie sa zapisujú do HubSpotu a do úlohy v Asane na pozadí (do minúty); v Asane sa nevytvára duplikát, keď kontakt už úlohu má. {s.id === 'client' ? 'Klient: v HubSpote má lifecycle Customer.' : ''}</p>
          {lead.kind === 'lead' ? <button type="button" className="crm-notlead" onClick={() => { const reason = window.prompt('Prečo to nie je lead? (spam, mimo našich miest, nemá byt, duplicita)', 'Nerelevantný dopyt'); if (reason === null) return; start(async () => { setErr(''); const r = await setKind(lead.id, 'not_lead', reason); if (r.ok) { setLead({ ...lead, kind: 'not_lead', lost_reason: reason || 'Nie je lead' }); refresh() } else setErr(r.error) }) }}>✕ Nie je lead</button> : lead.kind === 'not_lead' ? <button type="button" className="eko-link" onClick={() => start(async () => { const r = await setKind(lead.id, 'lead'); if (r.ok) { setLead({ ...lead, kind: 'lead' }); refresh() } else setErr(r.error) })}>Predsa je to lead</button> : null}
          <Link className="eko-link" href="/crm">← Späť na leady</Link>
        </section>
      </div>
    </div>
  )
}
