'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { INQ_STATUS, inqStatusLabel, decisionLabel } from '@/lib/inv-core'
import { budgetSummary } from '@/lib/inv-inquiry'
import { eur, eur2, pct1 } from '@/lib/inv-fmt'
import { fmtDate, fmtDateTime } from '@/lib/fmt'
import { decideMatchAction, confirmInquiryAction, updateInquiryAction, prepareOfferAction, addTaskAction, completeTaskAction, recordViewingAction } from '@/app/investicie/actions'
import { useAct, Toast, StatusPill } from './ui'
import InquiryForm from './InquiryForm'
import { describeEvent } from './describe'

function Financing({ r }) {
  const f = r.financing
  if (!f || f.none) return null
  const b = r.metrics_base
  return (
    <div className="iv-hint" style={{ margin: '6px 0' }}>
      <b>Úver {eur(f.loan)}:</b>{' '}
      {f.incomplete ? <span className="iv-unknown">chýba {f.missing.map((m) => (m === 'rate_pct' ? 'úroková sadzba' : 'splatnosť')).join(' a ')}: splátky ani cashflow po splátkach sa nepočítajú</span> : <>splátka {eur2(f.payment)}/mes. · v 1. roku úrok {eur(f.interestYear1)} a istina {eur(f.principalYear1)} · sadzba {String(f.rate_pct).replace('.', ',')} % {f.rate_documented ? `(${f.rate_source}, ${fmtDate(f.rate_date)})` : <span className="iv-unknown">(zdroj a dátum sadzby nie sú zadané)</span>}</>}
      {b && b.cashflow_year != null && <> · cashflow po splátkach {eur(b.cashflow_month)}/mes. · výnos z vlastných zdrojov {pct1(b.cash_on_cash_pct)} (vlastné zdroje {eur(b.equity)}){b.provisional ? ' · predbežne' : ''}</>}
    </div>
  )
}

function MatchCard({ m, p, sel, toggleSel, q, run, pending }) {
  const r = m.result || {}
  const [rej, setRej] = useState(''), [rejOpen, setRejOpen] = useState(false), [vw, setVw] = useState('')
  const rejected = m.decision === 'rejected'
  return (
    <div className={`iv-match ${m.category}${rejected ? ' rej' : ''}`}>
      <div>{m.category === 'match' && !rejected && m.decision !== 'offer' && <input type="checkbox" checked={sel} onChange={toggleSel} aria-label="Vybrať do porovnania alebo ponuky" />}<div className="iv-score">{m.score}<small>skóre</small></div></div>
      <div style={{ minWidth: 0 }}>
        <div><Link href={`/investicie/n/${p.id}`} style={{ fontWeight: 800 }}>{[p.address || p.district, p.city].filter(Boolean).join(', ') || 'Nehnuteľnosť'}</Link> <StatusPill status={p.status} /> <span className="iv-pill muted">{decisionLabel(m.decision)}</span>{m.needs_review && <span className="iv-pill warn">na opätovné posúdenie: {m.review_reason}</span>}</div>
        <div className="iv-hint">{[p.rooms ? `${p.rooms}-izb.` : null, p.area_interior ? `${String(p.area_interior).replace('.', ',')} m²` : null].filter(Boolean).join(' · ')} · cena {p.price ? eur(p.price) : '—'} · celková investícia {r.budget && r.budget.total != null ? eur(r.budget.total) : '—'}{r.budget && r.budget.unknown && r.budget.unknown.length ? <span className="iv-unknown"> (aspoň; chýba {r.budget.unknown.length})</span> : ''}</div>
        <div className="iv-reasons">
          {(r.hard || []).map((h) => <div key={h.key} className={h.state === 'pass' ? 'p' : h.state === 'fail' ? 'f' : 'u'}>{h.label}{h.detail ? `: ${h.detail}` : ''}{h.state === 'unknown' ? ' (nemožno overiť)' : ''}</div>)}
          {(r.preferences || []).map((h) => <div key={h.key} className={h.state === 'pass' ? 'p' : h.state === 'fail' ? 'f' : 'u'}>Preferencia – {h.label}{h.detail ? `: ${h.detail}` : ''}</div>)}
        </div>
        <Financing r={r} />
        <div className="iv-hint"><b>Poradie:</b> {r.rank_reason}{r.next_step ? <> · <b>Ďalší krok:</b> {r.next_step}</> : null}{r.economics ? <> · <b>Výhodnosť:</b> {r.economics.label}</> : null}</div>
        {m.viewing_at && <div className="iv-hint">Obhliadka: {fmtDateTime(m.viewing_at)}{m.viewing_note ? ` · ${m.viewing_note}` : ''}</div>}
        {rejected && <div className="iv-hint">Zamietnuté: {m.decision_reason}</div>}
        {m.category !== 'unavailable' && (
          <div className="iv-actions" style={{ marginTop: 8 }}>
            {!rejected && m.decision !== 'shortlist' && <button type="button" className="btn line" disabled={pending} onClick={() => run(() => decideMatchAction(m.id, 'shortlist'), 'Uložené medzi kandidátov.')}>Kandidát</button>}
            {!rejected && <button type="button" className="btn line" disabled={pending} onClick={() => run(() => decideMatchAction(m.id, 'viewing', { verify: true }), 'Úloha na overenie dostupnosti a obhliadky vytvorená.')}>Overiť dostupnosť a obhliadku</button>}
            {!rejected && <><input type="datetime-local" value={vw} onChange={(e) => setVw(e.target.value)} aria-label="Dátum obhliadky" style={{ padding: '8px 10px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><button type="button" className="btn line" disabled={pending || !vw} onClick={() => run(() => recordViewingAction(m.id, { at: new Date(vw).toISOString() }), 'Obhliadka zapísaná.')}>Zapísať obhliadku</button></>}
            {!rejected ? <button type="button" className="btn line" onClick={() => setRejOpen(!rejOpen)}>Zamietnuť</button> : <button type="button" className="btn line" disabled={pending} onClick={() => run(() => decideMatchAction(m.id, 'open'), 'Vrátené na posúdenie.')}>Vrátiť na posúdenie</button>}
          </div>
        )}
        {rejOpen && <div className="iv-actions" style={{ marginTop: 6 }}><input value={rej} onChange={(e) => setRej(e.target.value)} placeholder="Dôvod zamietnutia (povinný)" style={{ flex: '1 1 220px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><button type="button" className="btn" disabled={pending || !rej.trim()} onClick={() => run(() => decideMatchAction(m.id, 'rejected', { reason: rej }), 'Zamietnuté. Dôvod sa uchoval.', () => setRejOpen(false))}>Potvrdiť zamietnutie</button></div>}
      </div>
      <div />
    </div>
  )
}

export default function InquiryDetail({ d, serverNow }) {
  const { q, lead, matches, props, offers, tasks, events, people } = d
  const [edit, setEdit] = useState(false), [sel, setSel] = useState({}), [task, setTask] = useState({ title: '', due: '' }), [ai, setAi] = useState(true)
  const { run, pending, msg, setMsg, router } = useAct()
  const pBy = useMemo(() => Object.fromEntries(props.map((p) => [p.id, p])), [props])
  const mk = (cat) => matches.filter((m) => m.category === cat && pBy[m.property_id] && !pBy[m.property_id].merged_into)
  const good = mk('match').filter((m) => m.decision !== 'rejected'), rejected = mk('match').filter((m) => m.decision === 'rejected'), outside = mk('outside'), gone = mk('unavailable')
  const picked = good.filter((m) => sel[m.id]).map((m) => m.id)
  const b = budgetSummary(q)
  const confirmedDays = q.last_confirmed_at ? Math.floor((serverNow - Date.parse(q.last_confirmed_at)) / 864e5) : null
  const card = (m) => <MatchCard key={m.id} m={m} p={pBy[m.property_id]} q={q} sel={!!sel[m.id]} toggleSel={() => setSel({ ...sel, [m.id]: !sel[m.id] })} run={run} pending={pending} />
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card">
        <div className="iv-head"><div><h1>{q.label || 'Investičný dopyt'}</h1><p className="iv-sub">{lead ? <Link href={`/crm/lead/${lead.id}`}>{lead.name}</Link> : 'Kontakt'} · {inqStatusLabel(q.status)} · zodpovedá {(q.owner_email || '').split('@')[0] || '—'} · zdroj: {q.source || '—'}</p></div>
          <div className="iv-actions"><select value={q.status} onChange={(e) => run(() => updateInquiryAction(q.id, { status: e.target.value }), 'Stav dopytu zmenený.')} aria-label="Stav dopytu">{INQ_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select><button type="button" className="btn line" disabled={pending} onClick={() => run(() => confirmInquiryAction(q.id), 'Záujem klienta potvrdený.')}>Záujem potvrdený dnes</button><button type="button" className="btn" onClick={() => setEdit(!edit)}>{edit ? 'Zavrieť úpravu' : 'Upraviť dopyt'}</button></div></div>
        <dl className="iv-kv" style={{ marginTop: 10 }}>
          <dt>Rozpočet</dt><dd>{b.text}{b.ambiguous && <span className="iv-pill warn" style={{ marginLeft: 8 }}>význam sumy nepotvrdený</span>}</dd>
          <dt>Lokalita</dt><dd>{[(q.cities || []).join(', ') || 'neznáma', (q.excluded_areas || []).length ? `bez: ${q.excluded_areas.join(', ')}` : null].filter(Boolean).join(' · ')}</dd>
          <dt>Nehnuteľnosť</dt><dd>{[(q.types || []).join('/'), (q.rooms || []).length ? `${q.rooms.join('/')}-izb.` : null, q.area_min || q.area_max ? `${q.area_min || '…'}–${q.area_max || '…'} m²` : null].filter(Boolean).join(' · ') || 'neurčené'}</dd>
          <dt>Posledné potvrdenie záujmu</dt><dd>{q.last_confirmed_at ? `${fmtDate(q.last_confirmed_at)} (pred ${confirmedDays} d)` : <span className="iv-unknown">nepotvrdené</span>}</dd>
          {q.next_step && <><dt>Ďalší krok</dt><dd>{q.next_step}{q.next_due ? ` · do ${fmtDate(q.next_due)}` : ''}</dd></>}
        </dl>
      </section>
      {edit && <section className="card"><h2>Upraviť dopyt</h2><InquiryForm inquiry={q} people={people} onDone={() => setEdit(false)} /></section>}
      <section className="card">
        <div className="iv-head"><h2>Vhodné nehnuteľnosti ({good.length})</h2>
          <div className="iv-actions">
            <Link className={`btn line${picked.length < 2 ? ' disabled' : ''}`} aria-disabled={picked.length < 2} href={picked.length >= 2 ? `/investicie/porovnanie?q=${q.id}&ids=${picked.map((id) => matches.find((m) => m.id === id).property_id).join(',')}` : '#'} onClick={(e) => { if (picked.length < 2) e.preventDefault() }}>Porovnať vybrané ({picked.length})</Link>
            <label className="iv-tag"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> AI úvod</label>
            <button type="button" className="btn" disabled={pending || !picked.length || picked.length > 6} onClick={() => run(() => prepareOfferAction(q.id, picked, { ai }), 'Návrh ponuky pripravený na kontrolu.', (r) => router.push(`/investicie/ponuka/${r.id}`))}>Pripraviť návrh ponuky ({picked.length})</button>
          </div></div>
        <p className="iv-hint">Povinné podmienky sa vyhodnotia vždy ako prvé; až potom sa zoraďuje podľa preferencií a ekonomiky. Prekročený rozpočet nikdy nie je medzi vhodnými. Čo sa nedá overiť, je označené otáznikom.</p>
        <div style={{ display: 'grid', gap: 10 }}>{good.map(card)}{!good.length && <p className="iv-hint">Zatiaľ žiadna nehnuteľnosť nespĺňa povinné podmienky.</p>}</div>
      </section>
      {outside.length > 0 && <section className="card"><h2>Alternatívy mimo podmienok ({outside.length})</h2><p className="iv-hint">Nespĺňajú aspoň jednu povinnú podmienku (napr. rozpočet). Zobrazujú sa samostatne a nikdy sa nezamiešajú medzi vhodné.</p><details><summary style={{ cursor: 'pointer', fontWeight: 800 }}>Zobraziť</summary><div style={{ display: 'grid', gap: 10, marginTop: 8 }}>{outside.slice(0, 40).map(card)}</div></details></section>}
      {rejected.length > 0 && <section className="card"><h2>Zamietnuté ({rejected.length})</h2><div style={{ display: 'grid', gap: 10 }}>{rejected.map(card)}</div></section>}
      {gone.length > 0 && <section className="card"><h2>Už nedostupné (história, {gone.length})</h2><div style={{ display: 'grid', gap: 10 }}>{gone.map(card)}</div></section>}
      {offers.length > 0 && <section className="card"><h2>Návrhy ponúk</h2>{offers.map((o) => <div key={o.id} className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '6px 0' }}><span>{fmtDateTime(o.created_at)} · {o.match_ids.length} nehn. · <span className={`iv-pill ${o.status === 'draft' ? 'warn' : 'ok'}`}>{o.status === 'draft' ? 'na kontrolu' : o.status === 'reviewed' ? 'skontrolovaná' : 'odoslaná používateľom'}</span></span><Link href={`/investicie/ponuka/${o.id}`} className="btn line">Otvoriť</Link></div>)}</section>}
      <section className="card"><h2>Úlohy</h2>
        {tasks.map((t) => <div key={t.id} className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '6px 0' }}><span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}{t.due ? ` · do ${fmtDate(t.due)}` : ''}</span>{t.status === 'open' && <button type="button" className="btn line" disabled={pending} onClick={() => run(() => completeTaskAction(t.id), 'Hotovo.')}>Hotovo</button>}</div>)}
        <div className="iv-actions" style={{ marginTop: 8 }}><input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Nová úloha" style={{ flex: '1 1 200px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><input type="date" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><button type="button" className="btn" disabled={pending || !task.title.trim()} onClick={() => run(() => addTaskAction({ inquiry_id: q.id, title: task.title, due: task.due || null }), 'Úloha pridaná.', () => setTask({ title: '', due: '' }))}>Pridať</button></div>
      </section>
      <section className="card"><h2>História</h2><ul className="iv-hint" style={{ margin: 0, paddingLeft: 18 }}>{events.map((e) => <li key={e.id}>{fmtDateTime(e.at)} · {describeEvent(e)}</li>)}</ul></section>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
