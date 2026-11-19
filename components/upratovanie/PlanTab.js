'use client'
import { useMemo, useState } from 'react'
import { assignAction, proposeAction, applyProposalAction, setTaskPayAction } from '@/app/upratovanie/actions'
import { distanceKm, fmtKm, dayLabel, weekDays, addDays, taskView, STATUS_LABEL, payForTask, fmtEur, PAY_SOURCE_LABEL, centsToInput } from '@/lib/cl-core'
import { useRun, Msg, Pill } from './ui'

const ICON = { todo: '○', in_progress: '◐', done: '●', cancelled: '✕' }

export default function PlanTab({ data, today, date, demo }) {
  const days = useMemo(() => weekDays(date), [date])
  const staff = data.staff.filter((s) => s.role === 'cleaner' && s.active)
  const [open, setOpen] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [opts, setOpts] = useState({ rotation: 0.5, balance: 0.5 })
  const { pending, msg, run } = useRun()
  const live = data.tasks.filter((t) => t.status !== 'cancelled')
  const inWeek = live.filter((t) => t.date >= days[0] && t.date <= days[6])
  const unassigned = inWeek.filter((t) => !t.cleaner_email)
  const byCell = (email, day) => inWeek.filter((t) => (t.cleaner_email || '') === email && t.date === day)
  const todays = live.filter((t) => t.date === today)
  const problems = live.filter((t) => t.problem_text && t.date >= addDays(today, -7))
  const task = open ? data.tasks.find((t) => t.id === open) : null
  const done = (n) => todays.filter((t) => t.status === n).length

  const propose = () => run(() => proposeAction({ date, from: days[0], to: days[6], options: opts }), { then: (r) => setProposal(r) })
  const apply = () => run(() => applyProposalAction(proposal.assignments), { ok: 'Priradenie je uložené.', then: () => setProposal(null) })

  return (
    <div className="up-wrap">
      <div className="up-stats">
        <div className="up-stat"><span>Dnes</span><b>{todays.length}</b><small>{done('done')} hotových · {done('in_progress')} prebieha · {done('todo')} čaká</small></div>
        <div className={'up-stat' + (unassigned.length ? ' warn' : '')}><span>Nepriradené (týždeň)</span><b>{unassigned.length}</b><small>{unassigned.length ? 'treba priradiť' : 'všetko priradené'}</small></div>
        <div className={'up-stat' + (problems.length ? ' red' : '')}><span>Hlásené problémy</span><b>{problems.length}</b><small>za posledných 7 dní</small></div>
        <div className="up-stat"><span>Upratovačky</span><b>{staff.length}</b><small>aktívne</small></div>
      </div>

      <nav className="up-weeknav" aria-label="Týždeň">
        <a className="btn o" href={`?tab=plan&d=${addDays(days[0], -7)}`}>← Predošlý</a>
        <a className="btn o" href={`?tab=plan&d=${today}`}>Tento týždeň</a>
        <b>{dayLabel(days[0])} – {dayLabel(days[6])}</b>
        <a className="btn o" href={`?tab=plan&d=${addDays(days[0], 7)}`}>Ďalší →</a>
      </nav>

      <section className="up-panel">
        <div className="up-row">
          <h2>Návrh priradenia podľa adresy</h2>
          <button className="btn" disabled={pending || demo || !unassigned.length} onClick={propose}>{pending ? 'Počítam…' : `Navrhnúť pre ${unassigned.length} nepriradených`}</button>
        </div>
        <p className="up-hint">Appka priradí byty podľa vzdialenosti od bydliska, limitov každej upratovačky (koľko bytov za deň a týždeň), voľných dní, uprednostnených lokalít a rotácie. Nič sa neuloží, kým návrh nepotvrdíš; každý riadok môžeš zmeniť.</p>
        <div className="up-sliders">
          <label>Rotácia: {Math.round(opts.rotation * 100)} %<input type="range" min="0" max="1" step="0.1" value={opts.rotation} onChange={(e) => setOpts({ ...opts, rotation: Number(e.target.value) })} /></label>
          <label>Vyrovnanie záťaže: {Math.round(opts.balance * 100)} %<input type="range" min="0" max="1" step="0.1" value={opts.balance} onChange={(e) => setOpts({ ...opts, balance: Number(e.target.value) })} /></label>
        </div>
        <Msg msg={msg} />
        {proposal && (
          <div className="up-proposal">
            <table>
              <thead><tr><th>Deň</th><th>Byt</th><th>Upratovačka</th><th>Prečo</th></tr></thead>
              <tbody>
                {proposal.assignments.map((a, i) => (
                  <tr key={a.task_id}>
                    <td>{dayLabel(a.date)}</td><td>{a.flat}</td>
                    <td>
                      <select value={a.email} onChange={(e) => { const s = staff.find((x) => x.email === e.target.value); const next = proposal.assignments.slice(); next[i] = { ...a, email: s.email, name: s.name, reason: 'ručne zmenené v návrhu', km: null }; setProposal({ ...proposal, assignments: next }) }}>
                        {staff.map((s) => <option key={s.email} value={s.email}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="up-why">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {proposal.unassigned.length > 0 && (
              <div className="up-unas"><b>Nepodarilo sa priradiť ({proposal.unassigned.length}):</b>
                <ul>{proposal.unassigned.map((u) => <li key={u.task_id}>{dayLabel(u.date)} · {u.flat}: {u.reason}</li>)}</ul>
              </div>
            )}
            <div className="up-row">
              <button className="btn" disabled={pending || !proposal.assignments.length} onClick={apply}>Potvrdiť a priradiť ({proposal.assignments.length})</button>
              <button className="btn o" onClick={() => setProposal(null)}>Zahodiť návrh</button>
            </div>
          </div>
        )}
      </section>

      <section className="up-panel">
        <h2>Týždenný plán: kto kde upratuje</h2>
        <div className="up-gridwrap">
          <table className="up-grid">
            <thead><tr><th>Upratovačka</th>{days.map((d) => <th key={d} className={d === today ? 'today' : ''}>{dayLabel(d)}</th>)}</tr></thead>
            <tbody>
              <tr className="un"><th>Nepriradené</th>{days.map((d) => <td key={d}>{byCell('', d).map((t) => <Chip key={t.id} t={t} flats={data.flats} onClick={() => setOpen(t.id)} on={open === t.id} />)}</td>)}</tr>
              {staff.map((s) => {
                const weekCount = inWeek.filter((t) => t.cleaner_email === s.email).length
                return (
                  <tr key={s.email}>
                    <th><span>{s.name}</span><small>{weekCount} / {s.max_per_week > 0 ? s.max_per_week : '∞'} týždeň · max {s.max_per_day} za deň</small></th>
                    {days.map((d) => {
                      const off = (s.days_off || []).includes(d) || (s.work_days && s.work_days.length && !s.work_days.includes(new Date(d + 'T12:00:00Z').getUTCDay() || 7))
                      const cell = byCell(s.email, d)
                      return <td key={d} className={off ? 'off' : cell.length > s.max_per_day ? 'over' : ''}>{off && !cell.length ? <em>voľno</em> : null}{cell.map((t) => <Chip key={t.id} t={t} flats={data.flats} onClick={() => setOpen(t.id)} on={open === t.id} />)}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {task && <TaskPanel key={task.id} task={task} data={data} staff={staff} demo={demo} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Chip({ t, flats, onClick, on }) {
  const v = taskView(t)
  return (
    <button type="button" className={'up-chip s-' + t.status + (on ? ' on' : '') + (t.problem_text ? ' prob' : '')} onClick={onClick} title={t.listing_name}>
      <i aria-hidden="true">{ICON[t.status]}</i><span>{t.listing_name}</span>
      <small>{v.people != null ? `👥 ${v.people}` : ''}{v.capsuleCount ? ` · ☕ ${v.capsuleCount}` : ''}{t.problem_text ? ' · ⚠' : ''}</small>
    </button>
  )
}

export function TaskPanel({ task, data, staff, demo, onClose }) {
  const flat = data.flats[task.listing_id] || {}
  const v = taskView(task)
  const { pending, msg, run } = useRun()
  const [pay, setPay] = useState(centsToInput(task.pay_override_cents))
  const cleaner = data.staff.find((s) => s.email === task.cleaner_email)
  const p = payForTask(task, cleaner, flat)
  const ranked = staff.map((s) => ({ s, km: distanceKm(s, flat) })).sort((a, b) => (a.km == null) - (b.km == null) || a.km - b.km)
  const set = (email) => run(() => assignAction(task.id, email), { ok: email ? 'Priradené.' : 'Priradenie zrušené.' })
  return (
    <section className="up-panel up-task">
      <div className="up-row"><h2>{task.listing_name} · {dayLabel(task.date)}</h2><button className="btn o" onClick={onClose}>Zavrieť</button></div>
      <div className="up-tags">
        <Pill tone={task.status}>{STATUS_LABEL[task.status]}</Pill>
        {v.people != null && <Pill>👥 {v.people} hostí</Pill>}
        {v.capsules.map((c, i) => <Pill key={i}>☕ {c.type} × {c.n}</Pill>)}
        {task.problem_text && <Pill tone="prob">⚠ problém nahlásený</Pill>}
      </div>
      {flat.address && <p className="up-meta">📍 {flat.address}{flat.city ? ', ' + flat.city : ''}</p>}
      {v.note && <p className="up-meta">📝 Z Práčovne: {v.note}</p>}
      {task.problem_text && <p className="up-alert">{task.problem_text}</p>}
      {task.cleaner_note && <p className="up-meta">💬 Poznámka upratovačky: {task.cleaner_note}</p>}
      <label className="up-f"><span>Upratovačka</span>
        <select value={task.cleaner_email || ''} disabled={pending || demo || task.status === 'done'} onChange={(e) => set(e.target.value)}>
          <option value="">— nepriradené —</option>
          {ranked.map(({ s, km }) => <option key={s.email} value={s.email}>{s.name}{km != null ? ` · ${fmtKm(km)}` : ' · bez adresy'}</option>)}
        </select>
        <small>Zoradené podľa vzdialenosti od bydliska. {task.assign_reason ? `Naposledy: ${task.assign_reason}.` : ''}</small>
      </label>
      <div className="up-row">
        <div className="up-pay"><span>Cena práce:</span> <b>{fmtEur(p.cents)}</b> <small>({PAY_SOURCE_LABEL[p.source]}{p.minutes ? `, ${p.minutes} min` : ''})</small></div>
        <label className="up-f inline"><span>Upraviť sumu (€)</span><input inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="podľa sadzby" /></label>
        <button className="btn o" disabled={pending || demo} onClick={() => run(() => setTaskPayAction(task.id, pay), { ok: 'Suma uložená.' })}>Uložiť sumu</button>
      </div>
      <Msg msg={msg} />
    </section>
  )
}
