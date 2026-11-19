'use client'
import { useState } from 'react'
import { taskDetailAction, reopenAction } from '@/app/upratovanie/actions'
import { dayLabel, addDays, taskView, STATUS_LABEL, PHOTO_KIND_LABEL, progress } from '@/lib/cl-core'
import { useRun, Msg, Pill } from './ui'

const FILTERS = [['problems', 'Problémy'], ['done', 'Hotové'], ['in_progress', 'Prebieha'], ['all', 'Všetko']]

export default function ReviewTab({ data, today, demo }) {
  const [filter, setFilter] = useState('problems')
  const since = addDays(today, -7)
  const base = data.tasks.filter((t) => t.status !== 'cancelled' && t.date >= since && t.date <= today && t.cleaner_email)
  const list = base.filter((t) => (filter === 'all' ? true : filter === 'problems' ? !!t.problem_text : t.status === filter)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const name = (e) => (data.staff.find((s) => s.email === e) || {}).name || e
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Kontrola upratovania</h2>
        <p className="up-hint">Posledných 7 dní: čo upratovačky odfajkli, fotky pred a po, poznámky a nahlásené problémy. Nedoupratané môžeš vrátiť do práce.</p>
        <div className="up-seg" role="group" aria-label="Filter">
          {FILTERS.map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}{k === 'problems' ? ` (${base.filter((t) => t.problem_text).length})` : ''}</button>)}
        </div>
      </section>
      {list.length === 0 && <section className="up-panel"><p className="up-hint">Nič na zobrazenie.</p></section>}
      {list.map((t) => <ReviewRow key={t.id} t={t} who={name(t.cleaner_email)} photos={data.photoCount[t.id] || 0} demo={demo} />)}
    </div>
  )
}

function ReviewRow({ t, who, photos, demo }) {
  const [open, setOpen] = useState(false)
  const [det, setDet] = useState(null)
  const [reason, setReason] = useState('')
  const { pending, msg, run } = useRun()
  const v = taskView(t)
  const load = () => { setOpen(!open); if (!open && !det && !demo) run(() => taskDetailAction(t.id), { then: (r) => setDet(r) }) }
  const pr = det ? progress(det.items) : null
  return (
    <section className={'up-panel up-review' + (t.problem_text ? ' prob' : '')}>
      <button type="button" className="up-person-head" aria-expanded={open} onClick={load}>
        <b>{t.listing_name}</b><small>{dayLabel(t.date)} · {who}</small>
        <Pill tone={t.status}>{STATUS_LABEL[t.status]}</Pill>
        {t.problem_text && <Pill tone="prob">⚠ problém</Pill>}
        {photos > 0 && <Pill>📷 {photos}</Pill>}
      </button>
      {open && (
        <div className="up-detail">
          <div className="up-tags">{v.people != null && <Pill>👥 {v.people}</Pill>}{v.capsules.map((c, i) => <Pill key={i}>☕ {c.type} × {c.n}</Pill>)}</div>
          {t.problem_text && <p className="up-alert">{t.problem_text}</p>}
          {t.cleaner_note && <p className="up-meta">💬 {t.cleaner_note}</p>}
          <Msg msg={msg} />
          {demo && <p className="up-hint">V ukážkovom režime sa detail nenačítava.</p>}
          {det && (<>
            <p className="up-meta">Checklist: {pr.done} z {pr.n}</p>
            <ul className="up-items">{det.items.map((i) => <li key={i.id} className={i.done ? 'done' : ''}>{i.done ? '☑' : '☐'} {i.label}</li>)}</ul>
            {det.photos.length > 0 && <div className="up-photos">{det.photos.map((p) => p.url && <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={PHOTO_KIND_LABEL[p.kind]} loading="lazy" /><span>{PHOTO_KIND_LABEL[p.kind]}{p.note ? ': ' + p.note : ''}</span></a>)}</div>}
            <details><summary>História</summary><ul className="up-items">{det.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'short', timeStyle: 'short' })} · {e.event}</li>)}</ul></details>
          </>)}
          {(t.status === 'done' || t.status === 'in_progress') && (
            <div className="up-row">
              <input aria-label="Dôvod vrátenia" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Dôvod: čo treba dorobiť" />
              <button className="btn o" disabled={pending || demo || reason.trim().length < 2} onClick={() => run(() => reopenAction(t.id, reason), { ok: 'Vrátené do práce.' })}>Vrátiť do práce</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
