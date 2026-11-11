'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PROP_STATUS } from '@/lib/inv-core'
import { eur, pct1 } from '@/lib/inv-fmt'
import { fmtDate, fmtDateTime } from '@/lib/fmt'
import { STD_LABELS, ZONE_LABELS, ZONES } from '@/lib/inv-benchmarks'
import { updatePropertyAction, setPropertyStatusAction, confirmAvailabilityAction, mergePropertiesAction, dismissMergeAction, addTaskAction, completeTaskAction } from '@/app/investicie/actions'
import { useAct, Toast, StatusPill, FreshPill, statusTitle } from './ui'
import { describeEvent } from './describe'

const TRI = [['', 'neznáme'], ['true', 'áno'], ['false', 'nie']]
const s = (v) => (v === null || v === undefined ? '' : String(v))
const triV = (v) => (v === true ? 'true' : v === false ? 'false' : '')
const NUMF = [['rooms', 'Izby'], ['area_interior', 'Interiér m²'], ['area_exterior', 'Exteriér m²'], ['floor', 'Poschodie'], ['price', 'Cena €'], ['parking_price', 'Parkovanie mimo ceny €'], ['legal_costs', 'Právne a administratívne €'], ['reno', 'Rekonštrukcia €'], ['furnishing', 'Zariadenie €'], ['setup', 'Sprevádzkovanie €'], ['reserve', 'Rezerva €'], ['monthly_fixed', 'Mesačné náklady majiteľa €']]
const RENT = [['adr', 'Cena za noc (odhad) €'], ['occupancy', 'Obsadenosť %'], ['stay', 'Dĺžka pobytu (noci)'], ['clean', 'Upratovanie na pobyt €'], ['portal_pct', 'Poplatky portálov %'], ['ltr_rent', 'Nájomné dlhodobo €/mes.'], ['ltr_vacancy_pct', 'Neobsadenosť %'], ['ltr_management_pct', 'Správa %'], ['ltr_owner_costs', 'Náklady majiteľa €/mes.']]

function EditForm({ p, onDone }) {
  const [f, setF] = useState(() => ({ city: s(p.city), district: s(p.district), address: s(p.address), condition: s(p.condition), standard: s(p.standard), zone: s(p.zone), rental_mode: p.rental_mode || 'compare', seller: s(p.seller), parking_mandatory: triV(p.parking_mandatory), parking_in_price: triV(p.parking_in_price), commission_in_price: triV(p.commission_in_price), commission_pct: s(p.commission_pct), ...Object.fromEntries(NUMF.map(([k]) => [k, s(p[k])])), rental: Object.fromEntries(RENT.map(([k]) => [k, s((p.rental || {})[k])])) }))
  const { run, pending, msg, setMsg } = useAct()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const zones = ZONES[String(f.city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] || []
  return (
    <div className="iv-form">
      <label>Mesto<input value={f.city} onChange={set('city')} /></label><label>Štvrť<input value={f.district} onChange={set('district')} /></label><label>Ulica a číslo<input value={f.address} onChange={set('address')} /></label>
      <label>Stav nehnuteľnosti<input value={f.condition} onChange={set('condition')} /></label>
      <label>Zóna (kalkulačka)<select value={f.zone} onChange={set('zone')}><option value="">neznáma (predvolená zóna mesta)</option>{zones.map((z) => <option key={z.key} value={z.key}>{ZONE_LABELS[z.key] || z.key}</option>)}</select></label>
      <label>Štandard vybavenia<select value={f.standard} onChange={set('standard')}><option value="">neznámy (koeficient 1)</option>{Object.entries(STD_LABELS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label>Spôsob prenájmu<select value={f.rental_mode} onChange={set('rental_mode')}><option value="compare">Porovnanie</option><option value="str">Krátkodobý</option><option value="ltr">Dlhodobý</option></select></label>
      {NUMF.map(([k, t]) => <label key={k}>{t}<input inputMode="decimal" value={f[k]} placeholder="neznáme" onChange={set(k)} /></label>)}
      {[['parking_mandatory', 'Povinné parkovanie?'], ['parking_in_price', 'Parkovanie v cene?'], ['commission_in_price', 'Provízia RK v cene?']].map(([k, t]) => <label key={k}>{t}<select value={f[k]} onChange={set(k)}>{TRI.map(([v, x]) => <option key={v} value={v}>{x}</option>)}</select></label>)}
      <label>Provízia mimo ceny %<input inputMode="decimal" value={f.commission_pct} placeholder="neznáme" onChange={set('commission_pct')} /></label>
      <fieldset><legend>Odhad príjmov (prepíše hodnoty z portfólia; prázdne = použije sa základ z portfólia)</legend><div className="iv-form">{RENT.map(([k, t]) => <label key={k}>{t}<input inputMode="decimal" value={f.rental[k]} placeholder="—" onChange={(e) => setF({ ...f, rental: { ...f.rental, [k]: e.target.value } })} /></label>)}</div></fieldset>
      <label className="wide">Predajca / kontakt (interné)<input value={f.seller} onChange={set('seller')} /></label>
      <div className="iv-actions"><button type="button" className="btn" disabled={pending} onClick={() => run(() => updatePropertyAction(p.id, f), (r) => (r.unchanged ? 'Žiadna zmena.' : 'Uložené, výpočet a zhody sa prepočítali.'), onDone)}>Uložiť a prepočítať</button><small className="iv-hint">Ručne zadané polia agent neprepíše.</small></div>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}

export default function PropertyDetail({ d, calcNode, isAdmin }) {
  const { p, listings, hist, events, versions, tasks, candidates, matches, inqs, leads, fresh } = d
  const [edit, setEdit] = useState(false)
  const [status, setStatus] = useState(p.status), [note, setNote] = useState('')
  const [vp, setVp] = useState(''), [cnote, setCnote] = useState('')
  const [task, setTask] = useState({ title: '', due: '' })
  const { run, pending, msg, setMsg } = useAct()
  const leadName = (qid) => { const q = inqs.find((x) => x.id === qid); const l = q && leads.find((x) => x.id === q.lead_id); return `${(l && l.name) || 'Klient'}${q && q.label ? ' · ' + q.label : ''}` }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card">
        <div className="iv-head"><div><h1>{[p.address || p.district, p.city].filter(Boolean).join(', ') || 'Nehnuteľnosť'}</h1><p className="iv-sub">{[p.rooms ? `${p.rooms}-izbový ${p.type || 'byt'}` : p.type, p.area_interior ? `${String(p.area_interior).replace('.', ',')} m² interiér` : 'výmera neznáma', p.area_exterior ? `${String(p.area_exterior).replace('.', ',')} m² exteriér` : null, p.floor != null ? `${p.floor}. poschodie` : null, p.condition].filter(Boolean).join(' · ')}</p></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 26, fontWeight: 800 }}>{p.price != null ? eur(p.price) : <span className="iv-unknown">cena neznáma</span>}</div><div className="iv-actions" style={{ justifyContent: 'flex-end' }}><StatusPill status={p.status} /><FreshPill f={fresh} /></div></div></div>
        <p className="iv-hint" style={{ marginTop: 8 }}>{statusTitle(p.status)} {fresh.seller === 'never' ? 'Predajca dostupnosť zatiaľ nepotvrdil.' : `Predajca potvrdil dostupnosť ${fmtDate(p.last_confirmed_at)} (${p.last_confirmed_by || '—'}).`}{p.availability_note ? ` Poznámka: ${p.availability_note}` : ''}</p>
        <div className="iv-actions" style={{ marginTop: 10 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stav">{PROP_STATUS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poznámka k stavu (voliteľné)" style={{ flex: '1 1 200px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} />
          <button type="button" className="btn line" disabled={pending || status === p.status} onClick={() => run(() => setPropertyStatusAction(p.id, status, note), 'Stav zmenený, zhody prepočítané.')}>Zmeniť stav</button>
          <button type="button" className="btn" onClick={() => setEdit(!edit)}>{edit ? 'Zavrieť úpravu' : 'Doplniť / upraviť údaje'}</button>
        </div>
        <div className="iv-actions" style={{ marginTop: 8 }}>
          <select value={vp} onChange={(e) => setVp(e.target.value)} aria-label="Obhliadka"><option value="">Obhliadka: neznáma</option><option value="true">obhliadka možná</option><option value="false">obhliadka zatiaľ nie je možná</option></select>
          <input value={cnote} onChange={(e) => setCnote(e.target.value)} placeholder="Poznámka k potvrdeniu (kto, kedy)" style={{ flex: '1 1 200px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} />
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => confirmAvailabilityAction(p.id, { viewingPossible: vp === '' ? null : vp === 'true', note: cnote }), 'Dostupnosť potvrdená predajcom.')}>Predajca potvrdil dostupnosť</button>
        </div>
      </section>
      {edit && <section className="card"><h2>Doplniť a upraviť údaje</h2><EditForm p={p} onDone={() => setEdit(false)} /></section>}
      {candidates.map((c) => (
        <section key={c.id} className="card" style={{ borderColor: '#D98A00' }}>
          <h2>Možný duplikát (zhoda {c.score} %)</h2>
          <p className="iv-hint">{(c.reasons || []).join(', ')}. Druhá ponuka: {c.other ? <Link href={`/investicie/n/${c.other.id}`}>{[c.other.address || c.other.district, c.other.city].filter(Boolean).join(', ')} · {c.other.price ? eur(c.other.price) : '—'}</Link> : '—'}</p>
          <div className="iv-actions"><button type="button" className="btn" disabled={pending} onClick={() => run(() => mergePropertiesAction(p.id, c.other.id), 'Zlúčené. Zdroje a história sa zachovali.')}>Je to ten istý byt: zlúčiť (ponechať túto)</button><button type="button" className="btn line" disabled={pending} onClick={() => run(() => dismissMergeAction(c.id), 'Návrh zamietnutý.')}>Nie je to ten istý byt</button></div>
        </section>
      ))}
      <div className="iv-grid2">
        <section className="card"><h2>Výpočet a kvalita podkladov</h2>{calcNode}
          {versions.length > 1 && <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>História verzií výpočtu ({versions.length})</summary><ul className="iv-hint">{versions.map((v) => <li key={v.id}>v{v.version} · {fmtDateTime(v.created_at)} · kvalita {v.quality_score}/100{v.id === p.calc_id ? ' · aktuálna' : ''}</li>)}</ul></details>}
        </section>
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="card"><h2>Zdroje inzerátu</h2>
            {listings.map((l) => <div key={l.id} style={{ borderTop: '1px solid #173e2c14', padding: '8px 0' }}><b>{l.source_key}</b> <span className={`iv-pill ${l.state === 'active' ? 'ok' : 'muted'}`}>{l.state === 'active' ? 'na portáli' : l.state === 'removed' ? 'odstránený z portálu' : 'chyba'}</span>{l.missing_checks > 0 && l.state === 'active' ? <span className="iv-pill warn">chýba {l.missing_checks}×</span> : null}<br />{l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url.replace(/^https?:\/\//, '').slice(0, 60)}</a> : <small>bez odkazu</small>}<small className="iv-hint" style={{ display: 'block' }}>{l.price ? eur(l.price) : 'cena neznáma'} · prvýkrát {fmtDate(l.first_seen_at)} · kontrola {l.last_checked_at ? fmtDateTime(l.last_checked_at) : '—'}</small></div>)}
            {!listings.length && <p className="iv-hint">Žiadny zdrojový inzerát.</p>}
            <p className="iv-hint">Zmiznutý inzerát neznamená predané: stav sa zmení len na „stiahnuté“.</p>
          </section>
          <section className="card"><h2>História ceny</h2>
            {hist.length ? <table className="iv-table"><tbody>{hist.map((h, i) => <tr key={i}><td>{fmtDate(h.at)}</td><td className="r">{h.price ? eur(h.price) : '—'}</td><td><small>{h.source}</small></td></tr>)}</tbody></table> : <p className="iv-hint">Zatiaľ jeden záznam alebo žiadny.</p>}
          </section>
          <section className="card"><h2>Úlohy a poznámky</h2>
            {tasks.map((t) => <div key={t.id} className="iv-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '6px 0' }}><span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}{t.due ? ` · do ${fmtDate(t.due)}` : ''}</span>{t.status === 'open' && <button type="button" className="btn line" disabled={pending} onClick={() => run(() => completeTaskAction(t.id), 'Hotovo.')}>Hotovo</button>}</div>)}
            <div className="iv-actions" style={{ marginTop: 8 }}><input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Nová úloha (napr. overiť dostupnosť)" style={{ flex: '1 1 180px', padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><input type="date" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #173e2c2e', borderRadius: 12 }} /><button type="button" className="btn" disabled={pending || !task.title.trim()} onClick={() => run(() => addTaskAction({ property_id: p.id, title: task.title, due: task.due || null }), 'Úloha pridaná.', () => setTask({ title: '', due: '' }))}>Pridať</button></div>
            {p.seller && <p className="iv-hint">Predajca (interné): {p.seller}</p>}
          </section>
        </div>
      </div>
      <section className="card"><h2>Zhody s dopytmi klientov</h2>
        {matches.length ? <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Klient · dopyt</th><th>Zhoda</th><th className="r">Skóre</th><th>Rozhodnutie</th></tr></thead><tbody>{matches.map((m) => <tr key={m.id}><td><Link href={`/investicie/dopyt/${m.inquiry_id}`}>{leadName(m.inquiry_id)}</Link></td><td><span className={`iv-pill ${m.category === 'match' ? 'ok' : m.category === 'outside' ? 'warn' : 'muted'}`}>{m.category === 'match' ? 'vyhovuje' : m.category === 'outside' ? 'mimo podmienok' : 'nedostupná'}</span></td><td className="r">{m.score}</td><td>{m.decision}{m.decision_reason ? ` – ${m.decision_reason}` : ''}{m.needs_review ? ' · na opätovné posúdenie' : ''}</td></tr>)}</tbody></table></div> : <p className="iv-hint">Zatiaľ nie je žiadna zhoda s aktívnym dopytom.</p>}
      </section>
      <section className="card"><h2>História zmien</h2><ul className="iv-hint" style={{ margin: 0, paddingLeft: 18 }}>{events.map((e) => <li key={e.id}>{fmtDateTime(e.at)} · {describeEvent(e)}{e.user_email ? ` (${e.user_email.split('@')[0]})` : ''}</li>)}</ul></section>
      {p.notes_internal && <section className="card"><h2>Interné poznámky</h2><p style={{ whiteSpace: 'pre-wrap' }}>{p.notes_internal}</p></section>}
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
