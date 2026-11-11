'use client'
import { useState } from 'react'
import { createInquiryAction, updateInquiryAction } from '@/app/investicie/actions'
import { INQ_STATUS, INQ_SOURCES, GOALS, RISK, BUDGET_KINDS, FEATURE_LABELS } from '@/lib/inv-core'
import { useAct, Toast } from './ui'

const sv = (v) => (v === null || v === undefined ? '' : String(v))
const tv = (v) => (v === true ? 'true' : v === false ? 'false' : '')
const join = (a) => (a || []).join(', ')
const TRI = [['', 'neznáme'], ['true', 'áno'], ['false', 'nie']]
export const initialInquiry = (q = {}) => ({ label: sv(q.label), status: q.status || 'new', source: q.source || 'CRM kontakt', owner_email: sv(q.owner_email), cities: join(q.cities), areas: join(q.areas), excluded_areas: join(q.excluded_areas), types: join(q.types), rooms: join(q.rooms), area_min: sv(q.area_min), area_max: sv(q.area_max), conditions: join(q.conditions), must: q.must || {}, prefer: q.prefer || {}, budget_total: sv(q.budget_total), budget_kind: q.budget_kind || '', equity: sv(q.equity), loan_planned: sv(q.loan_planned), price_cap: sv(q.price_cap), purchase_by: sv(q.purchase_by), reno_willing: tv(q.reno_willing), prep_budget: sv(q.prep_budget), goal: q.goal || '', target_yield_pct: sv(q.target_yield_pct), target_cashflow_month: sv(q.target_cashflow_month), risk: q.risk || '', wants_management: tv(q.wants_management), notes: sv(q.notes), next_step: sv(q.next_step), next_due: sv(q.next_due) })

/** Dopyt: povinné podmienky a preferencie oddelene; rozpočet s určením, čo suma znamená. Prázdne pole = neznáme. */
export default function InquiryForm({ leadId, inquiry = null, people = [], compact = false, onDone }) {
  const [f, setF] = useState(() => initialInquiry(inquiry || {}))
  const { run, pending, msg, setMsg } = useAct()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggle = (grp, k) => setF({ ...f, [grp]: { ...f[grp], [k]: !f[grp][k] } })
  const T = (k, label, ph = 'neznáme', cls) => <label className={cls}>{label}<input value={f[k]} onChange={set(k)} placeholder={ph} /></label>
  const tri = (k, label) => <label>{label}<select value={f[k]} onChange={set(k)}>{TRI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
  const budgetUnclear = f.budget_total !== '' && (f.budget_kind === '' || f.budget_kind === 'unknown')
  const submit = () => run(() => (inquiry ? updateInquiryAction(inquiry.id, f) : createInquiryAction(leadId, f)), (r) => (inquiry ? 'Dopyt uložený, zhody sa prepočítali.' : `Dopyt vytvorený. Nájdených zhôd: ${(r.matches && r.matches.created) || 0}.`), onDone)
  return (
    <div className="iv-form">
      {T('label', 'Názov dopytu', 'napr. Byt do 200 000 € v Bratislave', 'wide')}
      <label>Stav<select value={f.status} onChange={set('status')}>{INQ_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>Zdroj<select value={f.source} onChange={set('source')}>{INQ_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Zodpovedná osoba<select value={f.owner_email} onChange={set('owner_email')}><option value="">podľa vlastníka kontaktu</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name || p.email}</option>)}</select></label>
      <fieldset><legend>Rozpočet a financovanie</legend><div className="iv-form">
        {T('budget_total', 'Suma, ktorú klient povedal €', 'napr. 200000')}
        <label>Čo táto suma znamená?<select value={f.budget_kind} onChange={set('budget_kind')}><option value="">nezvolené (neznáme)</option>{BUDGET_KINDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
        {T('equity', 'Vlastné zdroje €')}{T('loan_planned', 'Plánovaný úver €')}{T('price_cap', 'Samostatný limit kúpnej ceny €')}{T('prep_budget', 'Rozpočet prípravy (rekonštrukcia, zariadenie…) €')}
        {budgetUnclear && <div className="iv-msg warn" style={{ gridColumn: '1/-1' }}>Nie je jasné, či suma je celková investícia alebo len vlastné zdroje. Kým to nepotvrdíš, rozpočet sa pri zhodách neoveruje (označí sa ako neznámy).</div>}
      </div></fieldset>
      <fieldset><legend>Lokalita a nehnuteľnosť</legend><div className="iv-form">
        {T('cities', 'Mestá (oddeľ čiarkou)', 'napr. Bratislava, Košice')}{T('areas', 'Preferované lokality / štvrte')}{T('excluded_areas', 'Vylúčené lokality')}
        {T('types', 'Typ: byt, dom', 'byt')}{T('rooms', 'Dispozícia (počet izieb)', 'napr. 2, 3')}{T('area_min', 'Min. výmera interiéru m²')}{T('area_max', 'Max. výmera interiéru m²')}{T('conditions', 'Stav (oddeľ čiarkou)', 'napr. po rekonštrukcii')}
      </div></fieldset>
      <fieldset><legend>Povinné podmienky (vylúčia) a preferencie (len zoradia)</legend><div className="iv-form">
        {Object.entries(FEATURE_LABELS).map(([k, t]) => <div key={k}><b style={{ fontSize: 13 }}>{t}</b><br /><label className="chk"><input type="checkbox" checked={!!f.must[k]} onChange={() => toggle('must', k)} /> povinné</label><label className="chk"><input type="checkbox" checked={!!f.prefer[k]} disabled={!!f.must[k]} onChange={() => toggle('prefer', k)} /> preferujem</label></div>)}
      </div></fieldset>
      <fieldset><legend>Cieľ, výnos a čas</legend><div className="iv-form">
        <label>Cieľ<select value={f.goal} onChange={set('goal')}><option value="">neznámy</option>{GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        {T('target_yield_pct', 'Očakávaný výnos % (z investície)')}{T('target_cashflow_month', 'Mesačné cashflow po splátkach €')}
        <label>Tolerancia rizika<select value={f.risk} onChange={set('risk')}><option value="">neznáma</option>{RISK.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label>Termín kúpy<input type="date" value={f.purchase_by} onChange={set('purchase_by')} /></label>
        {tri('reno_willing', 'Ochota rekonštruovať')}{tri('wants_management', 'Záujem o správu LIVE-IN')}
      </div></fieldset>
      <label className="wide">Poznámky<textarea value={f.notes} onChange={set('notes')} /></label>
      {T('next_step', 'Ďalší krok', 'napr. poslať výber do piatka', 'wide')}
      <label>Termín ďalšieho kroku<input type="date" value={f.next_due} onChange={set('next_due')} /></label>
      <div className="iv-actions" style={{ gridColumn: '1/-1' }}><button type="button" className="btn" disabled={pending} onClick={submit}>{inquiry ? 'Uložiť dopyt' : 'Vytvoriť dopyt'}</button>{!compact && <small className="iv-hint">Dopyt sa viaže na existujúci kontakt v CRM. Neznáme údaje nechaj prázdne.</small>}</div>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
