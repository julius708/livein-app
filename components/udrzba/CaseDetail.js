'use client'
import { useState, useTransition } from 'react'
import { setHandlingAction, transitionAction, markDuplicateAction, linkIncidentAction, sendRequestsAction, confirmDraftQuoteAction, selectQuoteAction, createOrderAction, scheduleCallAction, shareAccessAction, addWorkAction, closeCaseAction, resyncAsanaAction } from '@/app/udrzba/actions'
import { STATUSES, SEVERITIES, ROLES, categoryOf, approvalNeed, compareQuotes, financeBlockers } from '@/lib/maint'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '')
const eur = (n) => `${Number(n || 0).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const VAT = { with_vat: 's DPH', without_vat: 'bez DPH (pripočíta sa 23 %)', not_vat_payer: 'neplatca DPH' }
const APPR = { pending: 'pripravuje sa', sent: 'odoslané', delivered: 'doručené', approved: 'SCHVÁLENÉ', declined: 'ODMIETNUTÉ', question: 'otázka', no_response: 'bez odpovede', invalidated: 'neplatné (zmena ponuky)', bounced: 'nedoručené', suppressed: 'neodoslané (test režim)' }
const EVT = { created: 'Prípad založený', duty_notified: 'Služba upozornená', status: 'Zmena stavu', handling: 'Rozhodnutie údržbára', request_sent: 'Dopyt vytvorený', request_emailed: 'Dopyt odoslaný e-mailom', request_declined: 'Dodávateľ odmietol', quote_received: 'Ponuka prijatá', quote_confirmed: 'Ponuka z e-mailu potvrdená', quote_selected: 'Ponuka vybraná', approved_by_limit: 'Schválené podľa limitu', approver_missing: 'Chýba schvaľovateľ', approval_created: 'Súhlas pripravený', email_sent: 'E-mail majiteľovi odoslaný', email_delivered: 'E-mail doručený', email_bounced: 'E-mail nedoručený', email_failed: 'E-mail zlyhal', email_suppressed: 'E-mail neodoslaný (test režim)', reminder_sent: 'Pripomienka', owner_no_response: 'Majiteľ neodpovedal (eskalácia)', owner_decision: 'Rozhodnutie majiteľa', approval_invalidated: 'Súhlas zneplatnený', order_created: 'Objednávka vytvorená', access_shared: 'Prístup zdieľaný', call_scheduled: 'Hovor naplánovaný', call_placed: 'Hovor vytočený', call_failed: 'Hovor zlyhal', call_status: 'Stav hovoru', work_logged: 'Záznam práce', finance_closed: 'Finančne uzavreté', vendor_no_response: 'Dodávateľ neodpovedal', incident_linked: 'Spoločný incident', transcript_linked: 'Prepis priradený' }
const STEPS = [['new', 'Hlásenie'], ['quoting', 'Dopyty'], ['comparing', 'Ponuky'], ['awaiting_approval', 'Súhlas'], ['ordered', 'Objednané'], ['done', 'Opravené'], ['closed', 'Uzavreté']]
const ORDER = ['new', 'triage', 'internal', 'quoting', 'comparing', 'awaiting_approval', 'question', 'no_response', 'declined', 'approved', 'ordered', 'in_progress', 'done', 'closed']

function useAct() {
  const [busy, start] = useTransition(); const [msg, setMsg] = useState(null)
  const run = (fn) => start(async () => { setMsg(null); const r = await fn(); setMsg(r && r.ok ? { ok: true, text: r.url ? `Hotovo. Odkaz pre majiteľa: ${r.url}` : r.mode === 'within_limit' ? 'V limite: schválené pravidlom.' : r.links ? `Dopyty vytvorené (${r.links.length}).` : 'Hotovo.' , links: r.links } : { ok: false, text: (r && r.error) || 'Nepodarilo sa.' }) })
  return { busy, msg, run }
}
function Msg({ m }) { return m ? <p className={m.ok ? 'okmsg' : 'err'}>{m.text}{m.links && m.links.map((l) => <><br /><small>{l.url}</small></>)}</p> : null }

export default function CaseDetail({ c, quotes = [], requests = [], approvals = [], order, calls = [], work = [], events = [], vendors = [], settings = {}, me }) {
  const { busy, msg, run } = useAct()
  const [tried, setTried] = useState(''); const [dup, setDup] = useState(''); const [inc, setInc] = useState(''); const [sel, setSel] = useState([]); const [acc, setAcc] = useState({ from: '', until: '', note: '' }); const [w, setW] = useState({ entry_type: 'work', minutes: '', description: '', amount: '', billed_to: 'owner', receipt_url: '', receipt_number: '' })
  const cat = categoryOf(c.category)
  const snap = c.approver_snapshot || {}
  const live = approvals.find((a) => ['pending', 'sent', 'delivered', 'question', 'no_response'].includes(a.status))
  const lastAppr = approvals[0]
  const selected = quotes.find((q) => q.id === c.selected_quote_id)
  const need = selected ? approvalNeed({ total: selected.total, severity: c.severity, settings: snap }) : null
  const cmp = compareQuotes(quotes.filter((q) => q.status !== 'superseded' && !q.draft))
  const blockers = financeBlockers(work)
  const stepIdx = ORDER.indexOf(c.status)
  const closed = ['closed', 'cancelled', 'duplicate'].includes(c.status)
  const prof = vendors.filter((v) => v.active && (!c.profession || (v.professions || []).some((p) => p.toLowerCase().includes(String(c.profession).toLowerCase().split(' ')[0]))))
  const others = vendors.filter((v) => v.active && !prof.includes(v))
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <div className="ud">
      <div className="ud-head">
        <div><a href="/udrzba" className="hint">← Prípady</a><h1>{c.ref} · {c.listing_name || c.listing_id}</h1><p className="row"><span className={`ud-pill ${c.severity}`}>{SEVERITIES[c.severity]?.label}</span><span className={`ud-pill st-${c.status}`}>{STATUSES[c.status] || c.status}</span><span className="ud-pill">{cat.label}</span>{c.profession && <span className="ud-pill">{c.profession}</span>}<span className="ud-pill">{ROLES[c.assigned_role] || c.assigned_role}</span>{c.urgent_override && <span className="ud-pill emergency">urgent: {c.urgent_reason}</span>}</p></div>
        <div className="ud-steps">{STEPS.map(([k, l]) => <span key={k} className={ORDER.indexOf(k) < stepIdx ? 'done' : ORDER.indexOf(k) === stepIdx || (k === 'awaiting_approval' && ['question', 'no_response', 'declined', 'approved'].includes(c.status)) || (k === 'ordered' && c.status === 'in_progress') ? 'on' : ''}>{l}</span>)}</div>
      </div>
      <Msg m={msg} />
      <div className="ud-grid">
        <section className="card">
          <h2>Hlásenie</h2>
          <div className="ud-kv">
            <b>Príznaky</b><span style={{ whiteSpace: 'pre-wrap' }}>{c.symptoms}</span>
            <b>Dopad</b><span>{{ none: 'bez dopadu na hostí', limited: 'obmedzený', blocking: 'blokujúci' }[c.guest_impact]}{c.guest_present ? ' · hosť je v byte' : ''}</span>
            <b>Termín</b><span>{fmt(c.due_at)}{c.due_at && Date.parse(c.due_at) < Date.now() && !closed ? ' · PO TERMÍNE' : ''}</span>
            <b>Nahlásil</b><span>{c.created_by_name} · {fmt(c.created_at)} · zdroj {c.source}</span>
            {c.photos && c.photos.length > 0 && <><b>Fotky</b><span>{c.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer">foto {i + 1} </a>)}</span></>}
            {c.duplicate_of && <><b>Duplikát</b><span><a href={`/udrzba/${c.duplicate_of}`}>pôvodný prípad</a></span></>}
            {c.incident && <><b>Incident</b><span>{c.incident.title}</span></>}
            <b>Asana</b><span>{c.asana_gid ? <a href={`https://app.asana.com/0/0/${c.asana_gid}`} target="_blank" rel="noreferrer">úloha {c.asana_gid}</a> : 'zatiaľ bez úlohy'} <button type="button" className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={() => run(() => resyncAsanaAction(c.id))}>Znova synchronizovať</button></span>
            <b>Schvaľovateľ</b><span>{snap.approver_email ? `${snap.approver_name || ''} ${snap.approver_email}${snap.approver_phone ? ' · ' + snap.approver_phone : ''} · limit bežný ${eur(snap.routine_limit)} / havarijný ${eur(snap.emergency_limit)}` : <span className="err">byt nemá schvaľovateľa ani limit (doplň v nastaveniach bytov)</span>}</span>
          </div>
          {!closed && (
            <div className="row" style={{ marginTop: 12 }}>
              {['new', 'triage'].includes(c.status) && <><button className="btn" disabled={busy} onClick={() => run(() => setHandlingAction(c.id, 'internal_take'))}>Preberám (interný údržbár)</button><button className="btn line" disabled={busy} onClick={() => run(() => setHandlingAction(c.id, 'needs_specialist'))}>Treba špecialistu</button></>}
              {c.status === 'internal' && <><button className="btn" disabled={busy} onClick={() => run(() => transitionAction(c.id, 'done', 'opravené interne'))}>Opravené interne</button><button className="btn line" disabled={busy} onClick={() => run(() => setHandlingAction(c.id, 'needs_specialist'))}>Predsa treba špecialistu</button></>}
              {c.status === 'ordered' && <button className="btn" disabled={busy} onClick={() => run(() => transitionAction(c.id, 'in_progress'))}>Oprava prebieha</button>}
              {['ordered', 'in_progress'].includes(c.status) && <button className="btn" disabled={busy} onClick={() => run(() => transitionAction(c.id, 'done'))}>Opravené</button>}
              {c.status === 'declined' && <button className="btn line" disabled={busy} onClick={() => run(() => transitionAction(c.id, 'comparing', 'nové kolo ponúk'))}>Nové ponuky</button>}
              <button className="btn line danger" disabled={busy} onClick={() => { if (confirm('Zrušiť prípad?')) run(() => transitionAction(c.id, 'cancelled', 'zrušené tímom')) }}>Zrušiť</button>
            </div>
          )}
          {['new', 'triage'].includes(c.status) && <div className="two" style={{ marginTop: 10 }}><label>Duplikát prípadu č.<span className="row"><input type="text" placeholder="U-26-0001" value={dup} onChange={(e) => setDup(e.target.value)} /><button className="btn line" disabled={busy || !dup} onClick={() => run(() => markDuplicateAction(c.id, dup))}>Označiť</button></span></label><label>Spoločný incident (viac bytov)<span className="row"><input type="text" placeholder="napr. Výpadok kúrenia Dunajská" value={inc} onChange={(e) => setInc(e.target.value)} /><button className="btn line" disabled={busy || inc.length < 3} onClick={() => run(() => linkIncidentAction(c.id, inc))}>Priradiť</button></span></label></div>}
        </section>

        <section className="card">
          <h2>Dopyty a ponuky</h2>
          {requests.length > 0 && <table><thead><tr><th>Dodávateľ</th><th>Stav</th><th>Platí do</th></tr></thead><tbody>{requests.map((r) => <tr key={r.id}><td>{r.vendor?.name}{r.is_backup ? ' (záloha)' : ''}<br /><small className="hint">{r.channel === 'manual' ? 'bez e-mailu, odkaz zdieľaj ručne' : r.channel}</small></td><td>{{ sent: 'odoslané', viewed: 'otvorené', offered: 'ponuka', declined: 'odmietol', expired: 'vypršalo', cancelled: 'zrušené' }[r.status]}</td><td>{fmt(r.expires_at)}</td></tr>)}</tbody></table>}
          {!closed && !['ordered', 'in_progress', 'done'].includes(c.status) && (
            <details open={requests.length === 0 && c.status !== 'internal'} style={{ marginTop: 8 }}>
              <summary className="hint" style={{ cursor: 'pointer', fontWeight: 700 }}>Poslať dopyt dodávateľom{c.severity === 'emergency' ? ' (havária: môžeš viacerým naraz)' : ''}</summary>
              {vendors.length === 0 && <p className="hint">Najprv pridaj dodávateľov v sekcii Dodávatelia.</p>}
              {[...prof, ...others].map((v) => <label key={v.id} className="chk"><input type="checkbox" checked={sel.includes(v.id)} onChange={() => toggle(v.id)} /> {v.name} <small className="hint">{(v.professions || []).join(', ')}{v.locality ? ` · ${v.locality}` : ''}{v.callout_fee != null ? ` · výjazd ${eur(v.callout_fee)}` : ''}{v.is_primary ? ' · primárny' : ''}{v.backup_of ? ' · záložný' : ''}{!v.email ? ' · bez e-mailu' : ''}</small></label>)}
              <div className="row" style={{ marginTop: 8 }}><button className="btn" disabled={busy || !sel.length} onClick={() => run(() => sendRequestsAction(c.id, sel, false))}>Poslať dopyt ({sel.length})</button><button className="btn line" disabled={busy || !sel.length} onClick={() => run(() => sendRequestsAction(c.id, sel, true))}>Poslať ako zálohu</button></div>
            </details>
          )}
          {quotes.length > 0 && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {quotes.map((q) => {
              const isSel = q.id === c.selected_quote_id, old = q.status === 'superseded'
              return (
                <div key={q.id} className={`ud-quote${isSel ? ' sel' : ''}${old ? ' old' : ''}${q.draft ? ' draft' : ''}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{q.vendor?.name || 'dodávateľ'} · v{q.version} · {q.kind === 'replacement' ? 'VÝMENA' : 'oprava'}{q.draft ? ' · NÁVRH z e-mailu (skontroluj)' : ''}{old ? ' · stará verzia' : ''}{cmp.length && cmp[0].id === q.id && !old ? ' · najlacnejšia' : ''}</b><span className="tot">{eur(q.total)}</span></div>
                  <small className="hint">{VAT[q.vat_mode]} · výjazd {eur(q.callout)} · diagnostika {eur(q.diagnostics)} · materiál {eur(q.material)}{q.eta ? ` · termín ${q.eta}` : ''}{q.valid_until ? ` · platí do ${q.valid_until}` : ''} · zdroj {q.source}{q.confidence != null ? ` (istota ${Math.round(q.confidence * 100)} %)` : ''}</small>
                  {q.items && q.items.length > 0 && <ul className="ud-items">{q.items.map((it, i) => <li key={i}>{it.name} × {it.qty} à {eur(it.price)}</li>)}</ul>}
                  {q.replacement && <small>Výmena: {q.replacement.reason} · model {q.replacement.model} · cena {eur(q.replacement.price)} · montáž {eur(q.replacement.installation)} · odvoz {eur(q.replacement.disposal)}</small>}
                  {q.not_repairable && <small className="err">Neopraviteľné: {q.not_repairable}</small>}
                  {q.note && <small style={{ whiteSpace: 'pre-wrap' }}>{q.note.slice(0, 400)}</small>}
                  {q.attachments && q.attachments.length > 0 && <small>{q.attachments.map((a, i) => <a key={i} href={a.url || '#'} target="_blank" rel="noreferrer">{a.name || `príloha ${i + 1}`} </a>)}</small>}
                  {!closed && !old && (
                    <div className="row">
                      {q.draft ? <button className="btn line" disabled={busy} onClick={() => { const total = prompt('Potvrď celkovú sumu ponuky (€):', q.total); if (total != null) run(() => confirmDraftQuoteAction(c.id, q.id, { total: Number(String(total).replace(',', '.')) })) }}>Skontrolované, potvrdiť ponuku</button>
                        : !isSel && !['ordered', 'in_progress', 'done'].includes(c.status) && <button className="btn" disabled={busy} onClick={() => run(() => selectQuoteAction(c.id, q.id, tried))}>Vybrať túto ponuku</button>}
                    </div>
                  )}
                </div>
              )
            })}
            {!closed && ['comparing', 'quoting', 'declined', 'question', 'no_response', 'awaiting_approval'].includes(c.status) && <label>Čo tím skúsil (ide do e-mailu majiteľovi)<textarea rows={2} value={tried} onChange={(e) => setTried(e.target.value)} placeholder="napr. reštart kotla, kontrola tlaku, bez výsledku" /></label>}
          </div>}
        </section>

        <section className="card">
          <h2>Súhlas majiteľa a objednávka</h2>
          {selected && need && <p className="hint">Vybraná ponuka {eur(selected.total)} · {need.needed ? (need.blocked ? 'bez schvaľovateľa' : `nad limit ${eur(need.limit)} → súhlas majiteľa e-mailom`) : `v limite ${eur(need.limit)} → schválené pravidlom`}</p>}
          {approvals.length > 0 && <table><thead><tr><th>Súhlas</th><th>Stav</th><th>Čas</th></tr></thead><tbody>{approvals.map((a) => <tr key={a.id}><td>v{a.quote_version} · {eur(a.quote_total)}<br /><small className="hint">{a.recipient_email}</small></td><td><b>{APPR[a.status] || a.status}</b>{a.decision_note ? <><br /><small>{a.decision_note}</small></> : null}{a.reminder_count ? <><br /><small>pripomienok: {a.reminder_count}</small></> : null}</td><td>{fmt(a.decided_at || a.delivered_at || a.sent_at || a.created_at)}</td></tr>)}</tbody></table>}
          {lastAppr && lastAppr.status === 'suppressed' && <p className="err">Test režim: adresa schvaľovateľa nie je medzi povolenými, e-mail neodišiel. Pridaj ju v nastaveniach pilotu alebo vyber ponuku znova po zmene.</p>}
          {lastAppr && lastAppr.status === 'bounced' && <p className="err">E-mail sa nedoručil. Získaj súhlas inak a vyber ponuku znova s opraveným kontaktom.</p>}
          {c.status === 'no_response' && <p className="err">Majiteľ neodpovedal v termíne. Mlčanie nie je súhlas: zavolaj, alebo vyber ponuku znova (pošle sa nový e-mail).</p>}
          {c.status === 'question' && <p className="err">Majiteľ má otázku (pozri poznámku). Odpovedz mu a potom vyber ponuku znova, aby dostal nový odkaz.</p>}
          {!closed && live && ['sent', 'delivered'].includes(live.status) && <div className="row"><button className="btn line" disabled={busy} onClick={() => run(() => scheduleCallAction(c.id))}>📞 Naplánovať hovor majiteľovi (AI agent)</button><small className="hint">Hovor vysvetlí ponuku, rozhodnutie ostáva na odkaze v e-maile. Poskytovateľ: {settings.telephony?.provider || 'test'}.</small></div>}
          {calls.length > 0 && <table style={{ marginTop: 8 }}><thead><tr><th>Hovor</th><th>Stav</th><th>Výsledok</th></tr></thead><tbody>{calls.map((k) => <tr key={k.id}><td>{fmt(k.scheduled_at)} · {k.provider} · pokus {k.attempts}</td><td>{k.status}</td><td>{k.result || ''}</td></tr>)}</tbody></table>}
          {c.status === 'approved' && !order && <div className="row" style={{ marginTop: 8 }}><button className="btn o" disabled={busy} onClick={() => run(() => createOrderAction(c.id))}>Objednať u {selected?.vendor?.name || 'dodávateľa'}</button><small className="hint">{settings.pilot?.enabled ? '' : 'Pilot je vypnutý: objednávka sa len eviduje, dodávateľovi nič neodíde.'}</small></div>}
          {order && <div className="ud-kv" style={{ marginTop: 8 }}>
            <b>Objednávka</b><span>{order.status} · autorizoval {order.authorized_by} · {fmt(order.created_at)}{order.approval_id ? ' · na základe súhlasu majiteľa' : ' · v limite'}</span>
            <b>Prístup do bytu</b><span>{order.access_from ? `${fmt(order.access_from)} – ${fmt(order.access_until)} · ${order.access_note || ''}` : 'ešte nezdieľaný'}</span>
          </div>}
          {order && !closed && ['ordered', 'in_progress'].includes(c.status) && <details style={{ marginTop: 8 }}><summary className="hint" style={{ cursor: 'pointer', fontWeight: 700 }}>Zdieľať prístup vybranému technikovi (len na potrebný čas)</summary>
            <div className="two"><label>Od<input type="datetime-local" value={acc.from} onChange={(e) => setAcc({ ...acc, from: e.target.value })} /></label><label>Do<input type="datetime-local" value={acc.until} onChange={(e) => setAcc({ ...acc, until: e.target.value })} /></label></div>
            <label>Poznámka (bez kódov a hesiel, tie idú overeným kanálom)<input type="text" value={acc.note} onChange={(e) => setAcc({ ...acc, note: e.target.value })} /></label>
            <button className="btn" disabled={busy || !acc.from || !acc.until} onClick={() => run(() => shareAccessAction(c.id, order.id, new Date(acc.from).toISOString(), new Date(acc.until).toISOString(), acc.note))}>Potvrdiť vstup a zdieľať</button>
          </details>}
        </section>

        <section className="card">
          <h2>Práca, materiál, doklady</h2>
          {work.length > 0 && <table><thead><tr><th>Typ</th><th>Popis</th><th>Suma / čas</th><th>Komu</th></tr></thead><tbody>{work.map((x) => <tr key={x.id}><td>{{ work: 'práca', material: 'materiál', receipt: 'doklad', note: 'poznámka', fee: 'poplatok' }[x.entry_type]}</td><td>{x.description}{x.receipt?.number ? ` · č. ${x.receipt.number}` : ''}{x.receipt?.url ? <> · <a href={x.receipt.url} target="_blank" rel="noreferrer">doklad</a></> : null}<br /><small className="hint">{x.created_by_name} · {fmt(x.created_at)}</small></td><td>{x.amount != null ? eur(x.amount) : ''}{x.minutes ? ` ${x.minutes} min` : ''}</td><td>{x.billed_to || ''}</td></tr>)}</tbody></table>}
          {!closed && <div className="ud-form" style={{ marginTop: 8 }}>
            <div className="two"><label>Typ<select value={w.entry_type} onChange={(e) => setW({ ...w, entry_type: e.target.value })}><option value="work">Práca (čas)</option><option value="material">Materiál</option><option value="receipt">Doklad / faktúra</option><option value="note">Poznámka</option></select></label><label>Fakturačný adresát<select value={w.billed_to} onChange={(e) => setW({ ...w, billed_to: e.target.value })}><option value="owner">majiteľ</option><option value="livein">LIVE-IN</option><option value="vendor">dodávateľ</option><option value="guest">hosť</option></select></label></div>
            <label>Popis<input type="text" value={w.description} onChange={(e) => setW({ ...w, description: e.target.value })} /></label>
            <div className="two"><label>Minúty<input type="number" min={0} value={w.minutes} onChange={(e) => setW({ ...w, minutes: e.target.value })} /></label><label>Suma €<input type="number" min={0} step="0.01" value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} /></label></div>
            {w.entry_type === 'receipt' && <div className="two"><label>Číslo dokladu<input type="text" value={w.receipt_number} onChange={(e) => setW({ ...w, receipt_number: e.target.value })} /></label><label>Odkaz na doklad<input type="url" value={w.receipt_url} onChange={(e) => setW({ ...w, receipt_url: e.target.value })} /></label></div>}
            <div className="row"><button className="btn line" disabled={busy || !w.description} onClick={() => run(async () => { const r = await addWorkAction(c.id, w); if (r.ok) setW({ ...w, description: '', minutes: '', amount: '', receipt_url: '', receipt_number: '' }); return r })}>Pridať záznam</button></div>
          </div>}
          {blockers.length > 0 && <p className="err">Finančné uzavretie blokuje: {blockers.join('; ')}</p>}
          {c.finance_status === 'closed' && <p className="okmsg">Finančne uzavreté.</p>}
          {!closed && ['done', 'declined'].includes(c.status) && <div className="row" style={{ marginTop: 8 }}><button className="btn" disabled={busy} onClick={() => run(() => closeCaseAction(c.id))}>Uzavrieť prípad (finančne)</button><small className="hint">Poplatok {settings.fee?.enabled && settings.fee?.terms_approved ? `${settings.fee.amount_eur} € za bežnú opravu do ${settings.fee.max_minutes} min sa pripočíta` : 'je vypnutý alebo bez schválených podmienok'}.</small></div>}
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Audit</h2>
          <ul className="ud-log">{events.map((e) => <li key={e.id}><time>{fmt(e.created_at)}</time><span><b>{EVT[e.type] || e.type}</b> · {e.actor || 'system'}{e.payload && Object.keys(e.payload).length ? <small className="hint"> · {JSON.stringify(e.payload).slice(0, 220)}</small> : null}</span></li>)}</ul>
        </section>
      </div>
    </div>
  )
}
