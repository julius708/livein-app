'use client'
import { useState, useTransition } from 'react'
import { SERVICES } from '@/lib/crm-tasks'
import { draftIntroEmailAction, sendIntroEmailAction, createViewingAction, createCustomTaskAction, toggleTaskAction, setService } from '@/app/crm/actions'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '')
const toLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }
const KIND_ICON = { intro_email: '✉️', viewing: '📅', custom: '☑️' }

/** Úlohy k leadu: úvodný e-mail (náhľad, úprava, odoslanie), obhliadka (termín, navigácia, notifikácie), vlastná úloha. Každá je aj podúlohou v Asane. */
export default function LeadTasks({ lead, tasks = [], people = [], onChanged }) {
  const [busy, start] = useTransition(); const [mode, setMode] = useState(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const [svc, setSvc] = useState(lead.service || ''); const [draft, setDraft] = useState(null)
  const [view, setView] = useState({ at: toLocal(Date.now() + 864e5).slice(0, 11) + '10:00', address: lead.property_address || '', with: lead.assigned_to || '', note: '', client_note: '', email_client: !!lead.email })
  const [custom, setCustom] = useState({ title: '', due_at: '' })
  const run = (fn, done) => start(async () => { setErr(''); setOk(''); const r = await fn(); if (!r || !r.ok) { setErr((r && r.error) || 'Nepodarilo sa.'); return } if (done) done(r); onChanged && onChanged() })
  const changeService = (s) => { setSvc(s); if (s) run(() => setService(lead.id, s)) }
  const openEmail = () => { setMode('email'); setDraft(null); run(() => draftIntroEmailAction(lead.id, svc || lead.service || 'other'), (r) => setDraft({ subject: r.subject, body: r.body, to: r.to, ai: r.ai, service: r.service })) }
  const open = tasks.filter((t) => t.status === 'open'), done = tasks.filter((t) => t.status === 'done')
  return (
    <section className="card crm-tasks">
      <div className="crm-row-head"><h2>☑️ Úlohy</h2><label className="crm-svc">Služba <select value={svc} onChange={(e) => changeService(e.target.value)}><option value="">vyber…</option>{Object.entries(SERVICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
      <div className="crm-task-actions">
        <button type="button" className="btn" disabled={busy} onClick={openEmail}>✉️ Poslať úvodný e-mail</button>
        <button type="button" className="btn line" disabled={busy} onClick={() => setMode(mode === 'viewing' ? null : 'viewing')}>📅 Dohodnúť obhliadku</button>
        <button type="button" className="btn line" disabled={busy} onClick={() => setMode(mode === 'custom' ? null : 'custom')}>＋ Iná úloha</button>
      </div>
      {err && <p className="msg err">{err}</p>}{ok && <p className="msg ok">{ok}</p>}
      {mode === 'email' && (
        <div className="crm-task-form">
          {!draft ? <p className="eko-fine">Pripravujem návrh e-mailu z poznámok…</p> : (<>
            <p className="eko-fine">Komu: <b>{draft.to}</b> · šablóna: {SERVICES[draft.service]}{draft.ai ? ' · osobný odsek z poznámok doplnila AI' : ' · bez AI (nie sú poznámky)'}. Pred odoslaním si text uprav.</p>
            <label>Predmet<input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label>Text<textarea rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <div className="crm-two"><button type="button" className="btn" disabled={busy} onClick={() => run(() => sendIntroEmailAction(lead.id, { subject: draft.subject, body: draft.body, service: draft.service }), () => { setMode(null); setOk('E-mail odoslaný. Zapísané do histórie, HubSpotu aj Asany.') })}>Odoslať</button><button type="button" className="btn line" onClick={() => setMode(null)}>Zrušiť</button></div>
          </>)}
        </div>
      )}
      {mode === 'viewing' && (
        <div className="crm-task-form">
          <div className="crm-two"><label>Dátum a čas<input type="datetime-local" value={view.at} onChange={(e) => setView({ ...view, at: e.target.value })} /></label><label>Kto ide<select value={view.with} onChange={(e) => setView({ ...view, with: e.target.value })}>{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select></label></div>
          <label>Adresa bytu<input value={view.address} onChange={(e) => setView({ ...view, address: e.target.value })} placeholder="ulica a číslo, mesto" /></label>
          <label>Interná poznámka<input value={view.note} onChange={(e) => setView({ ...view, note: e.target.value })} placeholder="napr. kľúče má sused, zvoniť 2×" /></label>
          <label className="crm-check"><input type="checkbox" checked={view.email_client} disabled={!lead.email} onChange={(e) => setView({ ...view, email_client: e.target.checked })} /> Poslať klientovi potvrdenie e-mailom{!lead.email ? ' (lead nemá e-mail)' : ''}</label>
          {view.email_client && <label>Odkaz pre klienta (nepovinné)<input value={view.client_note} onChange={(e) => setView({ ...view, client_note: e.target.value })} placeholder="napr. prosíme pripraviť zmluvu o byte" /></label>}
          <div className="crm-two"><button type="button" className="btn" disabled={busy} onClick={() => run(() => createViewingAction(lead.id, { ...view, at: new Date(view.at).toISOString() }), (r) => { setMode(null); setOk(`Obhliadka uložená${r.asana ? ', v Asane aj v kalendári' : ''}${r.mailed ? ', klient dostal e-mail' : ''}.`) })}>Uložiť obhliadku</button><button type="button" className="btn line" onClick={() => setMode(null)}>Zrušiť</button></div>
        </div>
      )}
      {mode === 'custom' && (
        <div className="crm-task-form">
          <label>Čo treba urobiť<input value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} placeholder="napr. poslať cenovú ponuku, zavolať po dovolenke" autoFocus /></label>
          <label>Dokedy (nepovinné)<input type="datetime-local" value={custom.due_at} onChange={(e) => setCustom({ ...custom, due_at: e.target.value })} /></label>
          <div className="crm-two"><button type="button" className="btn" disabled={busy || custom.title.trim().length < 2} onClick={() => run(() => createCustomTaskAction(lead.id, { title: custom.title, due_at: custom.due_at ? new Date(custom.due_at).toISOString() : null }), () => { setMode(null); setCustom({ title: '', due_at: '' }) })}>Pridať</button><button type="button" className="btn line" onClick={() => setMode(null)}>Zrušiť</button></div>
        </div>
      )}
      <ul className="crm-tasklist">
        {open.map((t) => <li key={t.id}><label className="crm-check"><input type="checkbox" disabled={busy} onChange={() => run(() => toggleTaskAction(t.id, true))} /> <span>{KIND_ICON[t.kind]} <b>{t.title}</b>{t.due_at ? <small> · {fmt(t.due_at)}</small> : null}{t.kind === 'viewing' && t.payload && t.payload.maps ? <> · <a href={t.payload.maps} target="_blank" rel="noopener noreferrer">🧭 Navigovať</a></> : null}{t.payload && t.payload.with_name ? <small> · {t.payload.with_name}</small> : null}</span></label></li>)}
        {done.map((t) => <li key={t.id} className="done"><label className="crm-check"><input type="checkbox" checked disabled={busy} onChange={() => run(() => toggleTaskAction(t.id, false))} /> <span>{KIND_ICON[t.kind]} {t.title}<small> · hotovo {fmt(t.done_at)}</small>{t.kind === 'intro_email' && t.payload && t.payload.subject ? <details><summary>zobraziť e-mail</summary><pre>{t.payload.subject}\n\n{t.payload.body}</pre></details> : null}</span></label></li>)}
        {!tasks.length && <li className="eko-fine">Zatiaľ bez úloh. Každá úloha vznikne aj ako podúloha v Asane.</li>}
      </ul>
    </section>
  )
}
