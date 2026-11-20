'use client'
import { useState } from 'react'
import { setTaskPayAction, cancelTaskAction } from '@/app/upratovanie/actions'
import { distanceKm, fmtKm, dayLabelLong, taskView, STATUS_LABEL, payForTask, fmtEur, PAY_SOURCE_LABEL, centsToInput } from '@/lib/cl-core'
import { assignWarnings, recommend, dayLoad, avatarColor } from '@/lib/cl-plan'
import { useRun, Msg, Pill } from './ui'
import Modal from './Modal'

/** Detail jedného upratovania v bočnom paneli: kto upratuje (odporúčané hore), základné info, cena a zrušenie. */
export default function TaskDrawer({ task, data, staffList, tasks, demo, busy, onAssign, onClose }) {
  const flat = data.flats[task.listing_id] || {}
  const v = taskView(task)
  const { pending, msg, run } = useRun()
  const [pay, setPay] = useState(centsToInput(task.pay_override_cents))
  const [more, setMore] = useState(false)
  const cleaner = data.staff.find((s) => s.email === task.cleaner_email)
  const p = payForTask(task, cleaner, flat)
  const locked = task.status === 'done' || task.status === 'cancelled'
  const rec = recommend({ task, staffList, flat, tasks }, 3)
  const recSet = new Set(rec.map((r) => r.s.email))
  const rest = staffList.filter((s) => !recSet.has(s.email))
  const row = (s, km, warn) => (
    <button key={s.email} type="button" className={'up-pick' + (task.cleaner_email === s.email ? ' on' : '') + (warn && warn.length ? ' warn' : '')} disabled={busy || demo || locked || (task.status === 'in_progress' && task.cleaner_email !== s.email)} onClick={() => onAssign(task.id, s.email)} title={warn && warn.length ? warn.join(' ') : ''}>
      <i style={{ background: avatarColor(s.email) }} aria-hidden="true">{s.name.slice(0, 1)}</i>
      <span><b>{s.name}</b><small>{dayLoad(tasks, s.email, task.date, task.id)} / {s.max_per_day} v ten deň{km != null ? ` · ${fmtKm(km)}` : ' · bez adresy'}{warn && warn.length ? ' · ⚠ ' + warn[0] : ''}</small></span>
      {task.cleaner_email === s.email && <em>priradená</em>}
    </button>
  )
  return (
    <Modal title={task.listing_name} onClose={onClose} side>
      <div className="up-tags"><Pill tone={task.status}>{STATUS_LABEL[task.status]}</Pill><Pill>{dayLabelLong(task.date)}</Pill>{task.manual && <Pill tone="info">ručná úloha</Pill>}{task.problem_text && <Pill tone="prob">⚠ problém</Pill>}</div>
      <p className="up-meta">{v.people != null ? `👥 ${v.people} hostí` : ''}{v.capsuleCount ? ` · ☕ ${v.capsuleCount} kapsúl` : ''}{flat.est_minutes ? ` · ~${flat.est_minutes} min` : ''}</p>
      {flat.address && <p className="up-meta">📍 {flat.address}{flat.city ? ', ' + flat.city : ''}</p>}
      {v.note && <p className="up-meta">📝 {v.note}</p>}
      {task.problem_text && <p className="up-alert">{task.problem_text}</p>}
      {task.cleaner_note && <p className="up-meta">💬 {task.cleaner_note}</p>}

      <h3 className="up-sub">Kto upratuje</h3>
      {task.cleaner_email && !locked && <button type="button" className="up-pick none" disabled={busy || demo || task.status === 'in_progress'} onClick={() => onAssign(task.id, '')}><span><b>Zrušiť priradenie</b><small>vrátiť medzi nepriradené</small></span></button>}
      {rec.length > 0 && !locked && <><p className="up-hint">Odporúčané (bez konfliktu, najbližšie):</p>{rec.map((r) => row(r.s, r.km, []))}</>}
      {rec.length === 0 && !locked && <p className="up-hint">Nikto nemá voľnú kapacitu bez upozornenia. Môžeš vybrať aj tak.</p>}
      {!locked && rest.length > 0 && <button type="button" className="up-link" onClick={() => setMore(!more)}>{more ? 'Skryť ostatné' : `Ostatné upratovačky (${rest.length})`}</button>}
      {(more || locked) && rest.map((s) => row(s, distanceKm(s, flat), assignWarnings({ task, staff: s, flat, tasks })))}
      {task.assign_reason && <p className="up-hint">Naposledy: {task.assign_reason}</p>}

      <h3 className="up-sub">Cena práce</h3>
      <div className="up-pay"><b>{fmtEur(p.cents)}</b> <small>({PAY_SOURCE_LABEL[p.source]}{p.minutes ? `, ${p.minutes} min` : ''})</small></div>
      <div className="up-row"><input aria-label="Upraviť sumu v eurách" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="ručná suma €" /><button className="btn o" disabled={pending || demo} onClick={() => run(() => setTaskPayAction(task.id, pay), { ok: 'Suma uložená.' })}>Uložiť sumu</button></div>
      {task.status === 'todo' && <div className="up-row"><button className="btn o" disabled={pending || demo} onClick={() => { if (confirm('Zrušiť túto úlohu?')) run(() => cancelTaskAction(task.id, 'zrušené manažérom'), { ok: 'Úloha je zrušená.', then: onClose }) }}>Zrušiť úlohu</button></div>}
      <Msg msg={msg} />
    </Modal>
  )
}
